package dbrepo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
)

type ReportRepo struct {
	db *pgxpool.Pool
}

func NewReportRepo(db *pgxpool.Pool) *ReportRepo {
	return &ReportRepo{db: db}
}

func (r *ReportRepo) GetOrderOverView(ctx context.Context, branchID int64, summaryType string, refDate time.Time) (*models.OrderOverview, error) {
	var startDate, endDate time.Time

	switch summaryType {
	case "daily":
		startDate = refDate
		endDate = refDate
	case "weekly":
		weekday := int(refDate.Weekday())
		startDate = refDate.AddDate(0, 0, -weekday)
		endDate = startDate.AddDate(0, 0, 6)
	case "monthly":
		startDate = time.Date(refDate.Year(), refDate.Month(), 1, 0, 0, 0, 0, refDate.Location())
		endDate = startDate.AddDate(0, 1, -1)
	case "yearly":
		startDate = time.Date(refDate.Year(), 1, 1, 0, 0, 0, 0, refDate.Location())
		endDate = time.Date(refDate.Year(), 12, 31, 0, 0, 0, 0, refDate.Location())
	case "all":
		startDate = time.Time{}
		endDate = time.Now()
	default:
		return nil, fmt.Errorf("invalid summary type: %s", summaryType)
	}

	query := `
		SELECT
			COALESCE(SUM(pending), 0),
			COALESCE(SUM(checkout), 0),
			COALESCE(SUM(delivery), 0),
			COALESCE(SUM(cancelled), 0),
			COALESCE(SUM(order_count), 0)
		FROM top_sheet
		WHERE branch_id = $3
		  AND sheet_date BETWEEN $1 AND $2
	`

	var s models.OrderOverview
	err := r.db.QueryRow(ctx, query, startDate, endDate, branchID).Scan(
		&s.PendingOrders,
		&s.CheckoutOrders,
		&s.CompletedOrders,
		&s.CancelledOrders,
		&s.TotalOrders,
	)
	if err != nil {
		return nil, err
	}

	return &s, nil
}

// GetSalesPersonProgressReport gives daily sales progress summary
// for all salespersons in a branch
// v2 (formatted exactly like GetBranchReport)
func (r *ReportRepo) GetSalesPersonProgressReport(
	ctx context.Context,
	branchID int64,
	startDate, endDate time.Time,
	page, limit int64,
	search string,
) ([]*models.SalesPersonProgressReportDB, *models.SalesPersonProgressTotals, error) {

	var reports []*models.SalesPersonProgressReportDB
	totals := &models.SalesPersonProgressTotals{}
	// --- 1. BUILD BASE QUERY & ARGS ---
	baseQuery := `
		FROM employees_progress ep
		INNER JOIN employees e ON e.id = ep.employee_id
		WHERE ep.branch_id = $1
		  AND ep.sheet_date BETWEEN $2::date AND $3::date
		  AND e.role = 'salesperson'
	`

	args := []interface{}{branchID, startDate, endDate}
	argCounter := 4

	if search != "" {
		baseQuery += fmt.Sprintf(
			" AND (e.name ILIKE $%d OR e.mobile ILIKE $%d)",
			argCounter, argCounter,
		)
		args = append(args, "%"+search+"%")
		argCounter++
	}

	// --- 2. QUERY TOTALS (Count & Sums) ---
	totalsQuery := `
		SELECT
			COALESCE(SUM(ep.sale_amount), 0),
			COALESCE(SUM(ep.sale_return_amount), 0),
			COALESCE(SUM(ep.order_count), 0)
	` + baseQuery

	err := r.db.QueryRow(ctx, totalsQuery, args...).Scan(
		&totals.TotalSale,
		&totals.TotalSaleReturn,
		&totals.TotalOrders,
	)
	if err != nil {
		return nil, nil, err
	}

	// --- 3. QUERY DATA (Paginated) ---
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	dataQuery := `
		SELECT
			e.id,
			e.name,
			e.mobile,
			e.email,
			e.base_salary,
			to_char(ep.sheet_date, 'YYYY-MM-DD') AS date_label,
			COALESCE(SUM(ep.sale_amount), 0),
			COALESCE(SUM(ep.sale_return_amount), 0),
			COALESCE(SUM(ep.order_count), 0)
	` + baseQuery + fmt.Sprintf(`
		GROUP BY
			e.id,
			e.name,
			e.mobile,
			e.email,
			e.base_salary,
			to_char(ep.sheet_date, 'YYYY-MM-DD')
		ORDER BY
			to_char(ep.sheet_date, 'YYYY-MM-DD') ASC,
			e.name ASC
		LIMIT $%d OFFSET $%d
	`, argCounter, argCounter+1)

	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		rp := &models.SalesPersonProgressReportDB{}
		err := rows.Scan(
			&rp.SalesPersonID,
			&rp.SalesPersonName,
			&rp.Mobile,
			&rp.Email,
			&rp.BaseSalary,
			&rp.SheetDate,
			&rp.Sale,
			&rp.SaleReturn,
			&rp.OrderCount,
		)
		if err != nil {
			return nil,nil, err
		}
		reports = append(reports, rp)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return reports, totals, nil
}


