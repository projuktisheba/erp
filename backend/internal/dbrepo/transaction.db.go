package dbrepo

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type TransactionRepo struct {
	db *pgxpool.Pool
}

func NewTransactionRepo(db *pgxpool.Pool) *TransactionRepo {
	return &TransactionRepo{db: db}
}

// CreateTransaction inserts a new transaction
func (r *TransactionRepo) CreateTransaction(ctx context.Context, t *models.Transaction) (int64, error) {
	// generate memo_no if empty
	if t.MemoNo == "" {
		t.MemoNo = utils.GenerateMemoNo()
	}

	var transactionID int64
	query := `
		INSERT INTO transactions
			(transaction_date, memo_no, branch_id, from_entity_id, from_entity_type, to_entity_id, to_entity_type, amount, transaction_type, notes, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
		RETURNING transaction_id
	`
	err := r.db.QueryRow(ctx, query,
		t.TransactionDate,
		t.MemoNo,
		t.BranchID,
		t.FromID,
		t.FromType,
		t.ToID,
		t.ToType,
		t.Amount,
		t.TransactionType,
		t.Notes,
	).Scan(&transactionID)

	if err != nil {
		return 0, fmt.Errorf("failed to create transaction: %w", err)
	}

	return transactionID, nil
}

// CreateTransactionTx inserts a transaction within an existing tx
func CreateTransactionTx(ctx context.Context, tx pgx.Tx, t *models.Transaction) (int64, error) {
	if t.MemoNo == "" {
		t.MemoNo = utils.GenerateMemoNo()
	}

	var transactionID int64
	query := `
		INSERT INTO transactions
			(transaction_date, memo_no, branch_id, from_entity_id, from_entity_type, to_entity_id, to_entity_type, amount, transaction_type, notes, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, $10, CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
		RETURNING transaction_id
	`
	err := tx.QueryRow(ctx, query,
		t.TransactionDate,
		t.MemoNo,
		t.BranchID,
		t.FromID,
		t.FromType,
		t.ToID,
		t.ToType,
		t.Amount,
		t.TransactionType,
		t.Notes,
	).Scan(&transactionID)

	if err != nil {
		return 0, fmt.Errorf("failed to create transaction in tx: %w", err)
	}

	return transactionID, nil
}
// DeleteTransactionByBranchMemoTx deletes a transaction from transactions table by memoNO and branchID
func DeleteTransactionByBranchMemoTx(ctx context.Context, tx pgx.Tx, memoNo string, branchID int64) error {
	var transactionID int64
	query := `DELETE FROM transactions WHERE memo_no=$1 AND branch_id=$2`
	return tx.QueryRow(ctx, query, memoNo, branchID).Scan(&transactionID)
}

