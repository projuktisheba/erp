package models

import "time"

// DB structs
type OrderDB struct {
	ID           int64     `json:"id"`
	BranchID     int64     `json:"branch_id"`
	MemoNo       string    `json:"memo_no"`
	OrderDate    time.Time `json:"order_date"`
	DeliveryDate time.Time `json:"delivery_date,omitempty"`

	SalespersonID int64 `json:"salesperson_id"`
	CustomerID    int64 `json:"customer_id"`

	// products
	TotalItems       int64   `json:"total_items"`
	DeliveredItems   int64   `json:"delivered_items"`
	TotalAmount      float64 `json:"total_amount"`
	PaymentAccountID int64   `json:"payment_account_id"`
	ReceivedAmount   float64 `json:"received_amount"`

	Status string  `json:"status"`
	Notes  *string `json:"notes,omitempty"`

	CreatedAt         time.Time            `json:"created_at"`
	UpdatedAt         time.Time            `json:"updated_at"`
	Items             []OrderItemDB        `json:"items"`
	Customer          Customer             `json:"customer"`
	Salesperson       Employee             `json:"salesperson"`
	OrderTransactions []OrderTransactionDB `json:"order_transactions"`
}

type OrderItemDB struct {
	ID          int64  `json:"id"`
	OrderID     int64  `json:"order_id"`
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`

	Quantity int     `json:"quantity"`
	Subtotal float64 `json:"subtotal"`
}

type OrderTransactionDB struct {
	TransactionID    int64     `json:"transaction_id"`
	TransactionDate  time.Time `json:"transaction_date"`
	OrderID          *int64    `json:"order_id,omitempty"`	
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
