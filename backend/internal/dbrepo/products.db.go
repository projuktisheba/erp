package dbrepo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type ProductRepo struct {
	db *pgxpool.Pool
}

func NewProductRepo(db *pgxpool.Pool) *ProductRepo {
	return &ProductRepo{db: db}
}

// ============================== PRODUCT OPERATIONS ==============================

// GetProducts fetches all products by branch
// (V2)
func (s *ProductRepo) GetProducts(ctx context.Context, branchID int64) ([]*models.Product, error) {
	query := `
        SELECT 
            id, product_name, quantity, created_at, updated_at
        FROM products
        WHERE branch_id = $1
        ORDER BY id;
    `
	rows, err := s.db.Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("error fetching products: %w", err)
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.ProductName, &p.CurrentStockLevel, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("error scanning product: %w", err)
		}
		products = append(products, &p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}
	return products, nil
}

// ============================== ADD PRODUCTS TO STOCK ==============================
// RestockProducts increments stock quantities for given products and logs the operation.
// (V2)
func (s *ProductRepo) RestockProducts(
	ctx context.Context,
	date time.Time,
	memoNo string,
	branchID int64,
	products []models.Product,
) (string, error) {

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}

	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if len(products) == 0 {
		return "", fmt.Errorf("no products provided for restock")
	}

	// Generate next memo number if not provided
	if memoNo == "" {
		memoNo = utils.GenerateMemoNo()
	}

	// --------------------
	// Update stock + insert registry rows
	// --------------------
	for _, item := range products {

		if item.Quantity <= 0 {
			return "", fmt.Errorf("invalid restock quantity for product %d", item.ID)
		}

		// Update product stock (lock row to avoid race)
		res, err := tx.Exec(ctx, `
			UPDATE products
			SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2;
		`, item.Quantity, item.ID)

		if err != nil {
			return "", fmt.Errorf("update stock for product %d: %w", item.ID, err)
		}

		if res.RowsAffected() == 0 {
			return "", fmt.Errorf("product not found: %d", item.ID)
		}

		// Log in product_stock_registry
		_, err = tx.Exec(ctx, `
			INSERT INTO product_stock_registry (
				memo_no, stock_date, branch_id, product_id, quantity, created_at
			) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP);
		`, memoNo, date, branchID, item.ID, item.Quantity)

		if err != nil {
			return "", fmt.Errorf("insert stock registry for product %d: %w", item.ID, err)
		}
	}

	// --------------------
	// Commit
	// --------------------
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit tx: %w", err)
	}

	committed = true
	return memoNo, nil
}

// DeleteStockProducts reduce stock quantities for given products and remove corresponded logs.
// (V2)
func (s *ProductRepo) DeleteStockProducts(ctx context.Context, stockID, branchID int64) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	// --------------------
	// Load old data (lock row)
	// --------------------
	var productID, productQuantity int64
	err = tx.QueryRow(ctx, `
		SELECT product_id, quantity
		FROM product_stock_registry
		WHERE id=$1 AND branch_id=$2
		FOR UPDATE
	`, stockID, branchID).Scan(&productID, &productQuantity)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("stock registry not found: %d", stockID)
		}
		return fmt.Errorf("load stock registry: %w", err)
	}

	if productQuantity <= 0 {
		return fmt.Errorf("invalid stock quantity: %d", productQuantity)
	}

	// --------------------
	// Update stock (prevent negative)
	// --------------------
	res, err := tx.Exec(ctx, `
		UPDATE products
		SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2;
	`, productQuantity, productID)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23514" && pgErr.ConstraintName == "products_quantity_non_negative" {
				return fmt.Errorf("insufficient stock for product %d", productID)
			}
		}
		return fmt.Errorf("update stock for product %d: %w", productID, err)
	}

	if res.RowsAffected() == 0 {
		return fmt.Errorf("insufficient stock for product %d", productID)
	}

	// --------------------
	// Delete registry row
	// --------------------
	res, err = tx.Exec(ctx, `
		DELETE FROM product_stock_registry
		WHERE id=$1 AND branch_id=$2
	`, stockID, branchID)

	if err != nil {
		return fmt.Errorf("delete stock registry: %w", err)
	}

	if res.RowsAffected() == 0 {
		return fmt.Errorf("stock registry not found during delete: %d", stockID)
	}

	// --------------------
	// Commit
	// --------------------
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	committed = true
	return nil
}