// ListTransactionsPaginated retrieves transactions with optional filters
func (r *TransactionRepo) ListTransactionsPaginated(
	ctx context.Context,
	branchID int64,
	startDate, endDate string,
	trxType *string,
	page, limit int, // Added pagination parameters
) ([]*models.Transaction, int64, error) { // Added int64 return for total count

	// 1. Handle default pagination values
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	offset := (page - 1) * limit

	// 2. Prepare Base Logic for Dynamic Conditions
	// We build the WHERE clause separately so it can be used by both the Count and Data queries
	whereClauses := []string{"t.transaction_date::date BETWEEN $1 AND $2"}
	args := []interface{}{startDate, endDate}
	argID := 3

	if branchID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("t.branch_id=$%d", argID))
		args = append(args, branchID)
		argID++
	}

	if trxType != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("t.transaction_type=$%d", argID))
		args = append(args, *trxType)
		argID++
	}

	whereStr := ""
	if len(whereClauses) > 0 {
		whereStr = " WHERE " + strings.Join(whereClauses, " AND ")
	}

	// 3. EXECUTE COUNT QUERY
	// Optimization: We don't need the JOINs to count the total records,
	// provided the filters are only on the 'transactions' table.
	countQuery := `SELECT COUNT(*) FROM transactions t` + whereStr

	var totalCount int64
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("count query failed: %w", err)
	}

	// Optimization: If no records found, return empty early
	if totalCount == 0 {
		return []*models.Transaction{}, 0, nil
	}

	// 4. EXECUTE DATA QUERY
	selectQuery := `
    SELECT
        t.transaction_id,
        t.transaction_date,
        t.memo_no,
        t.branch_id,
        t.from_entity_id,
        t.from_entity_type,
        COALESCE(
            CASE 
                WHEN t.from_entity_type = 'accounts' THEN a1.name
                WHEN t.from_entity_type = 'customers' THEN c1.name
                WHEN t.from_entity_type = 'employees' THEN e1.name
                WHEN t.from_entity_type = 'suppliers' THEN s1.name
                ELSE NULL
            END, '-') AS from_entity_name,
        t.to_entity_id,
        t.to_entity_type,
        COALESCE(
            CASE 
                WHEN t.to_entity_type = 'accounts' THEN a2.name
                WHEN t.to_entity_type = 'accounts' THEN a2.name
                WHEN t.to_entity_type = 'customers' THEN c2.name
                WHEN t.to_entity_type = 'employees' THEN e2.name
                WHEN t.to_entity_type = 'suppliers' THEN s2.name
                ELSE NULL
            END, '-') AS to_entity_name,
        t.amount,
        t.transaction_type,
        t.notes,
        t.created_at
    FROM transactions t
    LEFT JOIN accounts a1 ON t.from_entity_type = 'accounts' AND t.from_entity_id = a1.id
    LEFT JOIN customers c1 ON t.from_entity_type = 'customers' AND t.from_entity_id = c1.id
    LEFT JOIN employees e1 ON t.from_entity_type = 'employees' AND t.from_entity_id = e1.id
    LEFT JOIN suppliers s1 ON t.from_entity_type = 'suppliers' AND t.from_entity_id = s1.id
    LEFT JOIN accounts a2 ON t.to_entity_type = 'accounts' AND t.to_entity_id = a2.id
    LEFT JOIN customers c2 ON t.to_entity_type = 'customers' AND t.to_entity_id = c2.id
    LEFT JOIN employees e2 ON t.to_entity_type = 'employees' AND t.to_entity_id = e2.id
    LEFT JOIN suppliers s2 ON t.to_entity_type = 'suppliers' AND t.to_entity_id = s2.id
    `

	// Add Where Clause
	selectQuery += whereStr

	// Add Sorting
	selectQuery += " ORDER BY t.transaction_date DESC, t.transaction_id DESC"

	// Add Pagination (Limit & Offset)
	// We add the limit and offset to the args slice and append the SQL
	selectQuery += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argID, argID+1)
	args = append(args, limit, offset)

	// Execute Main Query
	rows, err := r.db.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("data query failed: %w", err)
	}
	defer rows.Close()

	// Scan results
	var summaries []*models.Transaction
	for rows.Next() {
		var t models.Transaction
		if err := rows.Scan(
			&t.TransactionID, &t.TransactionDate, &t.MemoNo, &t.BranchID,
			&t.FromID, &t.FromType, &t.FromAccountName,
			&t.ToID, &t.ToType, &t.ToAccountName,
			&t.Amount, &t.TransactionType, &t.Notes, &t.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("row scan failed: %w", err)
		}
		summaries = append(summaries, &t)
	}

	return summaries, totalCount, nil
}
func (r *TransactionRepo) GetTransactionSummary(
	ctx context.Context,
	branchID int64,
	startDate, endDate string,
	trxType *string,
) ([]*models.Transaction, error) {

	// Base query
	query := `
	SELECT
		t.transaction_id,
		t.transaction_date,
		t.memo_no,
		t.branch_id,
		t.from_entity_id,
		t.from_entity_type,
		COALESCE(
			CASE 
				WHEN t.from_entity_type = 'accounts' THEN a1.name
				WHEN t.from_entity_type = 'customers' THEN c1.name
				WHEN t.from_entity_type = 'employees' THEN e1.name
				WHEN t.from_entity_type = 'suppliers' THEN s1.name
				ELSE NULL
			END, '-') AS from_entity_name,
		t.to_entity_id,
		t.to_entity_type,
		COALESCE(
			CASE 
				WHEN t.to_entity_type = 'accounts' THEN a2.name
				WHEN t.to_entity_type = 'customers' THEN c2.name
				WHEN t.to_entity_type = 'employees' THEN e2.name
				WHEN t.to_entity_type = 'suppliers' THEN s2.name
				ELSE NULL
			END, '-') AS to_entity_name,
		t.amount,
		t.transaction_type,
		t.notes,
		t.created_at
	FROM transactions t
	LEFT JOIN accounts a1 ON t.from_entity_type = 'accounts' AND t.from_entity_id = a1.id
	LEFT JOIN customers c1 ON t.from_entity_type = 'customers' AND t.from_entity_id = c1.id
	LEFT JOIN employees e1 ON t.from_entity_type = 'employees' AND t.from_entity_id = e1.id
	LEFT JOIN suppliers s1 ON t.from_entity_type = 'suppliers' AND t.from_entity_id = s1.id
	LEFT JOIN accounts a2 ON t.to_entity_type = 'accounts' AND t.to_entity_id = a2.id
	LEFT JOIN customers c2 ON t.to_entity_type = 'customers' AND t.to_entity_id = c2.id
	LEFT JOIN employees e2 ON t.to_entity_type = 'employees' AND t.to_entity_id = e2.id
	LEFT JOIN suppliers s2 ON t.to_entity_type = 'suppliers' AND t.to_entity_id = s2.id
	`

	// Dynamic WHERE conditions
	whereClauses := []string{"t.transaction_date::date BETWEEN $1 AND $2"}
	args := []interface{}{startDate, endDate}
	argID := 3

	if branchID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("t.branch_id=$%d", argID))
		args = append(args, branchID)
		argID++
	}

	if trxType != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("t.transaction_type=$%d", argID))
		args = append(args, *trxType)
		argID++
	}

	// Combine WHERE clauses
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	// Add ORDER BY
	query += " ORDER BY t.transaction_date DESC, t.transaction_id DESC"

	// Execute query
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	// Scan results
	var summaries []*models.Transaction
	for rows.Next() {
		var t models.Transaction
		if err := rows.Scan(
			&t.TransactionID, &t.TransactionDate, &t.MemoNo, &t.BranchID,
			&t.FromID, &t.FromType, &t.FromAccountName,
			&t.ToID, &t.ToType, &t.ToAccountName,
			&t.Amount, &t.TransactionType, &t.Notes, &t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("row scan failed: %w", err)
		}
		summaries = append(summaries, &t)
	}

	return summaries, nil
}
