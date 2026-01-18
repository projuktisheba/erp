package dbrepo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

// ============================== Employee Repository ==============================
type EmployeeRepo struct {
	db *pgxpool.Pool
}

func NewEmployeeRepo(db *pgxpool.Pool) *EmployeeRepo {
	return &EmployeeRepo{db: db}
}

// (V2)
func (r *EmployeeRepo) CreateEmployee(ctx context.Context, e *models.Employee) error {
	query := `
		INSERT INTO employees 
		(name, role, mobile, mobile_alt, email, password, passport_no, joining_date, address, base_salary, overtime_rate, branch_id, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
		RETURNING id, created_at, updated_at
	`

	row := r.db.QueryRow(ctx, query,
		e.Name, e.Role, e.Mobile, e.MobileAlt, e.Email, e.Password, e.PassportNo,
		e.JoiningDate, e.Address, e.BaseSalary, e.OvertimeRate, e.BranchID,
	)

	err := row.Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			switch pgErr.ConstraintName {
			case "employees_mobile_branch_id_key":
				return errors.New("Duplicate Mobile Number")
			case "employees_email_key":
				return errors.New("Duplicate Email Address")
			}
		}
		if err == pgx.ErrNoRows {
			return errors.New("failed to insert employee")
		}
		return err
	}

	return nil
}

// (V2)
// GetEmployee fetches an employee by ID
func (user *EmployeeRepo) GetEmployeeByID(ctx context.Context, id int64) (*models.Employee, error) {
	query := `
		SELECT 
			id, name, role, mobile, mobile_alt, email, password, passport_no, joining_date, address, 
			base_salary, overtime_rate, branch_id, created_at, updated_at
		FROM employees 
		WHERE id = $1
	`
	e := &models.Employee{}
	err := user.db.QueryRow(ctx, query, id).Scan(
		&e.ID, &e.Name, &e.Role, &e.Mobile, &e.MobileAlt, &e.Email, &e.Password,
		&e.PassportNo, &e.JoiningDate, &e.Address,
		&e.BaseSalary, &e.OvertimeRate, &e.BranchID,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("No employee found")
		}
		return nil, err
	}
	return e, nil
}

// GetEmployeeByUsernameOrMobile fetches an employee by mobile or email
func (user *EmployeeRepo) GetEmployeeByUsernameOrMobile(ctx context.Context, username string) (*models.Employee, error) {
	query := `
		SELECT 
			id, name, role, mobile, mobile_alt, email, password, passport_no, joining_date, address, 
			base_salary, overtime_rate, branch_id, created_at, updated_at
		FROM employees 
		WHERE mobile = $1 OR email = $1
		LIMIT 1
	`
	e := &models.Employee{}
	err := user.db.QueryRow(ctx, query, username).Scan(
		&e.ID, &e.Name, &e.Role, &e.Mobile, &e.MobileAlt, &e.Email, &e.Password,
		&e.PassportNo, &e.JoiningDate, &e.Address,
		&e.BaseSalary, &e.OvertimeRate, &e.BranchID,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("No employee found")
		}
		return nil, err
	}
	return e, nil
}

