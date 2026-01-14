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

// DB structs
type SaleDB struct {
	ID           int64     `json:"id"`
	BranchID     int64     `json:"branch_id"`
	MemoNo       string    `json:"memo_no"`
	SaleDate    time.Time `json:"sale_date"`

	SalespersonID int64 `json:"salesperson_id"`
	CustomerID    int64 `json:"customer_id"`

	// products
	TotalItems       int64   `json:"total_items"`
	TotalAmount      float64 `json:"total_amount"`
	PaymentAccountID int64   `json:"payment_account_id"`
	ReceivedAmount   float64 `json:"received_amount"`

	Status string  `json:"status"`
	Notes  *string `json:"notes,omitempty"`

	CreatedAt         time.Time            `json:"created_at"`
	UpdatedAt         time.Time            `json:"updated_at"`
	Items             []SaleItemDB        `json:"items"`
	Customer          Customer             `json:"customer"`
	Salesperson       Employee             `json:"salesperson"`
	SaleTransactions []SaleTransactionDB `json:"sale_transactions"`
}

type SaleItemDB struct {
	ID          int64  `json:"id"`
	SaleID     int64  `json:"sale_id"`
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`

	Quantity int     `json:"quantity"`
	Subtotal float64 `json:"subtotal"`
}

type SaleTransactionDB struct {
	TransactionID    int64     `json:"transaction_id"`
	TransactionDate  time.Time `json:"transaction_date"`
	SaleID          *int64    `json:"sale_id,omitempty"`	
	MemoNo            string    `json:"memo_no"`
	PaymentAccountID int64    `json:"payment_account_id,omitempty"`
	PaymentAccountName string    `json:"payment_account_name"`
	DeliveredBy       *string   `json:"delivered_by,omitempty"`
	QuantityDelivered int64     `json:"quantity_delivered"`
	Amount            float64   `json:"amount"`
	TransactionType   string    `json:"transaction_type"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
