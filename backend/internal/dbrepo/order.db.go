package dbrepo

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
)

type OrderRepo struct {
	db *pgxpool.Pool
}

func NewOrderRepo(db *pgxpool.Pool) *OrderRepo {
	return &OrderRepo{db: db}
}

// CreateOrder inserts an order, its items, payment transaction,
// updates top sheet, customer due, and salesperson progress.
func (r *OrderRepo) CreateOrder(ctx context.Context, order *models.OrderDB) (int64, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// --------------------
	// Basic validations
	// --------------------
	if len(order.Items) == 0 {
		return 0, fmt.Errorf("order must contain at least one item")
	}
	if order.ReceivedAmount < 0 {
		return 0, fmt.Errorf("received amount cannot be negative")
	}
	if order.ReceivedAmount > order.TotalAmount {
		return 0, fmt.Errorf("received amount cannot exceed total amount")
	}

	// --------------------
	// Calculate total items
	// --------------------
	for _, item := range order.Items {
		order.TotalItems += int64(item.Quantity)
	}

	// --------------------
	// Step 1: Insert order
	// --------------------
	var orderID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO orders(
			branch_id, memo_no, order_date, delivery_date,
			salesperson_id, customer_id,
			total_products, delivered_products, total_amount, received_amount,
			status, notes, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		RETURNING id
	`,
		order.BranchID,
		order.MemoNo,
		order.OrderDate,
		order.DeliveryDate,
		order.SalespersonID,
		order.CustomerID,
		order.TotalItems,
		order.DeliveredItems,
		order.TotalAmount,
		order.ReceivedAmount,
		order.Status,
		order.Notes,
		order.CreatedAt,
		order.UpdatedAt,
	).Scan(&orderID)
	if err != nil {
		return 0, fmt.Errorf("insert order failed: %w", err)
	}

	// --------------------
	// Step 2: Insert order items
	// --------------------
	for _, item := range order.Items {
		_, err := tx.Exec(ctx, `
			INSERT INTO order_items(order_id, product_id, quantity, subtotal)
			VALUES ($1,$2,$3,$4)
		`,
			orderID,
			item.ProductID,
			item.Quantity,
			item.Subtotal,
		)
		if err != nil {
			return 0, fmt.Errorf("insert order item failed: %w", err)
		}
	}

	// --------------------
	// Step 3: Update top sheet
	// --------------------
	topSheet := &models.TopSheetDB{
		SheetDate:  order.OrderDate,
		BranchID:   order.BranchID,
		OrderCount: order.TotalItems, // total items ordered
	}

	var acctType string
	if order.ReceivedAmount > 0 {
		err = tx.QueryRow(ctx,
			`SELECT type FROM accounts WHERE id=$1 AND branch_id=$2`,
			order.PaymentAccountID,
			order.BranchID,
		).Scan(&acctType)
		if err != nil {
			return 0, fmt.Errorf("lookup account type failed: %w", err)
		}

		if acctType == models.ACCOUNT_BANK {
			topSheet.Bank = order.ReceivedAmount
		} else {
			topSheet.Cash = order.ReceivedAmount
		}
	}

	if err := SaveTopSheetTx(tx, ctx, topSheet); err != nil {
		return 0, fmt.Errorf("save top sheet failed: %w", err)
	}

	// --------------------
	// Step 4: Payment transactions
	// --------------------
	if order.ReceivedAmount > 0 {
		// lock account row
		_, err := tx.Exec(ctx,
			`SELECT id FROM accounts WHERE id=$1 FOR UPDATE`,
			order.PaymentAccountID,
		)
		if err != nil {
			return 0, fmt.Errorf("lock account failed: %w", err)
		}

		// 4a: order payment transaction
		_, err = tx.Exec(ctx, `
			INSERT INTO order_transactions(
				order_id, transaction_date, payment_account_id, memo_no, delivered_by, quantity_delivered,
				amount, transaction_type
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`,
			orderID,
			order.OrderDate,
			order.PaymentAccountID,
			order.MemoNo,
			order.SalespersonID,
			order.DeliveredItems,
			order.ReceivedAmount,
			models.ADVANCE_PAYMENT,
		)
		if err != nil {
			return 0, fmt.Errorf("insert payment transaction failed (4a): %w", err)
		}

		// 4b: global transaction log
		_, err = tx.Exec(ctx, `
			INSERT INTO transactions(
				transaction_date, memo_no, branch_id,
				from_entity_id, from_entity_type,
				to_entity_id, to_entity_type,
				amount, transaction_type, notes
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`,
			order.OrderDate,
			models.ORDER_MEMO_PREFIX+"-"+order.MemoNo,
			order.BranchID,
			order.CustomerID,
			models.ENTITY_CUSTOMER,
			order.PaymentAccountID,
			models.ENTITY_ACCOUNT,
			order.ReceivedAmount,
			models.ADVANCE_PAYMENT,
			"Advance payment from customer",
		)
		if err != nil {
			return 0, fmt.Errorf("insert transaction failed (4b): %w", err)
		}

		// 4c: update account balance
		_, err = tx.Exec(ctx, `
			UPDATE accounts
			SET current_balance = current_balance + $1
			WHERE id = $2
		`,
			order.ReceivedAmount,
			order.PaymentAccountID,
		)
		if err != nil {
			return 0, fmt.Errorf("update account balance failed: %w", err)
		}
	}

	// --------------------
	// Step 5: Update customer due
	// --------------------
	dueAmount := order.TotalAmount - order.ReceivedAmount
	if dueAmount > 0 {
		// lock customer row
		_, err := tx.Exec(ctx,
			`SELECT id FROM customers WHERE id=$1 FOR UPDATE`,
			order.CustomerID,
		)
		if err != nil {
			return 0, fmt.Errorf("lock customer failed: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE customers
			SET due_amount = due_amount + $1
			WHERE id = $2
		`,
			dueAmount,
			order.CustomerID,
		)
		if err != nil {
			return 0, fmt.Errorf("update customer due failed: %w", err)
		}
	}

	// --------------------
	// Step 6: Salesperson progress
	// --------------------
	salespersonProgress := &models.SalespersonProgress{
		Date:       order.OrderDate,
		BranchID:   order.BranchID,
		EmployeeID: order.SalespersonID,
		OrderCount: order.TotalItems,
		SaleAmount: order.TotalAmount,
	}

	if err := UpdateSalespersonProgressReportTx(tx, ctx, salespersonProgress); err != nil {
		return 0, fmt.Errorf("update salesperson progress failed: %w", err)
	}

	return orderID, tx.Commit(ctx)
}

// UpdateOrder updates an existing order and adjusts all dependent reports.
// It creates a "Revert Old" -> "Apply New" flow to handle changes in
// Customer, Salesperson, Dates, or Accounts safely.
func (r *OrderRepo) UpdateOrder(ctx context.Context, order, oldOrder *models.OrderDB) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// --------------------
	// 1. Basic Validations
	// --------------------
	if oldOrder.Status != models.ORDER_PENDING {
		return fmt.Errorf("only pending orders can be modified")
	}
	if len(order.Items) == 0 {
		return fmt.Errorf("order must contain at least one item")
	}
	if order.ReceivedAmount < 0 {
		return fmt.Errorf("received amount cannot be negative")
	}
	if order.ReceivedAmount > order.TotalAmount {
		return fmt.Errorf("received amount cannot exceed total amount")
	}

	// Recalculate total items for the new order state
	order.TotalItems = 0
	for _, item := range order.Items {
		order.TotalItems += int64(item.Quantity)
	}

	// --------------------
	// 2. Update Order Header
	// --------------------
	_, err = tx.Exec(ctx, `
		UPDATE orders SET
			memo_no = $1, order_date = $2, delivery_date = $3,
			salesperson_id = $4, customer_id = $5,
			total_products = $6, delivered_products = $7,
			total_amount = $8, received_amount = $9,
			notes = $10, updated_at = CURRENT_TIMESTAMP
		WHERE id = $11
	`,
		order.MemoNo, order.OrderDate, order.DeliveryDate,
		order.SalespersonID, order.CustomerID,
		order.TotalItems, order.DeliveredItems,
		order.TotalAmount, order.ReceivedAmount,
		order.Notes, order.ID,
	)
	if err != nil {
		return fmt.Errorf("update order header failed: %w", err)
	}

	// --------------------
	// 3. Replace Order Items
	// --------------------
	_, err = tx.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, order.ID)
	if err != nil {
		return fmt.Errorf("delete old items failed: %w", err)
	}

	for _, item := range order.Items {
		_, err := tx.Exec(ctx, `
			INSERT INTO order_items(order_id, product_id, quantity, subtotal)
			VALUES ($1,$2,$3,$4)
		`, order.ID, item.ProductID, item.Quantity, item.Subtotal)
		if err != nil {
			return fmt.Errorf("insert new item failed: %w", err)
		}
	}

	// =========================================================================
	// STRATEGY: "Undo" Old State -> "Apply" New State
	// This works perfectly even if CustomerID or SalespersonID changes.
	// =========================================================================

	// --------------------
	// 4. Handle Top Sheet (Daily Summary)
	// --------------------

	// 4a. Revert Old (Subtract from OLD Date)
	oldSheet := &models.TopSheetDB{
		SheetDate:  oldOrder.OrderDate,
		BranchID:   oldOrder.BranchID,
		OrderCount: -oldOrder.TotalItems, // Negative to subtract
	}
	// Determine old account type for Top Sheet
	if oldOrder.ReceivedAmount > 0 && len(oldOrder.OrderTransactions) > 0 {
		var oldAcctType string
		// Try to get account from old transaction, fallback to order struct
		acctID := oldOrder.OrderTransactions[0].PaymentAccountID

		err = tx.QueryRow(ctx, `SELECT type FROM accounts WHERE id=$1`, acctID).Scan(&oldAcctType)
		if err == nil {
			if oldAcctType == models.ACCOUNT_BANK {
				oldSheet.Bank = -oldOrder.ReceivedAmount
			} else {
				oldSheet.Cash = -oldOrder.ReceivedAmount
			}
		}
	}
	if err := SaveTopSheetTx(tx, ctx, oldSheet); err != nil {
		return fmt.Errorf("revert top sheet failed: %w", err)
	}

	// 4b. Apply New (Add to NEW Date)
	newSheet := &models.TopSheetDB{
		SheetDate:  order.OrderDate,
		BranchID:   order.BranchID,
		OrderCount: order.TotalItems,
	}
	var newAcctType string // Needed later for transaction logs too
	if order.ReceivedAmount > 0 {
		err = tx.QueryRow(ctx, `SELECT type FROM accounts WHERE id=$1`, order.PaymentAccountID).Scan(&newAcctType)
		if err != nil {
			return fmt.Errorf("lookup new account type failed: %w", err)
		}
		if newAcctType == models.ACCOUNT_BANK {
			newSheet.Bank = order.ReceivedAmount
		} else {
			newSheet.Cash = order.ReceivedAmount
		}
	}
	if err := SaveTopSheetTx(tx, ctx, newSheet); err != nil {
		return fmt.Errorf("apply top sheet failed: %w", err)
	}

	// --------------------
	// 5. Handle Salesperson Progress
	// --------------------

	// 5a. Revert Old Salesperson
	// We subtract the old stats from the OLD salesperson ID
	oldProgress := &models.SalespersonProgress{
		Date:       oldOrder.OrderDate,
		BranchID:   oldOrder.BranchID,
		EmployeeID: oldOrder.SalespersonID, // OLD ID
		OrderCount: -oldOrder.TotalItems,
		SaleAmount: -oldOrder.TotalAmount,
	}
	if err := UpdateSalespersonProgressReportTx(tx, ctx, oldProgress); err != nil {
		return fmt.Errorf("revert old salesperson progress failed: %w", err)
	}

	// 5b. Apply New Salesperson
	// We add the new stats to the NEW salesperson ID
	newProgress := &models.SalespersonProgress{
		Date:       order.OrderDate,
		BranchID:   order.BranchID,
		EmployeeID: order.SalespersonID, // NEW ID
		OrderCount: order.TotalItems,
		SaleAmount: order.TotalAmount,
	}
	if err := UpdateSalespersonProgressReportTx(tx, ctx, newProgress); err != nil {
		return fmt.Errorf("apply new salesperson progress failed: %w", err)
	}

	// --------------------
	// 6. Handle Customer Due
	// --------------------

	// 6a. Revert Old Customer Due
	// Remove the *Old Due* amount from the *Old Customer*
	oldDue := oldOrder.TotalAmount - oldOrder.ReceivedAmount
	if oldDue != 0 {
		_, err = tx.Exec(ctx, `
			UPDATE customers 
			SET due_amount = due_amount - $1 
			WHERE id = $2
		`, oldDue, oldOrder.CustomerID) // OLD Customer ID
		if err != nil {
			return fmt.Errorf("revert old customer due failed: %w", err)
		}
	}

	// 6b. Apply New Customer Due
	// Add the *New Due* amount to the *New Customer*
	newDue := order.TotalAmount - order.ReceivedAmount
	if newDue != 0 {
		_, err = tx.Exec(ctx, `
			UPDATE customers 
			SET due_amount = due_amount + $1 
			WHERE id = $2
		`, newDue, order.CustomerID) // NEW Customer ID
		if err != nil {
			return fmt.Errorf("apply new customer due failed: %w", err)
		}
	}

	// --------------------
	// 7. Handle Financials (Payments)
	// --------------------

	// 7a. Revert Old Payment (If existed)
	if oldOrder.ReceivedAmount > 0 && len(oldOrder.OrderTransactions) > 0 {
		oldAcctID := oldOrder.OrderTransactions[0].PaymentAccountID

		// Refund the money from the Old Account
		_, err = tx.Exec(ctx, `UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2`,
			oldOrder.ReceivedAmount, oldAcctID)
		if err != nil {
			return fmt.Errorf("revert old account balance failed: %w", err)
		}

		// Delete Old Logs
		_, err = tx.Exec(ctx, `DELETE FROM order_transactions WHERE order_id=$1 AND transaction_type=$2`,
			order.ID, models.ADVANCE_PAYMENT)
		if err != nil {
			return fmt.Errorf("delete old order tx failed: %w", err)
		}

		oldMemoStr := models.ORDER_MEMO_PREFIX + "-" + oldOrder.MemoNo
		_, err = tx.Exec(ctx, `DELETE FROM transactions WHERE memo_no=$1 AND branch_id=$2 AND transaction_type=$3`,
			oldMemoStr, oldOrder.BranchID, models.ADVANCE_PAYMENT)
		if err != nil {
			return fmt.Errorf("delete old global tx failed: %w", err)
		}
	}

	// 7b. Apply New Payment (If > 0)
	if order.ReceivedAmount > 0 {
		// Add money to New Account
		_, err = tx.Exec(ctx, `UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2`,
			order.ReceivedAmount, order.PaymentAccountID)
		if err != nil {
			return fmt.Errorf("update new account balance failed: %w", err)
		}

		// Insert New Logs
		_, err = tx.Exec(ctx, `
			INSERT INTO order_transactions(
				order_id, transaction_date, payment_account_id, memo_no, 
				delivered_by, quantity_delivered, amount, transaction_type
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`,
			order.ID, order.OrderDate, order.PaymentAccountID, order.MemoNo,
			order.SalespersonID, order.DeliveredItems, order.ReceivedAmount, models.ADVANCE_PAYMENT,
		)
		if err != nil {
			return fmt.Errorf("insert new order tx failed: %w", err)
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO transactions(
				transaction_date, memo_no, branch_id,
				from_entity_id, from_entity_type,
				to_entity_id, to_entity_type,
				amount, transaction_type, notes
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`,
			order.OrderDate, models.ORDER_MEMO_PREFIX+"-"+order.MemoNo, order.BranchID,
			order.CustomerID, models.ENTITY_CUSTOMER,
			order.PaymentAccountID, models.ENTITY_ACCOUNT,
			order.ReceivedAmount, models.ADVANCE_PAYMENT, "Advance payment (Updated)",
		)
		if err != nil {
			return fmt.Errorf("insert new global tx failed: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// OrderDelivery record an order delivery, payment transaction,
// updates top sheet, customer due.
func (r *OrderRepo) OrderDelivery(ctx context.Context, orderTx models.OrderTransactionDB, orderInfo models.OrderDB) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("ERROR_0: %w", err)
	}
	defer tx.Rollback(ctx)

	// --------------------
	// 1.  Basic validations
	// --------------------
	currentStatus := models.ORDER_DELIVERY
	dueAmount := orderInfo.TotalAmount - orderInfo.ReceivedAmount - orderTx.Amount
	if dueAmount < 0 {
		return fmt.Errorf("ERROR_1: received amount cannot exceed due amount")
	}

	remainingItems := orderInfo.TotalItems - orderInfo.DeliveredItems - orderTx.QuantityDelivered
	if remainingItems < 0 {
		return fmt.Errorf("ERROR_2: delivery quantity cannot exceed remaining quantity")
	}

	// update current status
	if dueAmount > float64(0) || remainingItems > 0 {
		currentStatus = models.ORDER_PARTIAL_DELIVERY
	}

	// --------------------
	// 2. Update Order Header
	// --------------------
	_, err = tx.Exec(ctx, `
		UPDATE orders SET
			delivered_products = delivered_products + $1,
			received_amount = received_amount + $2,
			status = $3,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $4
	`,
		orderTx.QuantityDelivered, orderTx.Amount, currentStatus, orderTx.OrderID,
	)
	if err != nil {
		return fmt.Errorf("ERROR_3: update order header failed: %w", err)
	}

	// --------------------
	// Step 3: Update top sheet
	// --------------------
	topSheet := &models.TopSheetDB{
		SheetDate: orderTx.TransactionDate,
		BranchID:  orderInfo.BranchID,
		Delivery:  orderTx.QuantityDelivered, // total items ordered
	}

	var acctType string
	if orderTx.Amount > 0 {
		err = tx.QueryRow(ctx,
			`SELECT type FROM accounts WHERE id=$1 AND branch_id=$2`,
			orderTx.PaymentAccountID,
			orderInfo.BranchID,
		).Scan(&acctType)
		if err != nil {
			return fmt.Errorf("ERROR_4: lookup account type failed: %w", err)
		}

		if acctType == models.ACCOUNT_BANK {
			topSheet.Bank = orderTx.Amount
		} else {
			topSheet.Cash = orderTx.Amount
		}
	}

	if err := SaveTopSheetTx(tx, ctx, topSheet); err != nil {
		return fmt.Errorf("ERROR_5: save top sheet failed: %w", err)
	}

	// --------------------
	// Step 4: Order Payment transactions
	// --------------------
	// lock account row
	_, err = tx.Exec(ctx,
		`SELECT id FROM accounts WHERE id=$1 FOR UPDATE`,
		orderTx.PaymentAccountID,
	)
	if err != nil {
		return fmt.Errorf("ERROR_6: lock account failed: %w", err)
	}

	// 4a: order payment transaction
	_, err = tx.Exec(ctx, `
			INSERT INTO order_transactions(
				order_id, transaction_date, payment_account_id, memo_no, delivered_by, quantity_delivered,
				amount, transaction_type
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`,
		orderTx.OrderID,
		orderTx.TransactionDate,
		orderTx.PaymentAccountID,
		orderTx.MemoNo,
		orderInfo.SalespersonID,
		orderTx.QuantityDelivered,
		orderTx.Amount,
		models.PAYMENT,
	)
	if err != nil {
		return fmt.Errorf("ERROR_7: insert payment transaction failed (4a): %w", err)
	}

	// --------------------
	// Step 5: Global Payment transactions
	// --------------------
	if orderTx.Amount > 0 {

		// 5a: global transaction log
		_, err = tx.Exec(ctx, `
			INSERT INTO transactions(
				transaction_date, memo_no, branch_id,
				from_entity_id, from_entity_type,
				to_entity_id, to_entity_type,
				amount, transaction_type, notes
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`,
			orderTx.TransactionDate,
			models.ORDER_MEMO_PREFIX+"-"+orderTx.MemoNo,
			orderInfo.BranchID,
			orderInfo.CustomerID,
			models.ENTITY_CUSTOMER,
			orderTx.PaymentAccountID,
			models.ENTITY_ACCOUNT,
			orderTx.Amount,
			models.PAYMENT,
			"Payment received upon delivery",
		)
		if err != nil {
			return fmt.Errorf("ERROR_8: insert transaction failed (4b): %w", err)
		}

		// 5b: update account balance
		_, err = tx.Exec(ctx, `
			UPDATE accounts
			SET current_balance = current_balance + $1
			WHERE id = $2
		`,
			orderTx.Amount,
			orderTx.PaymentAccountID,
		)
		if err != nil {
			return fmt.Errorf("ERROR_9: update account balance failed: %w", err)
		}

		// --------------------
		// Step 4d: Update customer due
		// --------------------

		// lock customer row
		_, err = tx.Exec(ctx,
			`SELECT id FROM customers WHERE id=$1 FOR UPDATE`,
			orderInfo.CustomerID,
		)
		if err != nil {
			return fmt.Errorf("ERROR_10: lock customer failed: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE customers
			SET due_amount = due_amount - $1
			WHERE id = $2
		`,
			orderTx.Amount,
			orderInfo.CustomerID,
		)
		if err != nil {
			return fmt.Errorf("ERROR_11: update customer due failed: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *OrderRepo) GetOrders(
	ctx context.Context,
	branchID int64,
	search string,
	status string,
	page int,
	limit int,
) ([]models.OrderDB, int, error) { // Returns (Data, TotalCount, Error)

	// 1. Prepare Base Query
	baseQuery := `
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        JOIN employees e ON e.id = o.salesperson_id
    `

	// 2. Build Conditions dynamically
	var conditions []string
	var args []interface{}
	argPos := 1

	// A. Branch Filter (Always Apply)
	conditions = append(conditions, fmt.Sprintf("o.branch_id = $%d", argPos))
	args = append(args, branchID)
	argPos++

	// B. Search Filter (Optional)
	search = strings.TrimSpace(search)
	if search != "" {
		// Use ILIKE with %...% for "Contains" search (better UX)
		searchTerm := "%" + search + "%"

		conditions = append(conditions, fmt.Sprintf(`
            (
                o.memo_no ILIKE $%d OR
                c.mobile ILIKE $%d OR
                c.name ILIKE $%d
            )
        `, argPos, argPos, argPos))

		// We use the same argument for all 4 placeholders
		args = append(args, searchTerm)
		argPos++
	}

	// C. Status Filter (Optional)
	if status != "" && status != "all" {
		conditions = append(conditions, fmt.Sprintf("o.status = $%d", argPos))
		args = append(args, status)
		argPos++
	}

	// Combine WHERE clause
	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	// ------------------------------------------
	// 3. Count Query (For Pagination)
	// ------------------------------------------
	var totalCount int
	countQuery := fmt.Sprintf("SELECT COUNT(*) %s %s", baseQuery, whereClause)

	// Note: We use the same 'args' for count as we do for the select
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("count orders failed: %w", err)
	}

	// ------------------------------------------
	// 4. Data Query (With Pagination)
	// ------------------------------------------
	if limit <= 0 {
		limit = 10
	}
	if page < 0 {
		page = 0
	}
	offset := page * limit

	dataQuery := fmt.Sprintf(`
        SELECT
            o.id, o.branch_id, o.memo_no, o.order_date, o.delivery_date,
            o.salesperson_id, e.name AS salesperson_name, e.mobile as salesperson_mobile,
            o.customer_id, c.name AS customer_name, c.mobile AS customer_mobile,
            o.total_products, o.delivered_products,
            o.total_amount, o.received_amount,
            o.status, o.notes, o.created_at, o.updated_at
        %s
        %s
        ORDER BY o.created_at DESC
        LIMIT $%d OFFSET $%d
    `, baseQuery, whereClause, argPos, argPos+1)

	// Add Limit/Offset to args
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query orders failed: %w", err)
	}
	defer rows.Close()

	// 5. Scan Rows
	orders := make([]models.OrderDB, 0)
	for rows.Next() {
		var o models.OrderDB
		// Ensure nested structs are initialized
		o.Customer = models.Customer{}
		o.Salesperson = models.Employee{}

		err := rows.Scan(
			&o.ID, &o.BranchID, &o.MemoNo, &o.OrderDate, &o.DeliveryDate,
			&o.SalespersonID, &o.Salesperson.Name, &o.Salesperson.Mobile,
			&o.CustomerID, &o.Customer.Name, &o.Customer.Mobile,
			&o.TotalItems, &o.DeliveredItems,
			&o.TotalAmount, &o.ReceivedAmount,
			&o.Status, &o.Notes, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		orders = append(orders, o)
	}

	return orders, totalCount, nil
}

func (r *OrderRepo) GetOrderDetailsByID(
	ctx context.Context,
	orderID int64,
) (*models.OrderDB, error) {

	var order models.OrderDB
	order.Customer = models.Customer{}
	order.Salesperson = models.Employee{}

	// ------------------------------------------------
	// 1. Fetch order + customer + salesperson
	// ------------------------------------------------
	err := r.db.QueryRow(ctx, `
		SELECT
			o.id,
			o.branch_id,
			o.memo_no,
			o.order_date,
			o.delivery_date,
			o.salesperson_id,
			e.name AS salesperson_name,
			e.mobile AS salesperson_mobile,
			o.customer_id,
			c.name AS customer_name,
			c.mobile AS customer_mobile,
			o.total_products,
			o.delivered_products,
			o.total_amount,
			o.received_amount,
			o.status,
			o.notes,
			o.created_at,
			o.updated_at
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN employees e ON e.id = o.salesperson_id
		WHERE o.id = $1
	`, orderID).Scan(
		&order.ID,
		&order.BranchID,
		&order.MemoNo,
		&order.OrderDate,
		&order.DeliveryDate,
		&order.SalespersonID,
		&order.Salesperson.Name,
		&order.Salesperson.Mobile,
		&order.CustomerID,
		&order.Customer.Name,
		&order.Customer.Mobile,
		&order.TotalItems,
		&order.DeliveredItems,
		&order.TotalAmount,    // float64
		&order.ReceivedAmount, // float64
		&order.Status,
		&order.Notes,
		&order.CreatedAt,
		&order.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("order not found")
		}
		return nil, fmt.Errorf("fetch order failed: %w", err)
	}

	order.Customer.ID = order.CustomerID
	order.Salesperson.ID = order.SalespersonID

	// ------------------------------------------------
	// 2. Fetch order items + products
	// ------------------------------------------------
	itemRows, err := r.db.Query(ctx, `
		SELECT
			oi.product_id,
			p.product_name,
			oi.quantity,
			oi.subtotal
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1
		ORDER BY p.product_name
	`, orderID)
	if err != nil {
		return nil, fmt.Errorf("fetch order items failed: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var it models.OrderItemDB
		if err := itemRows.Scan(
			&it.ProductID,
			&it.ProductName,
			&it.Quantity,
			&it.Subtotal, // float64
		); err != nil {
			return nil, err
		}
		order.Items = append(order.Items, it)
	}

	// ------------------------------------------------
	// 3. Fetch order transactions (FIXED)
	// ------------------------------------------------
	txRows, err := r.db.Query(ctx, `
		SELECT
			t.transaction_id,
			t.transaction_date,
			COALESCE(t.payment_account_id, 0) AS payment_account_id,
			COALESCE(a.name, 'N/A') AS payment_account_name,
			t.memo_no,
			t.delivered_by,
			t.quantity_delivered,
			t.amount,
			t.transaction_type,
			t.created_at
		FROM order_transactions t
		LEFT JOIN accounts a ON(a.id=t.payment_account_id)
		WHERE order_id = $1
		ORDER BY created_at ASC
	`, orderID)
	if err != nil {
		return nil, fmt.Errorf("fetch order transactions failed: %w", err)
	}
	defer txRows.Close()

	for txRows.Next() {
		var t models.OrderTransactionDB
		if err := txRows.Scan(
			&t.TransactionID,
			&t.TransactionDate,
			&t.PaymentAccountID,
			&t.PaymentAccountName,
			&t.MemoNo,
			&t.DeliveredBy,
			&t.QuantityDelivered,
			&t.Amount,
			&t.TransactionType,
			&t.CreatedAt,
		); err != nil {
			return nil, err
		}
		order.OrderTransactions = append(order.OrderTransactions, t)
	}

	return &order, nil
}