// GetWorkerProgressReport gives production progress summary for all salespersons in a branch
// grouped by day, week, month, or year — based on data from employees_progress table.
func (r *ReportRepo) GetWorkerProgressReport(
	ctx context.Context,
	branchID int64,
	startDate, endDate time.Time,
	reportType string,
	search string,
) ([]*models.WorkerProgressReportDB, error) {

	var report []*models.WorkerProgressReportDB

	// Choose grouping format
	var dateSelect, dateGroupExpr string
	switch reportType {
	case "daily":
		dateSelect = "COALESCE(to_char(ep.sheet_date, 'YYYY-MM-DD'), '') AS date_label"
		dateGroupExpr = "to_char(ep.sheet_date, 'YYYY-MM-DD')"
	case "weekly":
		dateSelect = "COALESCE(to_char(ep.sheet_date, 'IYYY-IW'), '') AS date_label"
		dateGroupExpr = "to_char(ep.sheet_date, 'IYYY-IW')"
	case "monthly":
		dateSelect = "COALESCE(to_char(ep.sheet_date, 'YYYY-MM'), '') AS date_label"
		dateGroupExpr = "to_char(ep.sheet_date, 'YYYY-MM')"
	case "yearly":
		dateSelect = "COALESCE(to_char(ep.sheet_date, 'YYYY'), '') AS date_label"
		dateGroupExpr = "to_char(ep.sheet_date, 'YYYY')"
	default:
		return nil, fmt.Errorf("invalid reportType: %s", reportType)
	}

	orderBy := fmt.Sprintf("%s, e.name", dateGroupExpr)

	// 2. Prepare Base Arguments
	args := []interface{}{branchID, startDate, endDate}

	// 3. Build WHERE clause dynamically
	whereClause := `
        WHERE ep.branch_id = $1
          AND ep.sheet_date BETWEEN $2 AND $3
          AND e.role = 'worker'
    `

	// 4. Append Search Condition if provided
	if search != "" {
		// We use $4 here because we know we have exactly 3 args before it ($1, $2, $3)
		whereClause += " AND (e.name ILIKE $4 OR e.mobile ILIKE $4)"
		args = append(args, "%"+search+"%")
	}

	// MAIN TABLE: employees_progress
	query := fmt.Sprintf(`
        SELECT
            e.id AS employee_id,
            e.name,
            e.mobile,
            e.email,
            e.base_salary,
            %s,
            COALESCE(ep.advance_payment, 0) AS advance_payment,
            COALESCE(ep.overtime_hours, 0) AS overtime_hours,
            COALESCE(ep.production_units, 0) AS production_units
        FROM employees_progress ep
        LEFT JOIN employees e 
            ON e.id = ep.employee_id
        %s -- Injected WHERE clause
        ORDER BY %s;
    `, dateSelect, whereClause, orderBy)

	// 5. Pass 'args...' to Query
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var rp models.WorkerProgressReportDB
		if err := rows.Scan(
			&rp.WorkerID,
			&rp.WorkerName,
			&rp.Mobile,
			&rp.Email,
			&rp.BaseSalary,
			&rp.Date,
			&rp.TotalAdvancePayment,
			&rp.TotalOvertimeHours,
			&rp.TotalProductionUnits,
		); err != nil {
			return nil, fmt.Errorf("row scan failed: %w", err)
		}
		report = append(report, &rp)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return report, nil
}

