package dbrepo

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
)

// -------------------------------
// TOP SHEET UPSERT
// -------------------------------

// SaveTopSheet inserts or updates a top_sheet record (aggregates values on conflict)
func SaveTopSheet(db *pgxpool.Pool, ctx context.Context, ts *models.TopSheetDB) error {
	query := `
	INSERT INTO top_sheet (
		sheet_date, branch_id, expense, cash, bank, order_count, delivery, cancelled, ready_made, sales_amount
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	ON CONFLICT (sheet_date, branch_id) DO UPDATE SET
		expense      = top_sheet.expense + EXCLUDED.expense,
		cash         = top_sheet.cash + EXCLUDED.cash,
		bank         = top_sheet.bank + EXCLUDED.bank,
		order_count  = top_sheet.order_count + EXCLUDED.order_count,
		delivery     = top_sheet.delivery + EXCLUDED.delivery,
		cancelled     = top_sheet.cancelled + EXCLUDED.cancelled,
		ready_made   = top_sheet.ready_made + EXCLUDED.ready_made,
		sales_amount   = top_sheet.sales_amount + EXCLUDED.sales_amount;
	`
	_, err := db.Exec(ctx, query,
		ts.SheetDate, ts.BranchID, ts.Expense, ts.Cash, ts.Bank,
		ts.OrderCount, ts.Delivery, ts.Cancelled, ts.ReadyMade,
	)
	return err
}

// SaveTopSheetTx uses a transaction for upsert
func SaveTopSheetTx(tx pgx.Tx, ctx context.Context, ts *models.TopSheetDB) error {
	query := `
	INSERT INTO top_sheet (
		sheet_date, branch_id, expense, cash, bank, order_count, delivery, cancelled, ready_made, sales_amount
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	ON CONFLICT (sheet_date, branch_id) DO UPDATE SET
		expense      = top_sheet.expense + EXCLUDED.expense,
		cash         = top_sheet.cash + EXCLUDED.cash,
		bank         = top_sheet.bank + EXCLUDED.bank,
		order_count  = top_sheet.order_count + EXCLUDED.order_count,
		delivery     = top_sheet.delivery + EXCLUDED.delivery,
		cancelled    = top_sheet.cancelled + EXCLUDED.cancelled,
		ready_made   = top_sheet.ready_made + EXCLUDED.ready_made,
		sales_amount   = top_sheet.sales_amount + EXCLUDED.sales_amount;
	`
	_, err := tx.Exec(ctx, query,
		ts.SheetDate, ts.BranchID, ts.Expense, ts.Cash, ts.Bank,
		ts.OrderCount, ts.Delivery, ts.Cancelled, ts.ReadyMade, ts.SalesAmount,
	)
	return err
}

// -------------------------------
// EMPLOYEE / SALESPERSON PROGRESS UPSERT
// -------------------------------

// UpdateEmployeeProgressReportTx inserts or updates employee progress
func UpdateEmployeeProgressReportTx(
	tx pgx.Tx,
	ctx context.Context,
	ts *models.EmployeeProgressDB,
) (int64, error) {
	query := `
    INSERT INTO employees_progress (
        sheet_date,
        branch_id,
        employee_id,
        sale_amount,
        sale_return_amount,
        order_count,
        production_units,
        overtime_hours,
        advance_payment,
        salary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (sheet_date, employee_id) DO UPDATE SET
        sale_amount        = employees_progress.sale_amount + EXCLUDED.sale_amount,
        sale_return_amount = employees_progress.sale_return_amount + EXCLUDED.sale_return_amount,
        order_count        = employees_progress.order_count + EXCLUDED.order_count,
        production_units   = employees_progress.production_units + EXCLUDED.production_units,
        overtime_hours     = employees_progress.overtime_hours + EXCLUDED.overtime_hours,
        advance_payment    = employees_progress.advance_payment + EXCLUDED.advance_payment,
        salary             = employees_progress.salary + EXCLUDED.salary
    RETURNING id
    `

	var id int64
	err := tx.QueryRow(ctx, query,
		ts.SheetDate,
		ts.BranchID, // $2: Uses the BranchID provided in your struct
		ts.EmployeeID,
		ts.SaleAmount,
		ts.SaleReturnAmount,
		ts.OrderCount,
		ts.ProductionUnits,
		ts.OvertimeHours,
		ts.AdvancePayment,
		ts.Salary,
	).Scan(&id)

	return id, err
}
