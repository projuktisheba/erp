package dbrepo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type PurchaseRepo struct {
	db *pgxpool.Pool
}

func NewPurchaseRepo(db *pgxpool.Pool) *PurchaseRepo {
	return &PurchaseRepo{db: db}
}

// CreatePurchase inserts a new purchase, updates the branch cash account, and logs expense in top_sheet
func (r *PurchaseRepo) CreatePurchase(ctx context.Context, p *models.PurchaseDB) error {
	// Begin transaction
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	// Ensure rollback on early return
	rollback := true
	defer func() {
		if rollback {
			_ = tx.Rollback(ctx)
		}
	}()
	if p.MemoNo == "" {
		p.MemoNo = utils.GenerateMemoNo()
	}
	// Insert purchase
	query := `
		INSERT INTO purchase 
		(memo_no, purchase_date, supplier_id, branch_id, total_amount, notes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id, created_at, updated_at
	`
	err = tx.QueryRow(ctx, query,
		p.MemoNo,
		p.PurchaseDate,
		p.SupplierID,
		p.BranchID,
		p.TotalAmount,
		p.Notes,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert purchase: %w", err)
	}

	// --- Update TopSheet: increase expense ---
	topSheet := &models.TopSheetDB{
		SheetDate: p.PurchaseDate,
		BranchID:  p.BranchID,
		Expense:   p.TotalAmount,
	}
	if err := SaveTopSheetTx(tx, ctx, topSheet); err != nil {
		return fmt.Errorf("update topsheet expense: %w", err)
	}
	notes := "Payment for Material Purchase"
	if strings.TrimSpace(p.Notes) != "" {
		notes += p.Notes
	}

	// get the branch accounts id
	var fromAccountID int64
	err = tx.QueryRow(ctx, `
        SELECT id
        FROM accounts
		WHERE branch_id = $1 AND type = 'cash'
		LIMIT 1
    `, p.BranchID).Scan(&fromAccountID)
	if err != nil {
		return err
	}
	//insert transaction
	_, err = tx.Exec(ctx, `
			INSERT INTO transactions(
				transaction_date, memo_no, branch_id,
				from_entity_id, from_entity_type,
				to_entity_id, to_entity_type,
				amount, transaction_type, notes
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`,
		p.PurchaseDate,
		utils.GetPurchaseMemo(p.ID),
		p.BranchID,
		fromAccountID,
		models.ENTITY_ACCOUNT,
		p.SupplierID,
		models.ENTITY_SUPPLIER,
		p.TotalAmount,
		models.PAYMENT,
		"Payment for Material Purchase",
	)
	if err != nil {
		return fmt.Errorf("insert transaction failed (4b): %w", err)
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	rollback = false // commit succeeded, no rollback needed

	return nil
}

// UpdatePurchase inserts a new purchase, updates the branch cash account, and logs expense in top_sheet
func (r *PurchaseRepo) UpdatePurchase(ctx context.Context, purchaseID int64, newPurchase *models.PurchaseDB) error {
	// Begin transaction
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	// Ensure rollback on early return
	rollback := true
	defer func() {
		if rollback {
			_ = tx.Rollback(ctx)
		}
	}()

	// old purchase info
	var oldPurchase models.PurchaseDB
	err = tx.QueryRow(ctx,
		`SELECT id, memo_no, purchase_date, supplier_id, branch_id, total_amount, notes FROM purchase WHERE id=$1`,
		purchaseID).Scan(
		&oldPurchase.ID,
		&oldPurchase.MemoNo,
		&oldPurchase.PurchaseDate,
		&oldPurchase.SupplierID,
		&oldPurchase.BranchID,
		&oldPurchase.TotalAmount,
		&oldPurchase.Notes,
	)
	// update purchase
	query := `
		UPDATE purchase SET
		memo_no=$1,
		purchase_date=$2,
		supplier_id=$3,
		total_amount=$4,
		notes=$5,
		updated_at=CURRENT_TIMESTAMP
		WHERE id=$6
	`
	_, err = tx.Exec(ctx, query,
		newPurchase.MemoNo,
		newPurchase.PurchaseDate,
		newPurchase.SupplierID,
		newPurchase.TotalAmount,
		newPurchase.Notes,
		purchaseID,
	)
	if err != nil {
		return fmt.Errorf("insert purchase: %w", err)
	}

	// -------------
	// TopSheet
	// -------------
	// revert top sheet data
	oldTopSheet := &models.TopSheetDB{
		SheetDate: oldPurchase.PurchaseDate,
		BranchID:  oldPurchase.BranchID,
		Expense:   -oldPurchase.TotalAmount,
	}
	if err := SaveTopSheetTx(tx, ctx, oldTopSheet); err != nil {
		return fmt.Errorf("revert top sheet expense: %w", err)
	}
	// update top sheet data
	newTopSheet := &models.TopSheetDB{
		SheetDate: newPurchase.PurchaseDate,
		BranchID:  newPurchase.BranchID,
		Expense:   newPurchase.TotalAmount,
	}
	if err := SaveTopSheetTx(tx, ctx, newTopSheet); err != nil {
		return fmt.Errorf("update top sheet expense: %w", err)
	}

	// ---------------------
	// transactions
	// ---------------------
	// always paid from cash, not necessary to update the fromAccountId
	// get the branch accounts id
	// var fromAccountID int64
	// err = tx.QueryRow(ctx, `
    //     SELECT id
    //     FROM accounts
	// 	WHERE branch_id = $1 AND type = 'cash'
	// 	LIMIT 1
    // `, newPurchase.BranchID).Scan(&fromAccountID)
	// if err != nil {
	// 	return err
	// }

	//update transaction
	_, err = tx.Exec(ctx, `
			UPDATE transactions
				transaction_date=$1,
				memo_no=$2,
				to_entity_id=$3,
				to_entity_type=$4,
				amount=$5,
				transaction_type=$6,
				notes=$7
			WHERE branch_id=$8 AND memo_no=$9
		`,
		newPurchase.PurchaseDate,
		newPurchase.MemoNo,
		newPurchase.SupplierID,
		models.ENTITY_SUPPLIER,
		newPurchase.TotalAmount,
		models.PAYMENT,
		"Payment for Material Purchase",
	)
	if err != nil {
		return fmt.Errorf("insert transaction failed (4b): %w", err)
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	rollback = false // commit succeeded, no rollback needed

	return nil
}

// DeletePurchase purchase record, decrement top sheet(expense), delete transactions
func (r *PurchaseRepo) DeletePurchase(ctx context.Context, purchaseID int64) error {
	// Begin transaction
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	// Ensure rollback on early return
	rollback := true
	defer func() {
		if rollback {
			_ = tx.Rollback(ctx)
		}
	}()

	// load old purchase info
	var purchase models.PurchaseDB
	err = tx.QueryRow(ctx,
		`SELECT id, memo_no, purchase_date, supplier_id, branch_id, total_amount, notes FROM purchase WHERE id=$1`,
		purchaseID).Scan(
		&purchase.ID,
		&purchase.MemoNo,
		&purchase.PurchaseDate,
		&purchase.SupplierID,
		&purchase.BranchID,
		&purchase.TotalAmount,
		&purchase.Notes,
	)

	// delete purchase record by id
	_, err = tx.Exec(ctx, `DELETE FROM purchase WHERE id=$1`, purchaseID)
	if err != nil {
		return fmt.Errorf("delete purchase: %w", err)
	}

	// revert top sheet data
	oldTopSheet := &models.TopSheetDB{
		SheetDate: purchase.PurchaseDate,
		BranchID:  purchase.BranchID,
		Expense:   -purchase.TotalAmount,
	}
	if err := SaveTopSheetTx(tx, ctx, oldTopSheet); err != nil {
		return fmt.Errorf("revert top sheet expense: %w", err)
	}
	
	// ---------------------
	// transactions
	// ---------------------
	//update transaction
	_, err = tx.Exec(ctx, `DELETE FROM transactions WHERE branch_id=$1 AND memo_no=$2 AND transaction_date=$3 AND transaction_type=$4`,
		purchase.BranchID, purchase.MemoNo, purchase.PurchaseDate, models.PAYMENT,
	)
	if err != nil {
		return fmt.Errorf("delete transaction failed (4b): %w", err)
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	rollback = false // commit succeeded, no rollback needed

	return nil
}

// GetPurchaseReport gives the purchase history for a particular branch with filtering and pagination
func (r *PurchaseRepo) GetPurchaseReport(ctx context.Context, branchID int64, startDate, endDate time.Time, page, limit int, search string) ([]*models.PurchaseDB, int64, *models.PurchaseReportTotals, error) {
	var purchases []*models.PurchaseDB
	totals := &models.PurchaseReportTotals{}
	var totalCount int64

	// --- 1. BUILD BASE QUERY & ARGS ---
	// JOIN suppliers so we can search by name and mobile
	baseQuery := `
        FROM purchase p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.branch_id = $1
          AND p.purchase_date BETWEEN $2::date AND $3::date
    `
	args := []interface{}{branchID, startDate, endDate}
	argCounter := 4

	if search != "" {
		// Search by Memo No OR Supplier Name OR Supplier Mobile
		baseQuery += fmt.Sprintf(" AND (p.memo_no ILIKE $%d OR s.name ILIKE $%d OR s.mobile ILIKE $%d)", argCounter, argCounter+1, argCounter+2)
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern, searchPattern, searchPattern)
		argCounter += 3
	}

	// --- 2. QUERY TOTALS (Count & Sums) ---
	totalsQuery := `
        SELECT 
            COUNT(*),
            COALESCE(SUM(p.total_amount), 0)
    ` + baseQuery

	err := r.db.QueryRow(ctx, totalsQuery, args...).Scan(
		&totalCount,
		&totals.TotalAmount,
	)
	if err != nil {
		return nil, 0, nil, err
	}

	// --- 3. QUERY DATA (Paginated) ---
	offset := (page - 1) * limit

	dataQuery := `
        SELECT
            p.id,
            p.memo_no,
            p.purchase_date,
            p.supplier_id,
            s.name,
            s.mobile,
            p.branch_id,
            p.total_amount,
            p.notes
    ` + baseQuery + fmt.Sprintf(" ORDER BY p.purchase_date DESC, p.id DESC LIMIT $%d OFFSET $%d", argCounter, argCounter+1)

	// Add limit and offset to args
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		p := &models.PurchaseDB{}

		err := rows.Scan(
			&p.ID,
			&p.MemoNo,
			&p.PurchaseDate,
			&p.SupplierID,
			&p.SupplierName,
			&p.SupplierMobile,
			&p.BranchID,
			&p.TotalAmount,
			&p.Notes,
		)
		if err != nil {
			return nil, 0, nil, err
		}

		purchases = append(purchases, p)
	}

	return purchases, totalCount, totals, nil
}
