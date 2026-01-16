package models

import "time"

type TopSheetDB struct {
	ID         int64     `json:"id"`
	SheetDate  time.Time `json:"sheet_date"`
	BranchID   int64     `json:"branch_id"`
	Expense    float64   `json:"expense"`
	Cash       float64   `json:"cash"`
	Bank       float64   `json:"bank"`
	OrderCount int64     `json:"order_count"`
	Delivery   int64     `json:"delivery"`
	Cancelled  int64     `json:"cancelled"`
	ReadyMade  int64     `json:"ready_made"`
	SalesAmount  float64     `json:"sales_amount"`

	//totals
	TotalAmount float64 `json:"total_amount"`
	Balance float64 `json:"balance"`
}