package api

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/projuktisheba/erp-mini-api/internal/dbrepo"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type TransactionHandler struct {
	DB       *dbrepo.TransactionRepo
	infoLog  *log.Logger
	errorLog *log.Logger
}

func NewTransactionHandler(db *dbrepo.TransactionRepo, infoLog *log.Logger, errorLog *log.Logger) *TransactionHandler {
	return &TransactionHandler{
		DB:       db,
		infoLog:  infoLog,
		errorLog: errorLog,
	}
}
func (t *TransactionHandler) GetTransactionSummaryHandler(w http.ResponseWriter, r *http.Request) {
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if startDate == "" || endDate == "" {
		utils.BadRequest(w, fmt.Errorf("start_date and end_date are required"))
		return
	}
	//read branch id
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		t.errorLog.Println("ERROR_01_GetTransactionSummaryHandler: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
		return
	}

	var trxType *string

	if val := r.URL.Query().Get("transaction_type"); val != "" {
		trxType = &val
	}

	transactions, err := t.DB.GetTransactionSummary(r.Context(), branchID, startDate, endDate, trxType)
	if err != nil {
		t.errorLog.Println("ERROR_01_GetTransactionSummaryHandler: ", err)
		utils.BadRequest(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"error":        false,
		"status":       "success",
		"transactions": transactions,
	})
}

func (t *TransactionHandler) ListTransactionsPaginatedHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Validate Dates
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if startDate == "" || endDate == "" {
		utils.BadRequest(w, fmt.Errorf("start_date and end_date are required"))
		return
	}

	// 2. Read Branch ID
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		t.errorLog.Println("ERROR_01_GetTransactionSummaryHandler: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header"))
		return
	}

	// 3. Parse Pagination (Page & Limit)
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1 // Default to page 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 10 // Default to 10 items per page
	}

	// 4. Parse Transaction Type (Optional)
	var trxType *string
	if val := r.URL.Query().Get("transaction_type"); val != "" {
		trxType = &val
	}

	// 5. Call DB (Updated Signature)
	// Now accepts page and limit, and returns transactions + totalCount
	transactions, totalCount, err := t.DB.ListTransactionsPaginated(r.Context(), branchID, startDate, endDate, trxType, page, limit)
	if err != nil {
		t.errorLog.Println("ERROR_01_GetTransactionSummaryHandler: ", err)
		utils.BadRequest(w, err)
		return
	}

	// 6. Return Response
	// We use "report" key to match your JS: `transactionReportState.data = data.report`
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"error":       false,
		"status":      "success",
		"report":      transactions,
		"total_count": totalCount,
		"page":        page,
		"limit":       limit,
	})
}
