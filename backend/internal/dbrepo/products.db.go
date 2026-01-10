package dbrepo

import (
	"context"
	"fmt"
	"time"

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
func (s *ProductRepo) RestockProducts(ctx context.Context, date time.Time, memoNo string, branchID int64, products []models.Product) (string, error) {
	// Begin transaction
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Generate next memo number if not provided
	if memoNo == "" {
		memoNo = utils.GenerateMemoNo()
	}

	// Update stock and insert restock record
	for _, item := range products {
		// Update product stock
		_, err := tx.Exec(ctx, `
			UPDATE products
			SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2;
		`, item.Quantity, item.ID)
		if err != nil {
			return "", fmt.Errorf("update stock for product %d: %w", item.ID, err)
		}

		// Log in product_stock_registry (if table exists)
		_, err = tx.Exec(ctx, `
			INSERT INTO product_stock_registry (
				memo_no, stock_date, branch_id, product_id, quantity, created_at
			) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP);
		`, memoNo, date, branchID, item.ID, item.Quantity)
		if err != nil {
			return "", fmt.Errorf("insert stock registry: %w", err)
		}
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit tx: %w", err)
	}

	return memoNo, nil
}

// GetProductStockReportByDateRange retrieves stock registry records joined with product names for a given branch and date range.
func (s *ProductRepo) GetProductStockReportByDateRange(ctx context.Context, branchID int64, startDate, endDate time.Time) ([]*models.ProductStockRegistry, error) {
	query := `
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
		FROM product_stock_registry AS psr
		INNER JOIN products AS p ON psr.product_id = p.id
		WHERE psr.branch_id = $1
		  AND psr.stock_date BETWEEN $2 AND $3
		ORDER BY psr.stock_date ASC, psr.id ASC;
	`

	rows, err := s.db.Query(ctx, query, branchID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch stock report: %w", err)
	}
	defer rows.Close()

	var records []*models.ProductStockRegistry
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
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}
		records = append(records, &r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return records, nil
}

// ============================== SALE TRANSACTIONS ==============================

// SaleProducts records a sale and updates stock, accounts, and reports
func (s *ProductRepo) SaleProducts(ctx context.Context, branchID int64, sale *models.Sale) (string, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Step 1: Generate next memo number
	if sale.MemoNo == "" {
		sale.MemoNo = utils.GenerateMemoNo()
	}

	// Step 2: Insert into sales_history
	err = tx.QueryRow(ctx, `
		INSERT INTO sales_history (
			memo_no, sale_date, branch_id, customer_id, salesperson_id, 
			payment_account_id, total_payable_amount, paid_amount, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 RETURNING memo_no
	`, sale.MemoNo, sale.SaleDate, branchID, sale.CustomerID, sale.SalespersonID,
		sale.PaymentAccountID, sale.TotalPayableAmount, sale.PaidAmount).Scan(&sale.MemoNo)
	if err != nil {
		return "", fmt.Errorf("insert sales_history: %w", err)
	}

	// Step 3: Insert sold items into sold_items_history
	for _, item := range sale.Items {
		_, err = tx.Exec(ctx, `
			INSERT INTO sold_items_history (
				memo_no, branch_id, product_id, quantity, total_prices, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`, sale.MemoNo, branchID, item.ID, item.Quantity, item.TotalPrices)
		if err != nil {
			return "", fmt.Errorf("insert sold_items_history: %w", err)
		}
	}

	// Step 4: Reduce stock for sold items
	totalItems := int64(0)
	for _, item := range sale.Items {
		_, err = tx.Exec(ctx, `
			UPDATE products
			SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2;
		`, item.Quantity, item.ID)
		if err != nil {
			return "", fmt.Errorf("update stock: %w", err)
		}
		totalItems += item.Quantity
	}

	// Step 5: Update account balance (for payment)
	if sale.PaidAmount > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE accounts
			SET current_balance = current_balance + $1
			WHERE id = $2;
		`, sale.PaidAmount, sale.PaymentAccountID)
		if err != nil {
			return "", fmt.Errorf("update account balance: %w", err)
		}
	}

	// Step 6: Update customer due
	due := sale.TotalPayableAmount - sale.PaidAmount
	if due > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE customers
			SET due_amount = due_amount + $1
			WHERE id = $2;
		`, due, sale.CustomerID)
		if err != nil {
			return "", fmt.Errorf("update customer due: %w", err)
		}
	}
	// Step 7: Record top sheet for daily branch record
	topSheet := &models.TopSheetDB{
		SheetDate:      sale.SaleDate,
		BranchID:  branchID,
		ReadyMade: totalItems,
	}

	// safer: lookup account type (cash/bank)
	var acctType string
	err = tx.QueryRow(ctx, `SELECT type FROM accounts WHERE id=$1`, sale.PaymentAccountID).Scan(&acctType)
	if err != nil {
		return "", fmt.Errorf("lookup account type: %w", err)
	}
	if acctType == "bank" {
		topSheet.Bank = sale.PaidAmount
	} else {
		topSheet.Cash = sale.PaidAmount
	}

	err = SaveTopSheetTx(tx, ctx, topSheet) // <-- must accept tx, not db
	if err != nil {
		return "", fmt.Errorf("save topsheet: %w", err)
	}
	// Step 8: Record financial transactions
	if sale.PaidAmount > 0 {

		//insert transaction
		transaction := &models.Transaction{
			BranchID:        branchID,
			MemoNo:          sale.MemoNo,
			FromID:          sale.CustomerID,
			FromType:        "customers",
			ToID:            sale.PaymentAccountID,
			ToType:          "accounts",
			Amount:          sale.PaidAmount,
			TransactionType: "payment",
			CreatedAt:       sale.SaleDate,
			Notes:           "Sales Collection",
		}
		_, err = CreateTransactionTx(ctx, tx, transaction) // silently add transaction

		if err != nil {
			return "", fmt.Errorf("failed to create transaction: %w", err)
		}
	}

	// Step 9: Update salesperson daily progress record
	salespersonProgress := models.SalespersonProgress{
		Date:       sale.SaleDate,
		BranchID:   branchID,
		EmployeeID: sale.SalespersonID,
		SaleAmount: sale.TotalPayableAmount,
	}
	err = UpdateSalespersonProgressReportTx(tx, ctx, &salespersonProgress)
	if err != nil {
		return "", fmt.Errorf("failed to update employee progress: %w", err)
	}
	// Commit
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit tx: %w", err)
	}
	return sale.MemoNo, nil
}