// GetProductStockReportByDateRange retrieves stock registry records
// with pagination, total counts, and quantity summation.
func (s *ProductRepo) GetProductStockReportByDateRange(
	ctx context.Context,
	branchID int64,
	startDate, endDate time.Time,
	search string,
	page, limit int64,
) ([]*models.ProductStockRegistry, int64, *models.StockReportTotals, error) {

	var records []*models.ProductStockRegistry
	totals := &models.StockReportTotals{}
	var totalCount int64

	// --- 1. BUILD BASE QUERY & ARGS ---
	// We construct the FROM and WHERE clauses first since they are shared
	baseQuery := `
		FROM product_stock_registry AS psr
		INNER JOIN products AS p ON psr.product_id = p.id
		WHERE psr.branch_id = $1
		  AND psr.stock_date BETWEEN $2 AND $3
	`
	// Initial args: $1=branchID, $2=startDate, $3=endDate
	args := []interface{}{branchID, startDate, endDate}
	argCounter := 4 // Next available placeholder index

	// Add Search Condition if exists
	if search != "" {
		// Use the current argCounter ($4) for both ILIKE clauses
		baseQuery += fmt.Sprintf(" AND (p.product_name ILIKE $%d OR psr.memo_no ILIKE $%d)", argCounter, argCounter)
		args = append(args, "%"+search+"%")
		argCounter++ // <--- IMPORTANT: Increment counter so LIMIT uses the next index ($5)
	}

	// --- 2. QUERY TOTALS (Count & Sum Quantity) ---
	// Note: We use the baseQuery (which includes filters) but without LIMIT/OFFSET
	totalsQuery := `
		SELECT 
			COUNT(*),
			COALESCE(SUM(psr.quantity), 0)
	` + baseQuery

	err := s.db.QueryRow(ctx, totalsQuery, args...).Scan(&totalCount, &totals.TotalQuantity)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("failed to fetch stock totals: %w", err)
	}

	// --- 3. QUERY DATA (Paginated) ---
	offset := (page - 1) * limit

	// Construct the final data query with ORDER BY, LIMIT, and OFFSET
	// We use argCounter for LIMIT and argCounter+1 for OFFSET
	dataQuery := `
		SELECT 
			psr.id,
			psr.memo_no,
			psr.stock_date,
			psr.branch_id,
			psr.product_id,
			p.product_name,
			psr.quantity,
			psr.created_at,
			psr.updated_at
	` + baseQuery + fmt.Sprintf(" ORDER BY psr.stock_date ASC, psr.id ASC LIMIT $%d OFFSET $%d", argCounter, argCounter+1)

	// Append Limit and Offset to args
	args = append(args, limit, offset)

	rows, err := s.db.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("failed to fetch stock report: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r models.ProductStockRegistry
		if err := rows.Scan(
			&r.ID,
			&r.MemoNo,
			&r.StockDate,
			&r.BranchID,
			&r.ProductID,
			&r.ProductName,
			&r.Quantity,
			&r.CreatedAt,
			&r.UpdatedAt,
		); err != nil {
			return nil, 0, nil, fmt.Errorf("failed to scan row: %w", err)
		}
		records = append(records, &r)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, nil, fmt.Errorf("row iteration error: %w", err)
	}

	return records, totalCount, totals, nil
}