// (V2)
// UpdateEmployeePassword updates the password only
func (r *EmployeeRepo) UpdateEmployeePassword(ctx context.Context, employeeId int64, newPassword string) error {
	query := `
		UPDATE employees SET password = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, employeeId, newPassword)
	if err != nil {
		if err == pgx.ErrNoRows {
			return errors.New("no employee found with the given id")
		}

		return err
	}

	return nil
}

// (V2)
// UpdateEmployee updates employee details
func (r *EmployeeRepo) UpdateEmployee(ctx context.Context, e *models.Employee) error {
	query := `
		UPDATE employees
		SET 
			name = $2,
			mobile = $3,
			mobile_alt = $4,
			email = $5,
			passport_no = $6,
			joining_date = $7,
			address = $8,
			base_salary = $9,
			overtime_rate = $10,
			status=$11,
			role=$12,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
		RETURNING updated_at
	`

	row := r.db.QueryRow(ctx, query,
		e.ID, e.Name, e.Mobile, e.MobileAlt, e.Email, e.PassportNo,
		e.JoiningDate, e.Address, e.BaseSalary, e.OvertimeRate, e.Status, e.Role,
	)

	err := row.Scan(&e.UpdatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23505" { // unique_violation
				switch pgErr.ConstraintName {
				case "employees_mobile_key":
					return errors.New("this mobile is already associated with another employee")
				case "employees_email_key":
					return errors.New("this email is already associated with another employee")
				default:
					return errors.New("unique constraint violation: " + pgErr.Message)
				}
			}
			// fallback for other Postgres-specific errors
			return errors.New("database error: " + pgErr.Message)
		}

		if err == pgx.ErrNoRows {
			return errors.New("no employee found with the given id")
		}

		return err
	}

	return nil
}

// UpdateEmployeeAvatarLink updates employee avatar_link field
func (user *EmployeeRepo) UpdateEmployeeAvatarLink(ctx context.Context, id int, avatarLink string) error {
	query := `
		UPDATE employees
		SET avatar_link=$1, updated_at= CURRENT_TIMESTAMP
		WHERE id=$2
		RETURNING updated_at;
	`
	_, err := user.db.Exec(ctx, query, avatarLink, id)
	return err
}

// (V2)
// SaveSalaryRecord generates and give employee salary
// Call this function if the role of the token user is Admin
func (user *EmployeeRepo) SaveSalaryRecord(ctx context.Context, salaryDate time.Time, employeeID, branchID, accountID int64, amount float64) error {
	//using pgxpool begin a transaction
	tx, err := user.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	employeeSalary := &models.EmployeeProgressDB{
		SheetDate:  salaryDate,
		BranchID:   branchID,
		EmployeeID: employeeID,
		Salary:     amount,
	}
	// update employee_progress
	id, err := UpdateEmployeeProgressReportTx(tx, ctx, employeeSalary)
	if err != nil {
		return fmt.Errorf("insert salary: %w", err)
	}
	//increment expense
	// Update top_sheet inside the same tx
	topSheet := &models.TopSheetDB{
		SheetDate: salaryDate,
		BranchID:  branchID,
		Expense:   amount,
	}
	err = SaveTopSheetTx(tx, ctx, topSheet)
	if err != nil {
		return fmt.Errorf("save topsheet: %w", err)
	}

	//insert transaction
	transaction := &models.Transaction{
		TransactionDate: salaryDate,
		MemoNo:          utils.GetSalaryMemo(id),
		BranchID:        branchID,
		FromID:          accountID,
		FromType:        models.ENTITY_ACCOUNT,
		ToID:            employeeID,
		ToType:          models.ENTITY_EMPLOYEE,
		Amount:          amount,
		TransactionType: models.SALARY,
		Notes:           "Employee Salary",
	}
	_, err = CreateTransactionTx(ctx, tx, transaction) // silently add transaction

	// Commit if all succeeded
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// (V2)
// UpdateSalaryRecord generates and give employee salary
// Call this function if the role of the token user is Admin
func (user *EmployeeRepo) UpdateSalaryRecord(ctx context.Context, salaryDate time.Time, salaryID, employeeID, branchID, accountID int64, amount float64) error {
	//using pgxpool begin a transaction
	tx, err := user.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	//-------------------------------------
	// 1. Retrieve old info
	//-------------------------------------

	var oldSalaryInfo models.SalaryRecord
	err = tx.QueryRow(ctx, `SELECT id, sheet_date, branch_id, employee_id, salary FROM employees_progress WHERE id=$1`, salaryID).Scan(
		&oldSalaryInfo.ID,
		&oldSalaryInfo.SheetDate,
		&oldSalaryInfo.BranchID,
		&oldSalaryInfo.EmployeeID,
		&oldSalaryInfo.TotalSalary,
	)
	//-------------------------------------
	// 2. Employee Progress Table
	//-------------------------------------
	//Revert last entry
	oldEmployeeSalary := &models.EmployeeProgressDB{
		SheetDate:  oldSalaryInfo.SheetDate,
		BranchID:   oldSalaryInfo.BranchID,
		EmployeeID: oldSalaryInfo.EmployeeID,
		Salary:     -oldSalaryInfo.TotalSalary,
	}

	// update employee_progress
	_, err = UpdateEmployeeProgressReportTx(tx, ctx, oldEmployeeSalary)
	if err != nil {
		return fmt.Errorf("revert salary: %w", err)
	}
	newEmployeeSalary := &models.EmployeeProgressDB{
		SheetDate:  salaryDate,
		BranchID:   branchID,
		EmployeeID: employeeID,
		Salary:     amount,
	}
	// update employee_progress
	_, err = UpdateEmployeeProgressReportTx(tx, ctx, newEmployeeSalary)
	if err != nil {
		return fmt.Errorf("update salary: %w", err)
	}

	//-------------------------
	// Top Sheet
	//-------------------------
	// Revert top_sheet
	oldTopSheet := &models.TopSheetDB{
		SheetDate: oldSalaryInfo.SheetDate,
		BranchID:  oldEmployeeSalary.BranchID,
		Expense:   -oldSalaryInfo.TotalSalary,
	}
	err = SaveTopSheetTx(tx, ctx, oldTopSheet)
	if err != nil {
		return fmt.Errorf("save topsheet: %w", err)
	}
	// Update top_sheet inside the same tx
	newTopSheet := &models.TopSheetDB{
		SheetDate: salaryDate,
		BranchID:  branchID,
		Expense:   amount,
	}
	err = SaveTopSheetTx(tx, ctx, newTopSheet)
	if err != nil {
		return fmt.Errorf("save topsheet: %w", err)
	}

	//delete old transaction
	err = DeleteTransactionByBranchMemoTx(ctx, tx, utils.GetSalaryMemo(oldSalaryInfo.ID), oldSalaryInfo.BranchID)
	//insert new transaction if amount > 0
	if amount > 0 {
		transaction := &models.Transaction{
			TransactionDate: salaryDate,
			MemoNo:          utils.GetSalaryMemo(oldSalaryInfo.ID),
			BranchID:        branchID,
			FromID:          accountID,
			FromType:        models.ENTITY_ACCOUNT,
			ToID:            employeeID,
			ToType:          models.ENTITY_EMPLOYEE,
			Amount:          amount,
			TransactionType: models.SALARY,
			Notes:           "Employee Salary",
		}
		_, err = CreateTransactionTx(ctx, tx, transaction) // silently add transaction
	}

	// Commit if all succeeded
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (e *EmployeeRepo) SaveWorkerProgress(ctx context.Context, workerProgress models.EmployeeProgressDB) error {
	tx, err := e.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	workerProgressDB := &models.EmployeeProgressDB{
		SheetDate:       workerProgress.SheetDate,
		BranchID:        workerProgress.BranchID,
		EmployeeID:      workerProgress.EmployeeID,
		AdvancePayment:  workerProgress.AdvancePayment,
		ProductionUnits: workerProgress.ProductionUnits,
		OvertimeHours:   workerProgress.OvertimeHours,
	}
	//update employee_progress_table
	id, err := UpdateEmployeeProgressReportTx(tx, ctx, workerProgressDB)
	if err != nil {
		return err
	}
	//update top_sheet if AdvancePayment > 0
	if workerProgressDB.AdvancePayment > 0 {
		err := SaveTopSheetTx(tx, ctx, &models.TopSheetDB{
			SheetDate: workerProgressDB.SheetDate,
			BranchID:  workerProgressDB.BranchID,
			Expense:   workerProgressDB.AdvancePayment,
		})
		if err != nil {
			return err
		}

		//insert transaction
		transaction := &models.Transaction{
			TransactionDate: workerProgress.SheetDate,
			BranchID:        workerProgress.BranchID,
			MemoNo:          utils.GetAdvanceSalaryMemo(id),
			FromID:          workerProgress.BranchID,
			FromType:        models.ENTITY_ACCOUNT,
			ToID:            workerProgress.EmployeeID,
			ToType:          models.ENTITY_EMPLOYEE,
			Amount:          workerProgress.AdvancePayment,
			TransactionType: models.ADVANCE_PAYMENT,
			CreatedAt:       workerProgress.SheetDate,
			Notes:           "Worker advance payment",
		}
		CreateTransactionTx(ctx, tx, transaction) // silently add transaction
	}
	return tx.Commit(ctx)
}

// UpdateSalaryRecord generates and give employee salary
// Call this function if the role of the token user is Admin
func (user *EmployeeRepo) UpdateWorkerProgress(ctx context.Context, progressID int64, newProgressRecord *models.EmployeeProgressDB) error {
	//using pgxpool begin a transaction
	tx, err := user.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)
	//-------------------------------------
	// 1. Retrieve old info
	//-------------------------------------

	var oldProgressRecord models.EmployeeProgressDB
	err = tx.QueryRow(ctx, `SELECT id, sheet_date, branch_id, employee_id, advance_payment, overtime_hours, production_units FROM employees_progress WHERE id=$1`, progressID).Scan(
		&oldProgressRecord.ID,
		&oldProgressRecord.SheetDate,
		&oldProgressRecord.BranchID,
		&oldProgressRecord.EmployeeID,
		&oldProgressRecord.AdvancePayment,
		&oldProgressRecord.OvertimeHours,
		&oldProgressRecord.ProductionUnits,
	)
	//-------------------------------------
	// 2. Employee Progress Table
	//-------------------------------------
	//Revert last entry
	reverseRecord := &models.EmployeeProgressDB{
		SheetDate:       oldProgressRecord.SheetDate,
		BranchID:        oldProgressRecord.BranchID,
		EmployeeID:      oldProgressRecord.EmployeeID,
		AdvancePayment:  -oldProgressRecord.AdvancePayment,
		OvertimeHours:   -oldProgressRecord.OvertimeHours,
		ProductionUnits: -oldProgressRecord.ProductionUnits,
	}
	// update employee_progress
	_, err = UpdateEmployeeProgressReportTx(tx, ctx, reverseRecord)
	if err != nil {
		return fmt.Errorf("revert old progress record: %w", err)
	}
	// update employee_progress
	_, err = UpdateEmployeeProgressReportTx(tx, ctx, newProgressRecord)
	if err != nil {
		return fmt.Errorf("update salary: %w", err)
	}

	//-------------------------
	// Top Sheet
	//-------------------------
	// Revert top_sheet
	if oldProgressRecord.AdvancePayment > 0 {
		oldTopSheet := &models.TopSheetDB{
			SheetDate: oldProgressRecord.SheetDate,
			BranchID:  oldProgressRecord.BranchID,
			Expense:   -oldProgressRecord.AdvancePayment,
		}
		err = SaveTopSheetTx(tx, ctx, oldTopSheet)
		if err != nil {
			return fmt.Errorf("revert topsheet: %w", err)
		}
	}

	// Update top_sheet inside the same tx
	if newProgressRecord.AdvancePayment > 0 {
		if oldProgressRecord.AdvancePayment > 0 {
			newTopSheet := &models.TopSheetDB{
				SheetDate: newProgressRecord.SheetDate,
				BranchID:  newProgressRecord.BranchID,
				Expense:   newProgressRecord.AdvancePayment,
			}
			err = SaveTopSheetTx(tx, ctx, newTopSheet)
			if err != nil {
				return fmt.Errorf("revert topsheet: %w", err)
			}
		}
	}

	//delete old transaction
	if oldProgressRecord.AdvancePayment > 0 {
		err = DeleteTransactionByBranchMemoTx(ctx, tx, utils.GetAdvanceSalaryMemo(oldProgressRecord.ID), oldProgressRecord.BranchID)
	}

	//insert new transaction if amount > 0
	if newProgressRecord.AdvancePayment > 0 {
		transaction := &models.Transaction{
			TransactionDate: newProgressRecord.SheetDate,
			MemoNo:          utils.GetAdvanceSalaryMemo(oldProgressRecord.ID),
			BranchID:        newProgressRecord.BranchID,
			FromID:          newProgressRecord.PaymentAccountID,
			FromType:        models.ENTITY_ACCOUNT,
			ToID:            newProgressRecord.EmployeeID,
			ToType:          models.ENTITY_EMPLOYEE,
			Amount:          newProgressRecord.AdvancePayment,
			TransactionType: models.ADVANCE_PAYMENT,
			Notes:           "Employee Advance Salary",
		}
		_, err = CreateTransactionTx(ctx, tx, transaction) // silently add transaction
	}

	// Commit if all succeeded
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// UpdateEmployeeStatus updates employee role and status
// Call this function if the role of the token user is Admin
func (user *EmployeeRepo) UpdateEmployeeRole(ctx context.Context, e *models.Employee) error {
	query := `
		UPDATE employees
		SET role =$1, status=$2, updated_at= CURRENT_TIMESTAMP
		WHERE id=$3
		RETURNING updated_at;
	`
	return user.db.QueryRow(ctx, query,
		e.Role,
		e.Status,
		e.ID,
	).Scan(&e.UpdatedAt)
}

// GetEmployeesNameAndIDByBranchAndRole fetches a lightweight list of active employees filtered by branch and role.
func (e *EmployeeRepo) GetEmployeesNameAndIDByBranchAndRole(ctx context.Context, branchID int64, role string) ([]*models.EmployeeNameID, error) {
	query := `
		SELECT id, name 
		FROM employees
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	// Dynamic filters
	if branchID != 0 {
		query += fmt.Sprintf(" AND branch_id = $%d", argIdx)
		args = append(args, branchID)
		argIdx++
	}

	if role != "" {
		query += fmt.Sprintf(" AND role = $%d", argIdx)
		args = append(args, role)
		argIdx++
	}

	query += " ORDER BY id ASC;"
	rows, err := e.db.Query(ctx, query, args...)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			return nil, fmt.Errorf("database error: %s", pgErr.Message)
		}
		return nil, fmt.Errorf("error getting employee names and ids: %w", err)
	}
	defer rows.Close()

	list := []*models.EmployeeNameID{}
	for rows.Next() {
		var item models.EmployeeNameID
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, fmt.Errorf("error scanning employee name/id: %w", err)
		}
		list = append(list, &item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating employee name/id rows: %w", err)
	}

	return list, nil
}