// ============================== SALE RETRIEVAL ==============================

// GetSoldItemsByMemoNo fetches all sold items for a memo
func (s *ProductRepo) GetSoldItemsByMemoNo(ctx context.Context, memoNo string) ([]*models.Product, error) {
	query := `
	SELECT 
		p.id,
		p.product_name,
		sih.quantity,
		sih.total_prices,
		p.created_at,
		p.updated_at
	FROM sold_items_history sih
	INNER JOIN products p ON sih.product_id = p.id
	WHERE sih.memo_no = $1;
	`

	rows, err := s.db.Query(ctx, query, memoNo)
	if err != nil {
		return nil, fmt.Errorf("query items: %w", err)
	}
	defer rows.Close()

	var items []*models.Product
	for rows.Next() {
		var p models.Product
		err := rows.Scan(&p.ID, &p.ProductName, &p.Quantity, &p.TotalPrices, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, &p)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

// GetAllSales returns all sales within date range
func (s *ProductRepo) GetAllSales(ctx context.Context, branchID int64, startDate, endDate time.Time) ([]*models.Sale, error) {
	query := `
	SELECT 
		sh.memo_no,
		sh.sale_date,
		sh.branch_id,
		c.id AS customer_id,
		c.name AS customer_name,
		e.id AS salesperson_id,
		e.name AS salesperson_name,
		sh.total_payable_amount,
		sh.paid_amount,
		(sh.total_payable_amount - sh.paid_amount) AS due_amount,
		acc.id AS payment_account_id,
		acc.name AS payment_account_name
	FROM sales_history sh
	LEFT JOIN customers c ON sh.customer_id = c.id
	LEFT JOIN employees e ON sh.salesperson_id = e.id
	LEFT JOIN accounts acc ON sh.payment_account_id = acc.id
	WHERE sh.branch_id = $1
	  AND sh.sale_date BETWEEN $2 AND $3
	ORDER BY sh.sale_date DESC;
	`

	rows, err := s.db.Query(ctx, query, branchID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("query sales list: %w", err)
	}
	defer rows.Close()

	var sales []*models.Sale
	for rows.Next() {
		var sale models.Sale
		err := rows.Scan(
			&sale.MemoNo,
			&sale.SaleDate,
			&sale.BranchID,
			&sale.CustomerID,
			&sale.CustomerName,
			&sale.SalespersonID,
			&sale.SalespersonName,
			&sale.TotalPayableAmount,
			&sale.PaidAmount,
			&sale.DueAmount,
			&sale.PaymentAccountID,
			&sale.PaymentAccountName,
		)
		if err != nil {
			return nil, err
		}
		sales = append(sales, &sale)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return sales, nil
}

// ============================== UPDATE SALE TRANSACTIONS ==============================
// UpdateSoldProducts updates an existing sale and all related records
func (s *ProductRepo) UpdateSoldProducts(ctx context.Context, branchID int64, sale models.Sale) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// =========================================================================
	// STEP 0: Fetch Previous Sale Data
	// We need this to know what to reverse (stock, accounts, employee progress)
	// =========================================================================
	var prevSale models.Sale
	err = tx.QueryRow(ctx, `
        SELECT memo_no, sale_date, customer_id, salesperson_id, payment_account_id, total_payable_amount, paid_amount
        FROM sales_history
        WHERE memo_no = $1 AND branch_id = $2
    `, sale.MemoNo, branchID).Scan(
		&prevSale.MemoNo,
		&prevSale.SaleDate,
		&prevSale.CustomerID,
		&prevSale.SalespersonID,
		&prevSale.PaymentAccountID,
		&prevSale.TotalPayableAmount,
		&prevSale.PaidAmount,
	)
	if err != nil {
		return fmt.Errorf("fetch previous sale: %w", err)
	}

	// =========================================================================
	// PHASE 1: REVERSE OLD DATA ("The Undo")
	// =========================================================================

	// 1.1: Restore Stock (Add back quantity) and Calculate Total Items for TopSheet Reversal
	rows, err := tx.Query(ctx, `SELECT product_id, quantity FROM sold_items_history WHERE memo_no = $1`, sale.MemoNo)
	if err != nil {
		return fmt.Errorf("fetch prev sold items: %w", err)
	}

	oldTotalItems := int64(0)

	// We scan into a slice first to close rows before executing updates inside a loop
	type soldItem struct {
		ProductID int64
		Quantity  int64
	}
	var prevItems []soldItem

	for rows.Next() {
		var item soldItem
		if err := rows.Scan(&item.ProductID, &item.Quantity); err != nil {
			rows.Close()
			return fmt.Errorf("scan prev item: %w", err)
		}
		prevItems = append(prevItems, item)
	}
	rows.Close()

	for _, item := range prevItems {
		_, err = tx.Exec(ctx, `
            UPDATE products 
            SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2
        `, item.Quantity, item.ProductID)
		if err != nil {
			return fmt.Errorf("restore stock: %w", err)
		}
		oldTotalItems += item.Quantity
	}

	// 1.2: Reverse Financials (Account Balance & Customer Due)
	if prevSale.PaidAmount > 0 {
		_, err = tx.Exec(ctx, `
            UPDATE accounts 
            SET current_balance = current_balance - $1 
            WHERE id = $2
        `, prevSale.PaidAmount, prevSale.PaymentAccountID)
		if err != nil {
			return fmt.Errorf("reverse account balance: %w", err)
		}
	}
	prevDue := prevSale.TotalPayableAmount - prevSale.PaidAmount
	if prevDue > 0 {
		_, err = tx.Exec(ctx, `
            UPDATE customers 
            SET due_amount = due_amount - $1 
            WHERE id = $2
        `, prevDue, prevSale.CustomerID)
		if err != nil {
			return fmt.Errorf("reverse customer due: %w", err)
		}
	}

	// 1.3: Reverse Top Sheet (Pass Negative Values)
	// We need the account type of the PREVIOUS account
	var prevAcctType string
	err = tx.QueryRow(ctx, `SELECT type FROM accounts WHERE id=$1`, prevSale.PaymentAccountID).Scan(&prevAcctType)
	if err != nil {
		return fmt.Errorf("lookup prev account type: %w", err)
	}

	prevTopSheet := &models.TopSheetDB{
		SheetDate:      prevSale.SaleDate,
		BranchID:  branchID,
		ReadyMade: -oldTotalItems, // Negative to reverse count
	}
	if prevAcctType == "bank" {
		prevTopSheet.Bank = -prevSale.PaidAmount
	} else {
		prevTopSheet.Cash = -prevSale.PaidAmount
	}

	if err := SaveTopSheetTx(tx, ctx, prevTopSheet); err != nil {
		return fmt.Errorf("reverse top sheet: %w", err)
	}

	// 1.4: Reverse Salesperson Progress (Negative Amount)
	prevProgress := models.SalespersonProgress{
		Date:       prevSale.SaleDate,
		BranchID:   branchID,
		EmployeeID: prevSale.SalespersonID,
		SaleAmount: -prevSale.TotalPayableAmount,
	}
	if err := UpdateSalespersonProgressReportTx(tx, ctx, &prevProgress); err != nil {
		return fmt.Errorf("reverse salesperson progress: %w", err)
	}

	// 1.5: Delete Old Transaction
	// We delete it entirely. A new one will be created if paid_amount > 0.
	_, err = tx.Exec(ctx, `DELETE FROM transactions WHERE memo_no = $1 AND transaction_type = 'payment'`, sale.MemoNo)
	if err != nil {
		return fmt.Errorf("delete old transaction: %w", err)
	}

	// 1.6: Delete Old Sold Items History
	_, err = tx.Exec(ctx, `DELETE FROM sold_items_history WHERE memo_no = $1`, sale.MemoNo)
	if err != nil {
		return fmt.Errorf("delete old sold items: %w", err)
	}

	// =========================================================================
	// PHASE 2: APPLY NEW DATA ("The Redo")
	// =========================================================================

	// 2.1: Update Sales History Record
	_, err = tx.Exec(ctx, `
        UPDATE sales_history
        SET customer_id=$1, salesperson_id=$2, payment_account_id=$3, 
            total_payable_amount=$4, paid_amount=$5, sale_date=$6, updated_at=CURRENT_TIMESTAMP
        WHERE memo_no=$7 AND branch_id=$8
    `, sale.CustomerID, sale.SalespersonID, sale.PaymentAccountID,
		sale.TotalPayableAmount, sale.PaidAmount, sale.SaleDate, sale.MemoNo, branchID)
	if err != nil {
		return fmt.Errorf("update sales_history: %w", err)
	}

	// 2.2: Insert New Sold Items & Deduct Stock
	newTotalItems := int64(0)
	for _, item := range sale.Items {
		_, err = tx.Exec(ctx, `
            INSERT INTO sold_items_history (
                memo_no, branch_id, product_id, quantity, total_prices, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, sale.MemoNo, branchID, item.ID, item.Quantity, item.TotalPrices)
		if err != nil {
			return fmt.Errorf("insert new sold item: %w", err)
		}

		_, err = tx.Exec(ctx, `
            UPDATE products 
            SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2
        `, item.Quantity, item.ID)
		if err != nil {
			return fmt.Errorf("deduct new stock: %w", err)
		}
		newTotalItems += item.Quantity
	}

	// 2.3: Update Financials (Account & Customer Due)
	if sale.PaidAmount > 0 {
		_, err = tx.Exec(ctx, `
            UPDATE accounts 
            SET current_balance = current_balance + $1 
            WHERE id = $2
        `, sale.PaidAmount, sale.PaymentAccountID)
		if err != nil {
			return fmt.Errorf("update account balance: %w", err)
		}
	}
	newDue := sale.TotalPayableAmount - sale.PaidAmount
	if newDue > 0 {
		_, err = tx.Exec(ctx, `
            UPDATE customers 
            SET due_amount = due_amount + $1 
            WHERE id = $2
        `, newDue, sale.CustomerID)
		if err != nil {
			return fmt.Errorf("update customer due: %w", err)
		}
	}

	// 2.4: Update Top Sheet (Positive Values)
	var newAcctType string
	err = tx.QueryRow(ctx, `SELECT type FROM accounts WHERE id=$1`, sale.PaymentAccountID).Scan(&newAcctType)
	if err != nil {
		return fmt.Errorf("lookup new account type: %w", err)
	}

	newTopSheet := &models.TopSheetDB{
		SheetDate:      sale.SaleDate,
		BranchID:  branchID,
		ReadyMade: newTotalItems,
	}
	if newAcctType == "bank" {
		newTopSheet.Bank = sale.PaidAmount
	} else {
		newTopSheet.Cash = sale.PaidAmount
	}

	if err := SaveTopSheetTx(tx, ctx, newTopSheet); err != nil {
		return fmt.Errorf("update top sheet: %w", err)
	}

	// 2.5: Create New Transaction (if paid amount > 0)
	if sale.PaidAmount > 0 {
		transaction := &models.Transaction{
			BranchID:        branchID,
			MemoNo:          sale.MemoNo,
			FromID:          sale.CustomerID,
			FromType:        "customers",
			ToID:            sale.PaymentAccountID,
			ToType:          "accounts",
			Amount:          sale.PaidAmount,
			TransactionType: "payment",
			CreatedAt:       sale.SaleDate,
			Notes:           "Sales Collection (Updated)", // Updated note
		}
		// Assuming CreateTransactionTx is available as per your Create func
		_, err = CreateTransactionTx(ctx, tx, transaction)
		if err != nil {
			return fmt.Errorf("create new transaction: %w", err)
		}
	}

	// 2.6: Update Salesperson Progress (Positive Amount)
	newProgress := models.SalespersonProgress{
		Date:       sale.SaleDate,
		BranchID:   branchID,
		EmployeeID: sale.SalespersonID,
		SaleAmount: sale.TotalPayableAmount,
	}
	if err := UpdateSalespersonProgressReportTx(tx, ctx, &newProgress); err != nil {
		return fmt.Errorf("update salesperson progress: %w", err)
	}

	// =========================================================================
	// COMMIT
	// =========================================================================
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}