// ============================== SALE TRANSACTIONS ==============================
// SaleProducts records a sale and updates stock, accounts, and reports
// // (V2)
// Start a database transaction.
// Validate sale items and received amount.
// Generate memo number if missing.
// Reduce product stock for each sold item.
// Calculate total number of sold items.
// Insert main sale record and get sale ID.
// Insert all sale items linked to the sale.
// Prepare daily top-sheet data for the sale date.
// Determine payment account type (cash/bank).
// Update top-sheet cash or bank amount.
// Save or update the top-sheet record.
// Lock payment account row if payment exists.
// Insert sale payment transaction record.
// Insert global transaction ledger entry.
// Update payment account balance.
// Calculate customer due amount.
// Lock customer row if due exists.
// Update customer due balance.
// Update salesperson daily progress report.
// Commit the transaction and return sale ID.
func (r *ProductRepo) SaleProducts(ctx context.Context, sale *models.SaleDB) (int64, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}

	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	// --------------------
	// Basic validations
	// --------------------
	if len(sale.Items) == 0 {
		return 0, fmt.Errorf("sale must contain at least one item")
	}
	if sale.ReceivedAmount < 0 {
		return 0, fmt.Errorf("received amount cannot be negative")
	}
	if sale.ReceivedAmount > sale.TotalAmount {
		return 0, fmt.Errorf("received amount cannot exceed total amount")
	}
	if sale.ReceivedAmount > 0 && sale.PaymentAccountID == 0 {
		return 0, fmt.Errorf("payment account is required when received amount > 0")
	}

	if sale.MemoNo == "" {
		sale.MemoNo = utils.GenerateMemoNo()
	}

	// --------------------
	// Step 0: Reduce stock & calculate total items
	// --------------------
	sale.TotalItems = 0

	for _, item := range sale.Items {
		res, err := tx.Exec(ctx, `
			UPDATE products
			SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 AND quantity >= $1;
		`, item.Quantity, item.ProductID)
		if err != nil {
			return 0, fmt.Errorf("update stock: %w", err)
		}

		if res.RowsAffected() == 0 {
			return 0, fmt.Errorf("insufficient stock for product %d", item.ProductID)
		}

		sale.TotalItems += int64(item.Quantity)
	}

	// --------------------
	// Step 1: Insert sale
	// --------------------
	var saleID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO sales(
			branch_id, memo_no, sale_date,
			salesperson_id, customer_id,
			total_products, total_amount, received_amount,
			status, notes, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id
	`,
		sale.BranchID,
		sale.MemoNo,
		sale.SaleDate,
		sale.SalespersonID,
		sale.CustomerID,
		sale.TotalItems,
		sale.TotalAmount,
		sale.ReceivedAmount,
		models.SALE_DELIVERY,
		sale.Notes,
		sale.CreatedAt,
		sale.UpdatedAt,
	).Scan(&saleID)
	if err != nil {
		return 0, fmt.Errorf("insert sale failed: %w", err)
	}

	// --------------------
	// Step 2: Insert sale items
	// --------------------
	for _, item := range sale.Items {
		_, err := tx.Exec(ctx, `
			INSERT INTO sale_items(sale_id, product_id, quantity, subtotal)
			VALUES ($1,$2,$3,$4)
		`,
			saleID,
			item.ProductID,
			item.Quantity,
			item.Subtotal,
		)
		if err != nil {
			return 0, fmt.Errorf("insert sale item failed: %w", err)
		}
	}

	// --------------------
	// Step 3: Update top sheet
	// --------------------
	topSheet := &models.TopSheetDB{
		SheetDate:   sale.SaleDate,
		BranchID:    sale.BranchID,
		SalesAmount: sale.TotalAmount,
		ReadyMade:   sale.TotalItems,
	}

	var acctType string
	if sale.ReceivedAmount > 0 {
		err = tx.QueryRow(ctx,
			`SELECT type FROM accounts WHERE id=$1 AND branch_id=$2`,
			sale.PaymentAccountID,
			sale.BranchID,
		).Scan(&acctType)
		if err != nil {
			return 0, fmt.Errorf("lookup account type failed: %w", err)
		}

		if acctType == models.ACCOUNT_BANK {
			topSheet.Bank = sale.ReceivedAmount
		} else {
			topSheet.Cash = sale.ReceivedAmount
		}
	}

	if err := SaveTopSheetTx(tx, ctx, topSheet); err != nil {
		return 0, fmt.Errorf("save top sheet failed: %w", err)
	}

	// --------------------
	// Step 4: Payment transactions
	// --------------------
	if sale.ReceivedAmount > 0 {
		var dummy int64
		err := tx.QueryRow(ctx,
			`SELECT id FROM accounts WHERE id=$1 FOR UPDATE`,
			sale.PaymentAccountID,
		).Scan(&dummy)
		if err != nil {
			return 0, fmt.Errorf("lock account failed: %w", err)
		}

		// 4a: sale payment transaction
		_, err = tx.Exec(ctx, `
			INSERT INTO sale_transactions(
				sale_id, transaction_date, payment_account_id, memo_no,
				delivered_by, quantity_delivered, amount, transaction_type
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`,
			saleID,
			sale.SaleDate,
			sale.PaymentAccountID,
			sale.MemoNo,
			sale.SalespersonID,
			sale.TotalItems,
			sale.ReceivedAmount,
			models.PAYMENT,
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
			sale.SaleDate,
			models.SALE_MEMO_PREFIX+"-"+sale.MemoNo,
			sale.BranchID,
			sale.CustomerID,
			models.ENTITY_CUSTOMER,
			sale.PaymentAccountID,
			models.ENTITY_ACCOUNT,
			sale.ReceivedAmount,
			models.PAYMENT,
			"Received payment on sale",
		)
		if err != nil {
			return 0, fmt.Errorf("insert transaction failed (4b): %w", err)
		}

		// 4c: update account balance
		res, err := tx.Exec(ctx, `
			UPDATE accounts
			SET current_balance = current_balance + $1
			WHERE id = $2
		`,
			sale.ReceivedAmount,
			sale.PaymentAccountID,
		)
		if err != nil {
			return 0, fmt.Errorf("update account balance failed: %w", err)
		}
		if res.RowsAffected() == 0 {
			return 0, fmt.Errorf("account not found: %d", sale.PaymentAccountID)
		}
	}

	// --------------------
	// Step 5: Update customer due
	// --------------------
	dueAmount := sale.TotalAmount - sale.ReceivedAmount
	if dueAmount > 0 {
		var dummy int64
		err := tx.QueryRow(ctx,
			`SELECT id FROM customers WHERE id=$1 FOR UPDATE`,
			sale.CustomerID,
		).Scan(&dummy)
		if err != nil {
			return 0, fmt.Errorf("lock customer failed: %w", err)
		}

		res, err := tx.Exec(ctx, `
			UPDATE customers
			SET due_amount = due_amount + $1
			WHERE id = $2
		`,
			dueAmount,
			sale.CustomerID,
		)
		if err != nil {
			return 0, fmt.Errorf("update customer due failed: %w", err)
		}
		if res.RowsAffected() == 0 {
			return 0, fmt.Errorf("customer not found: %d", sale.CustomerID)
		}
	}

	// --------------------
	// Step 6: Salesperson progress
	// --------------------
	salespersonProgress := &models.EmployeeProgressDB{
		SheetDate:  sale.SaleDate,
		BranchID:   sale.BranchID,
		EmployeeID: sale.SalespersonID,
		SaleAmount: sale.TotalAmount,
	}

	if _, err := UpdateEmployeeProgressReportTx(tx, ctx, salespersonProgress); err != nil {
		return 0, fmt.Errorf("update salesperson progress failed: %w", err)
	}

	// --------------------
	// Commit
	// --------------------
	err = tx.Commit(ctx)
	if err != nil {
		return 0, err
	}
	committed = true

	return saleID, nil
}

// ============================== UPDATE SALE TRANSACTIONS ==============================
// UpdateSale updates an existing sale and adjusts all dependent reports.
// It creates a "Revert Old" -> "Apply New" flow to handle changes in
// Customer, Salesperson, Dates, or Accounts safely.
func (r *ProductRepo) UpdateSale(ctx context.Context, sale, oldSale *models.SaleDB) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	// --------------------
	// 1. Validations
	// --------------------
	if oldSale.Status == models.SALE_RETURNED {
		return fmt.Errorf("Returned sales can't be modified")
	}
	if len(sale.Items) == 0 {
		return fmt.Errorf("sale must contain at least one item")
	}
	if sale.ReceivedAmount < 0 || sale.ReceivedAmount > sale.TotalAmount {
		return fmt.Errorf("invalid received amount")
	}

	// --------------------
	// 2. Restore OLD stock
	// --------------------
	for _, item := range oldSale.Items {
		_, err = tx.Exec(ctx, `
			UPDATE products
			SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2;
		`, item.Quantity, item.ProductID)
		if err != nil {
			return fmt.Errorf("restore stock failed: %w", err)
		}
	}

	// --------------------
	// 3. Apply NEW stock
	// --------------------
	sale.TotalItems = 0
	for _, item := range sale.Items {
		_, err = tx.Exec(ctx, `
			UPDATE products
			SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2;
		`, item.Quantity, item.ProductID)
		if err != nil {
			if strings.Contains(err.Error(), "products_quantity_non_negative") {
				return fmt.Errorf("insufficient stock for product %d", item.ProductID)
			}
		}
		sale.TotalItems += int64(item.Quantity)
	}

	// --------------------
	// 4. Update sale header
	// --------------------
	_, err = tx.Exec(ctx, `
		UPDATE sales SET
			memo_no=$1, sale_date=$2,
			salesperson_id=$3, customer_id=$4,
			total_products=$5, total_amount=$6,
			received_amount=$7, notes=$8,
			updated_at=CURRENT_TIMESTAMP
		WHERE id=$9
	`, sale.MemoNo, sale.SaleDate,
		sale.SalespersonID, sale.CustomerID,
		sale.TotalItems, sale.TotalAmount,
		sale.ReceivedAmount, sale.Notes,
		sale.ID,
	)
	if err != nil {
		return fmt.Errorf("update sale failed: %w", err)
	}

	// --------------------
	// 5. Replace sale items
	// --------------------
	_, err = tx.Exec(ctx, `DELETE FROM sale_items WHERE sale_id=$1`, sale.ID)
	if err != nil {
		return err
	}

	for _, item := range sale.Items {
		_, err = tx.Exec(ctx, `
			INSERT INTO sale_items(sale_id, product_id, quantity, subtotal)
			VALUES ($1,$2,$3,$4)
		`, sale.ID, item.ProductID, item.Quantity, item.Subtotal)
		if err != nil {
			return err
		}
	}

	// --------------------
	// 6. Top Sheet
	// --------------------
	oldSheet := &models.TopSheetDB{
		SheetDate:   oldSale.SaleDate,
		BranchID:    oldSale.BranchID,
		SalesAmount: -oldSale.TotalAmount,
		ReadyMade:   -oldSale.TotalItems,
	}
	var acctType string
	if oldSale.ReceivedAmount > 0 {
		err = tx.QueryRow(ctx,
			`SELECT type FROM accounts WHERE id=$1 AND branch_id=$2`,
			oldSale.SaleTransactions[0].PaymentAccountID,
			oldSale.BranchID,
		).Scan(&acctType)
		if err != nil {
			return fmt.Errorf("lookup account type failed: %w", err)
		}

		if acctType == models.ACCOUNT_BANK {
			oldSheet.Bank = -oldSale.ReceivedAmount
		} else {
			oldSheet.Cash = -oldSale.ReceivedAmount
		}
	}
	newSheet := &models.TopSheetDB{
		SheetDate:   sale.SaleDate,
		BranchID:    sale.BranchID,
		SalesAmount: sale.TotalAmount,
		ReadyMade:   sale.TotalItems,
	}

	if sale.ReceivedAmount > 0 {
		err = tx.QueryRow(ctx,
			`SELECT type FROM accounts WHERE id=$1 AND branch_id=$2`,
			sale.PaymentAccountID,
			sale.BranchID,
		).Scan(&acctType)
		if err != nil {
			return fmt.Errorf("lookup account type failed: %w", err)
		}

		if acctType == models.ACCOUNT_BANK {
			newSheet.Bank = sale.ReceivedAmount
		} else {
			newSheet.Cash = sale.ReceivedAmount
		}
	}
	if err := SaveTopSheetTx(tx, ctx, oldSheet); err != nil {
		return err
	}
	if err := SaveTopSheetTx(tx, ctx, newSheet); err != nil {
		return err
	}

	// --------------------
	// 7. Customer Due
	// --------------------
	oldDue := oldSale.TotalAmount - oldSale.ReceivedAmount
	newDue := sale.TotalAmount - sale.ReceivedAmount
	deltaDue := newDue - oldDue

	if deltaDue != 0 {
		_, err = tx.Exec(ctx,
			`UPDATE customers SET due_amount = due_amount + $1 WHERE id=$2`,
			deltaDue, sale.CustomerID)
		if err != nil {
			return err
		}
	}

	// --------------------
	// 8. Accounts & Transaction
	// --------------------
	if oldSale.ReceivedAmount > 0 {
		_, err = tx.Exec(ctx,
			`UPDATE accounts SET current_balance = current_balance - $1 WHERE id=$2`,
			oldSale.ReceivedAmount, oldSale.PaymentAccountID)
		if err != nil {
			return err
		}

		_, _ = tx.Exec(ctx, `DELETE FROM sale_transactions WHERE sale_id=$1`, sale.ID)
		_, _ = tx.Exec(ctx, `DELETE FROM transactions WHERE memo_no=$1`,
			models.SALE_MEMO_PREFIX+"-"+oldSale.MemoNo)
	}

	if sale.ReceivedAmount > 0 {
		_, err = tx.Exec(ctx,
			`UPDATE accounts SET current_balance = current_balance + $1 WHERE id=$2`,
			sale.ReceivedAmount, sale.PaymentAccountID)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO sale_transactions(
				sale_id, transaction_date, payment_account_id,
				memo_no, delivered_by, quantity_delivered,
				amount, transaction_type
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`,
			sale.ID, sale.SaleDate, sale.PaymentAccountID,
			sale.MemoNo, sale.SalespersonID,
			sale.TotalItems, sale.ReceivedAmount, models.PAYMENT)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO transactions(
				transaction_date, memo_no, branch_id,
				from_entity_id, from_entity_type,
				to_entity_id, to_entity_type,
				amount, transaction_type, notes
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`,
			sale.SaleDate,
			models.SALE_MEMO_PREFIX+"-"+sale.MemoNo,
			sale.BranchID,
			sale.CustomerID,
			models.ENTITY_CUSTOMER,
			sale.PaymentAccountID,
			models.ENTITY_ACCOUNT,
			sale.ReceivedAmount,
			models.PAYMENT,
			"Received payment on sale",
		)
		if err != nil {
			return fmt.Errorf("insert transaction failed (4b): %w", err)
		}

	}

	// --------------------
	// 9. Salesperson progress
	// --------------------
	oldSalespersonProgress := &models.EmployeeProgressDB{
		SheetDate:  oldSale.SaleDate,
		BranchID:   oldSale.BranchID,
		EmployeeID: oldSale.SalespersonID,
		SaleAmount: -oldSale.TotalAmount,
	}

	if _, err := UpdateEmployeeProgressReportTx(tx, ctx, oldSalespersonProgress); err != nil {
		return fmt.Errorf("update salesperson progress failed: %w", err)
	}
	newSalespersonProgress := &models.EmployeeProgressDB{
		SheetDate:  sale.SaleDate,
		BranchID:   sale.BranchID,
		EmployeeID: sale.SalespersonID,
		SaleAmount: sale.TotalAmount,
	}

	if _, err := UpdateEmployeeProgressReportTx(tx, ctx, newSalespersonProgress); err != nil {
		return fmt.Errorf("update salesperson progress failed: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	committed = true
	return nil
}

// ============================== SALE RETRIEVAL ==============================
// GetSaleDetailsByID retrieves a sale info and details
// (V2)
func (r *ProductRepo) GetSaleDetailsByID(
	ctx context.Context,
	saleID int64,
) (*models.SaleDB, error) {

	var sale models.SaleDB
	sale.Customer = models.Customer{}
	sale.Salesperson = models.Employee{}

	// ------------------------------------------------
	// 1. Fetch sale + customer + salesperson
	// ------------------------------------------------
	err := r.db.QueryRow(ctx, `
		SELECT
			o.id,
			o.branch_id,
			o.memo_no,
			o.sale_date,
			o.salesperson_id,
			e.name AS salesperson_name,
			e.mobile AS salesperson_mobile,
			o.customer_id,
			c.name AS customer_name,
			c.mobile AS customer_mobile,
			o.total_products,
			o.total_amount,
			o.received_amount,
			o.status,
			o.notes,
			o.created_at,
			o.updated_at
		FROM sales o
		JOIN customers c ON c.id = o.customer_id
		JOIN employees e ON e.id = o.salesperson_id
		WHERE o.id = $1
	`, saleID).Scan(
		&sale.ID,
		&sale.BranchID,
		&sale.MemoNo,
		&sale.SaleDate,
		&sale.SalespersonID,
		&sale.Salesperson.Name,
		&sale.Salesperson.Mobile,
		&sale.CustomerID,
		&sale.Customer.Name,
		&sale.Customer.Mobile,
		&sale.TotalItems,
		&sale.TotalAmount,    // float64
		&sale.ReceivedAmount, // float64
		&sale.Status,
		&sale.Notes,
		&sale.CreatedAt,
		&sale.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("sale not found")
		}
		return nil, fmt.Errorf("fetch sale failed: %w", err)
	}

	sale.Customer.ID = sale.CustomerID
	sale.Salesperson.ID = sale.SalespersonID

	// ------------------------------------------------
	// 2. Fetch sale items + products
	// ------------------------------------------------
	itemRows, err := r.db.Query(ctx, `
		SELECT
			oi.product_id,
			p.product_name,
			oi.quantity,
			oi.subtotal
		FROM sale_items oi
		JOIN products p ON p.id = oi.product_id
		WHERE oi.sale_id = $1
		ORDER BY p.product_name
	`, saleID)
	if err != nil {
		return nil, fmt.Errorf("fetch sale items failed: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var it models.SaleItemDB
		if err := itemRows.Scan(
			&it.ProductID,
			&it.ProductName,
			&it.Quantity,
			&it.Subtotal, // float64
		); err != nil {
			return nil, err
		}
		sale.Items = append(sale.Items, it)
	}

	// ------------------------------------------------
	// 3. Fetch sale transactions (FIXED)
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
		FROM sale_transactions t
		LEFT JOIN accounts a ON(a.id=t.payment_account_id)
		WHERE sale_id = $1
		ORDER BY transaction_date DESC, sale_id DESC
	`, saleID)
	if err != nil {
		return nil, fmt.Errorf("fetch sale transactions failed: %w", err)
	}
	defer txRows.Close()

	for txRows.Next() {
		var t models.SaleTransactionDB
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
		sale.SaleTransactions = append(sale.SaleTransactions, t)
	}

	return &sale, nil
}

