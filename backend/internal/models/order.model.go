package models

import "time"

// OrderTransaction represents the complete data for a new or updated order request.
// It combines the header information with the line items.
type Order struct {
	// Header Fields
	BranchID        int64  `json:"branch_id"`
	MemoNo          string `json:"memo_no"`
	OrderDate       string `json:"order_date"`    // Use string for date input (e.g., "YYYY-MM-DD")
	DeliveryDate    string `json:"delivery_date"` // Use string for date input
	SalespersonID   int64  `json:"salesperson_id"`
	SalespersonName string `json:"salesperson_name"`
	CustomerID      int64  `json:"customer_id"`
	CustomerName    string `json:"customer_name"`
	Notes           string `json:"notes"` // Nullable field

	// Financial Input (only the advance is passed in, totals are calculated)
	AdvancePaymentAmount float64 `json:"advance_payment_amount"`
	PaymentAccountID     int64   `json:"payment_account_id"` // Account where advance payment is received
	PaymentAccountType   string  `json:"payment_account_type"`

	// Item Details
	Items []OrderItem `json:"items"`
}

// OrderItem represents a single line item in an order request.
type OrderItem struct {
	ProductID int64   `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"` //total price
}

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
	PaymentAccountID *int64    `json:"payment_account_id,omitempty"`
	PaymentAccountName string    `json:"payment_account_name"`

	MemoNo            string    `json:"memo_no"`
	DeliveredBy       *string   `json:"delivered_by,omitempty"`
	QuantityDelivered int64     `json:"quantity_delivered"`
	Amount            float64   `json:"amount"`
	TransactionType   string    `json:"transaction_type"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
