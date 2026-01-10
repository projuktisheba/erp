package models

import "time"

type Sale struct {
	SaleDate           time.Time  `json:"sale_date"`
	MemoNo             string     `json:"memo_no"`
	BranchID           string     `json:"branch_id"`
	SalespersonID      int64      `json:"salesperson_id"`
	SalespersonName    string     `json:"salesperson_name"`
	CustomerID         int64      `json:"customer_id"`
	CustomerName       string     `json:"customer_name"`
	TotalPayableAmount float64    `json:"total_payable_amount"`
	PaidAmount         float64    `json:"paid_amount"`
	DueAmount          float64    `json:"due_amount"`
	PaymentAccountID   int64      `json:"payment_account_id"`
	PaymentAccountName string     `json:"payment_account_name"`
	Notes              string     `json:"notes"`
	Items              []*Product `json:"items"`
}

type SaleDB struct {
	ID                 int64      `json:"id"`
	SaleDate           time.Time  `json:"sale_date"`
	MemoNo             string     `json:"memo_no"`
	BranchID           string     `json:"branch_id"`
	SalespersonID      int64      `json:"salesperson_id"`
	SalespersonName    string     `json:"salesperson_name"`
	CustomerID         int64      `json:"customer_id"`
	CustomerName       string     `json:"customer_name"`
	TotalPayableAmount float64    `json:"total_payable_amount"`
	PaidAmount         float64    `json:"paid_amount"`
	DueAmount          float64    `json:"due_amount"`
	PaymentAccountID   int64      `json:"payment_account_id"`
	PaymentAccountName string     `json:"payment_account_name"`
	Notes              string     `json:"notes"`
	Items              []*Product `json:"items"`
}