func (r *ProductRepo) GetSales(
	ctx context.Context,
	branchID int64,
	search string,
	status string,
	page int,
	limit int,
) ([]models.SaleDB, int, error) { // Returns (Data, TotalCount, Error)

	// 1. Prepare Base Query
	baseQuery := `
        FROM sales o
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
		return nil, 0, fmt.Errorf("count sales failed: %w", err)
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
            o.id, o.branch_id, o.memo_no, o.sale_date, o.salesperson_id, e.name AS salesperson_name, e.mobile as salesperson_mobile, o.customer_id, c.name AS customer_name, c.mobile AS customer_mobile, o.total_products, o.total_amount, o.received_amount, o.status, o.notes, o.created_at, o.updated_at
        %s
        %s
        ORDER BY o.sale_date DESC, o.id DESC
        LIMIT $%d OFFSET $%d
    `, baseQuery, whereClause, argPos, argPos+1)

	// Add Limit/Offset to args
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query sales failed: %w", err)
	}
	defer rows.Close()

	// 5. Scan Rows
	sales := make([]models.SaleDB, 0)
	for rows.Next() {
		var o models.SaleDB
		// Ensure nested structs are initialized
		o.Customer = models.Customer{}
		o.Salesperson = models.Employee{}

		err := rows.Scan(
			&o.ID, &o.BranchID, &o.MemoNo, &o.SaleDate,
			&o.SalespersonID, &o.Salesperson.Name, &o.Salesperson.Mobile,
			&o.CustomerID, &o.Customer.Name, &o.Customer.Mobile,
			&o.TotalItems,
			&o.TotalAmount, &o.ReceivedAmount,
			&o.Status, &o.Notes, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		sales = append(sales, o)
	}

	return sales, totalCount, nil
}