// GetBranchReport gives the report of a particular employee for a given year
// v2
func (r *ReportRepo) GetBranchReport(ctx context.Context, branchID int64, startDate, endDate time.Time, reportType string, page, limit int, search string) ([]*models.TopSheetDB, int64, *models.BranchReportTotals, error) {
	var sheets []*models.TopSheetDB
	totals := &models.BranchReportTotals{}
	var totalCount int64

	// --- 1. BUILD BASE QUERY & ARGS ---
	// We cast sheet_date to text to allow searching by date string (e.g., "2024-01")
	baseQuery := `
        FROM top_sheet
        WHERE branch_id = $1
          AND sheet_date BETWEEN $2::date AND $3::date
    `
	args := []interface{}{branchID, startDate, endDate}
	argCounter := 4

	if search != "" {
		baseQuery += fmt.Sprintf(" AND CAST(sheet_date AS TEXT) ILIKE $%d", argCounter)
		args = append(args, "%"+search+"%")
		argCounter++
	}

	// --- 2. QUERY TOTALS (Count & Sums) ---
	// We use COALESCE to handle NULLs if no records exist
	totalsQuery := `
        SELECT 
            COUNT(*),
            COALESCE(SUM(expense), 0),
            COALESCE(SUM(cash), 0),
            COALESCE(SUM(bank), 0),
            COALESCE(SUM(order_count), 0),
            COALESCE(SUM(delivery), 0)
    ` + baseQuery

	err := r.db.QueryRow(ctx, totalsQuery, args...).Scan(
		&totalCount,
		&totals.Expense,
		&totals.Cash,
		&totals.Bank,
		&totals.Orders,
		&totals.Delivery,
	)
	if err != nil {
		return nil, 0, nil, err
	}

	// Calculate Balance for the totals (Cash + Bank - Expense)
	totals.Balance = (totals.Cash + totals.Bank) - totals.Expense

	// --- 3. QUERY DATA (Paginated) ---
	offset := (page - 1) * limit

	dataQuery := `
        SELECT
            id,
            sheet_date,
            branch_id,
            expense,
            cash,
            bank,
            order_count,
            delivery,
            cancelled,
            ready_made,
			sales_amount
    ` + baseQuery + fmt.Sprintf(" ORDER BY sheet_date ASC LIMIT $%d OFFSET $%d", argCounter, argCounter+1)

	// Add limit and offset to args
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		ts := &models.TopSheetDB{}
		err := rows.Scan(
			&ts.ID,
			&ts.SheetDate,
			&ts.BranchID,
			&ts.Expense,
			&ts.Cash,
			&ts.Bank,
			&ts.OrderCount,
			&ts.Delivery,
			&ts.Cancelled,
			&ts.ReadyMade,
			&ts.SalesAmount,
		)
		if err != nil {
			return nil, 0, nil, err
		}

		// Calculate Row-level calculated fields
		ts.TotalAmount = ts.Cash + ts.Bank
		ts.Balance = ts.TotalAmount - ts.Expense

		sheets = append(sheets, ts)
	}

	return sheets, totalCount, totals, nil
}

// V2
func (r *ReportRepo) GetSalaryReport(ctx context.Context, branchID, employeeID int64, startDate, endDate string) ([]*models.SalaryRecord, error) {
	query := `
		SELECT 
			ep.employee_id,
			e.name,
			e.role,
			e.base_salary,
			ep.salary,
			ep.advance_payment,
			ep.sheet_date
		FROM employees_progress ep
		LEFT JOIN employees e ON e.id = ep.employee_id
		WHERE ep.branch_id = $1 and ep.salary > 0
	`
	args := []any{branchID}
	argPos := 2 // next placeholder index

	if employeeID != 0 {
		query += fmt.Sprintf(" AND ep.employee_id = $%d", argPos)
		args = append(args, employeeID)
		argPos++
	}

	if startDate != "" && endDate != "" {
		query += fmt.Sprintf(" AND ep.sheet_date BETWEEN $%d AND $%d", argPos, argPos+1)
		args = append(args, startDate, endDate)
		argPos += 2
	}

	query += " ORDER BY ep.sheet_date ASC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var salaries []*models.SalaryRecord
	for rows.Next() {
		var s models.SalaryRecord
		if err := rows.Scan(
			&s.EmployeeID,
			&s.EmployeeName,
			&s.Role,
			&s.BaseSalary,
			&s.TotalSalary,
			&s.SheetDate,
		); err != nil {
			return nil, err
		}
		salaries = append(salaries, &s)
	}
	return salaries, nil
}