// PaginatedEmployeeList returns a paginated list of employees with optional filters, dynamic sorting, or all rows if page/limit not provided.
func (e *EmployeeRepo) PaginatedEmployeeList(ctx context.Context, page, limit int, branchID int64, role, status, sortBy, sortOrder string,
) ([]*models.Employee, int, error) {

	// Base queries
	query := `SELECT id, name, role, status, mobile, mobile_alt, email, password, passport_no, joining_date, address,
	                 base_salary, overtime_rate, branch_id, created_at, updated_at
	          FROM employees
	          WHERE role <> 'chairman'`

	countQuery := `SELECT COUNT(*) FROM employees WHERE 1=1`

	args := []interface{}{}
	countArgs := []interface{}{}
	argIdx := 1

	// Dynamic filters
	if branchID != 0 {
		query += fmt.Sprintf(" AND branch_id = $%d", argIdx)
		countQuery += fmt.Sprintf(" AND branch_id = $%d", argIdx)
		args = append(args, branchID)
		countArgs = append(countArgs, branchID)
		argIdx++
	}

	if role != "" {
		query += fmt.Sprintf(" AND role = $%d", argIdx)
		countQuery += fmt.Sprintf(" AND role = $%d", argIdx)
		args = append(args, role)
		countArgs = append(countArgs, role)
		argIdx++
	}

	if status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		countQuery += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, status)
		countArgs = append(countArgs, status)
		argIdx++
	}

	// Dynamic sorting
	if sortBy == "" {
		sortBy = "created_at"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "DESC"
	}
	query += fmt.Sprintf(" ORDER BY %s %s", sortBy, sortOrder)

	// Only add LIMIT/OFFSET if both page and limit are provided
	if page > 0 && limit > 0 {
		offset := (page - 1) * limit
		query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
		args = append(args, limit, offset)
	}

	// Get total count
	var total int
	if err := e.db.QueryRow(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			return nil, 0, fmt.Errorf("database error: %s", pgErr.Message)
		}
		return nil, 0, err
	}

	// Query employees
	rows, err := e.db.Query(ctx, query, args...)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			return nil, 0, fmt.Errorf("database error: %s", pgErr.Message)
		}
		return nil, 0, err
	}
	defer rows.Close()

	employees := []*models.Employee{}
	for rows.Next() {
		var emp models.Employee
		err := rows.Scan(
			&emp.ID, &emp.Name, &emp.Role, &emp.Status,
			&emp.Mobile, &emp.MobileAlt, &emp.Email, &emp.Password, &emp.PassportNo,
			&emp.JoiningDate, &emp.Address, &emp.BaseSalary, &emp.OvertimeRate,
			&emp.BranchID, &emp.CreatedAt, &emp.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		employees = append(employees, &emp)
	}

	return employees, total, nil
}
