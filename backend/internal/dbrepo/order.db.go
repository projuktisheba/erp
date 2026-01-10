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
			order.MemoNo,
			order.BranchID,
			order.CustomerID,
			models.ENTITY_CUSTOMER,
			order.PaymentAccountID,
			acctType,
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

func (r *OrderRepo) UpdateOrder(ctx context.Context, order *models.OrderDB) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// --------------------
	// Load existing order (for diff calculation)
	// --------------------
	var oldTotalAmount, oldReceivedAmount float64
	var oldTotalItems int64
	err = tx.QueryRow(ctx, `
		SELECT total_amount, received_amount, total_products
		FROM orders
		WHERE id = $1
		FOR UPDATE
	`, order.ID).Scan(&oldTotalAmount, &oldReceivedAmount, &oldTotalItems)
	if err != nil {
		return fmt.Errorf("load existing order failed: %w", err)
	}

	// --------------------
	// Basic validations
	// --------------------
	if len(order.Items) == 0 {
		return fmt.Errorf("order must contain at least one item")
	}
	if order.ReceivedAmount < 0 {
		return fmt.Errorf("received amount cannot be negative")
	}
	if order.ReceivedAmount > order.TotalAmount {
		return fmt.Errorf("received amount cannot exceed total amount")
	}

	// --------------------
	// Recalculate total items
	// --------------------
	order.TotalItems = 0
	for _, item := range order.Items {
		order.TotalItems += int64(item.Quantity)
	}

	// --------------------
	// Step 1: Update order header
	// --------------------
	_, err = tx.Exec(ctx, `
		UPDATE orders SET
			memo_no = $1,
			order_date = $2,
			delivery_date = $3,
			salesperson_id = $4,
			customer_id = $5,
			total_products = $6,
			delivered_products = $7,
			total_amount = $8,
			received_amount = $9,
			status = $10,
			notes = $11,
			updated_at = $12
		WHERE id = $13
	`,
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
		order.UpdatedAt,
		order.ID,
	)
	if err != nil {
		return fmt.Errorf("update order failed: %w", err)
	}

	// --------------------
	// Step 2: Replace order items
	// --------------------
	_, err = tx.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, order.ID)
	if err != nil {
		return fmt.Errorf("delete order items failed: %w", err)
	}

	for _, item := range order.Items {
		_, err := tx.Exec(ctx, `
			INSERT INTO order_items(order_id, product_id, quantity, subtotal)
			VALUES ($1,$2,$3,$4)
		`,
			order.ID,
			item.ProductID,
			item.Quantity,
			item.Subtotal,
		)
		if err != nil {
			return fmt.Errorf("insert order item failed: %w", err)
		}
	}

	// --------------------
	// Step 3: Update top sheet (delta)
	// --------------------
	itemDelta := order.TotalItems - oldTotalItems
	amountDelta := order.ReceivedAmount - oldReceivedAmount

	topSheet := &models.TopSheetDB{
		SheetDate:  order.OrderDate,
		BranchID:   order.BranchID,
		OrderCount: itemDelta,
	}

	if amountDelta != 0 {
		var acctType string
		err = tx.QueryRow(ctx,
			`SELECT type FROM accounts WHERE id=$1 AND branch_id=$2`,
			order.PaymentAccountID,
			order.BranchID,
		).Scan(&acctType)
		if err != nil {
			return fmt.Errorf("lookup account type failed: %w", err)
		}

		if acctType == models.ACCOUNT_BANK {
			topSheet.Bank = amountDelta
		} else {
			topSheet.Cash = amountDelta
		}
	}

	if err := SaveTopSheetTx(tx, ctx, topSheet); err != nil {
		return fmt.Errorf("update top sheet failed: %w", err)
	}

	// --------------------
	// Step 4: Payment transaction adjustment
	// --------------------
	if amountDelta != 0 {
		_, err := tx.Exec(ctx, `
			INSERT INTO order_transactions(
				order_id, transaction_date, payment_account_id, memo_no, delivered_by,
				quantity_delivered, amount, transaction_type
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`,
			order.ID,
			order.OrderDate,
			order.PaymentAccountID,
			order.MemoNo,
			order.SalespersonID,
			order.DeliveredItems,
			amountDelta,
			models.ADJUSTMENT,
		)
		if err != nil {
			return fmt.Errorf("insert payment adjustment failed: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE accounts
			SET current_balance = current_balance + $1
			WHERE id = $2
		`, amountDelta, order.PaymentAccountID)
		if err != nil {
			return fmt.Errorf("update account balance failed: %w", err)
		}
	}

	// --------------------
	// Step 5: Update customer due (delta)
	// --------------------
	oldDue := oldTotalAmount - oldReceivedAmount
	newDue := order.TotalAmount - order.ReceivedAmount
	dueDelta := newDue - oldDue

	if dueDelta != 0 {
		_, err := tx.Exec(ctx, `
			UPDATE customers
			SET due_amount = due_amount + $1
			WHERE id = $2
		`, dueDelta, order.CustomerID)
		if err != nil {
			return fmt.Errorf("update customer due failed: %w", err)
		}
	}

	// --------------------
	// Step 6: Update salesperson progress (delta)
	// --------------------
	progress := &models.SalespersonProgress{
		Date:       order.OrderDate,
		BranchID:   order.BranchID,
		EmployeeID: order.SalespersonID,
		OrderCount: itemDelta,
		SaleAmount: order.TotalAmount - oldTotalAmount,
	}

	if err := UpdateSalespersonProgressReportTx(tx, ctx, progress); err != nil {
		return fmt.Errorf("update salesperson progress failed: %w", err)
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
            o.salesperson_id, e.name AS salesperson_name,
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
			&o.SalespersonID, &o.Salesperson.Name,
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
			transaction_id,
			transaction_date,
			payment_account_id,
			memo_no,
			delivered_by,
			quantity_delivered,
			amount,
			transaction_type,
			created_at
		FROM order_transactions
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
