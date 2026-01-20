package api

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/projuktisheba/erp-mini-api/internal/dbrepo"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type PurchaseHandler struct {
	DB       *dbrepo.PurchaseRepo
	infoLog  *log.Logger
	errorLog *log.Logger
}

func NewPurchaseHandler(db *dbrepo.PurchaseRepo, infoLog, errorLog *log.Logger) *PurchaseHandler {
	return &PurchaseHandler{
		DB:       db,
		infoLog:  infoLog,
		errorLog: errorLog,
	}
}

// =========================
// AddPurchase
// =========================
func (h *PurchaseHandler) AddPurchase(w http.ResponseWriter, r *http.Request) {
	var purchase models.PurchaseDB
	err := utils.ReadJSON(w, r, &purchase)
	if err != nil {
		h.errorLog.Println("ERROR_01_AddPurchase:", err)
		utils.BadRequest(w, err)
		return
	}
	//read branch id
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		h.errorLog.Println("ERROR_02_AddPurchase: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
		return
	}
	purchase.BranchID = branchID

	h.infoLog.Println(purchase)
	// Create the purchase
	err = h.DB.CreatePurchase(r.Context(), &purchase)
	if err != nil {
		h.errorLog.Println("ERROR_02_AddPurchase:", err)
		utils.BadRequest(w, err)
		return
	}

	var resp struct {
		Error    bool               `json:"error"`
		Status   string             `json:"status"`
		Message  string             `json:"message"`
		Purchase *models.PurchaseDB `json:"purchase"`
	}
	resp.Error = false
	resp.Status = "success"
	resp.Message = "Purchase created successfully"
	resp.Purchase = &purchase

	utils.WriteJSON(w, http.StatusCreated, resp)
}

// =========================
// UpdatePurchase
// =========================
func (h *PurchaseHandler) UpdatePurchase(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid purchase id"))
		return
	}

	var purchase models.PurchaseDB
	err = utils.ReadJSON(w, r, &purchase)
	if err != nil {
		h.errorLog.Println("ERROR_01_UpdatePurchase:", err)
		utils.BadRequest(w, err)
		return
	}
	//read branch id
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		h.errorLog.Println("ERROR_02_UpdatePurchase: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
		return
	}

	//update the fields
	purchase.ID = id
	purchase.BranchID = branchID
	purchase.MemoNo = utils.GetPurchaseMemo(purchase.ID)
	if purchase.Notes == ""{
		purchase.Notes = fmt.Sprintf("Payment for Material Purchase %s", purchase.Notes)
	}
	

	// Print each field
	fmt.Println("ID:", purchase.ID)
	fmt.Println("MemoNo:", purchase.MemoNo)
	fmt.Println("PurchaseDate:", purchase.PurchaseDate)
	fmt.Println("SupplierID:", purchase.SupplierID)
	fmt.Println("SupplierName:", purchase.SupplierName)
	fmt.Println("BranchID:", purchase.BranchID)
	fmt.Println("TotalAmount:", purchase.TotalAmount)
	fmt.Println("Notes:", purchase.Notes)
	fmt.Println("CreatedAt:", purchase.CreatedAt)
	
	// Update the purchase
	err = h.DB.UpdatePurchase(r.Context(), purchase.ID, &purchase)
	if err != nil {
		h.errorLog.Println("ERROR_03_UpdatePurchase:", err)
		utils.BadRequest(w, err)
		return
	}

	var resp struct {
		Error    bool               `json:"error"`
		Status   string             `json:"status"`
		Message  string             `json:"message"`
	}
	resp.Error = false
	resp.Status = "success"
	resp.Message = "Purchase updated successfully"

	utils.WriteJSON(w, http.StatusCreated, resp)
}

// =========================
// DeletePurchase
// =========================
func (h *PurchaseHandler) DeletePurchase(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid purchase id"))
		return
	}
	// Delete purchase record
	err = h.DB.DeletePurchase(r.Context(), id)
	if err != nil {
		h.errorLog.Println("ERROR_03_DeletePurchase:", err)
		utils.BadRequest(w, err)
		return
	}

	var resp struct {
		Error    bool               `json:"error"`
		Status   string             `json:"status"`
		Message  string             `json:"message"`
	}
	resp.Error = false
	resp.Status = "success"
	resp.Message = "Purchase deleted successfully"

	utils.WriteJSON(w, http.StatusCreated, resp)
}

func (h *PurchaseHandler) GetPurchaseReport(w http.ResponseWriter, r *http.Request) {
	// 1. Validate Branch ID
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		h.errorLog.Println("ERROR_01_GetBranchReport: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header"))
		return
	}

	// 2. Parse Query Params
	q := r.URL.Query()
	startDateStr := strings.TrimSpace(q.Get("start_date"))
	endDateStr := strings.TrimSpace(q.Get("end_date"))
	reportType := strings.TrimSpace(q.Get("report_type"))
	search := strings.TrimSpace(q.Get("search"))

	// Pagination Params (Default: Page 1, Limit 10)
	page, err := strconv.Atoi(q.Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit < 1 {
		limit = 10
	}

	if reportType == "" {
		reportType = "daily" // default
	}

	// 3. Date Logic
	var startDate, endDate time.Time
	const dateLayout = "2006-01-02"

	if startDateStr == "" || endDateStr == "" {
		// DEFAULT: Current Month Range
		now := time.Now()
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		endDate = startDate.AddDate(0, 1, -1)
	} else {
		startDate, err = time.Parse(dateLayout, startDateStr)
		if err != nil {
			utils.BadRequest(w, fmt.Errorf("invalid start_date format, expected YYYY-MM-DD"))
			return
		}
		endDate, err = time.Parse(dateLayout, endDateStr)
		if err != nil {
			utils.BadRequest(w, fmt.Errorf("invalid end_date format, expected YYYY-MM-DD"))
			return
		}
	}

	// 4. Fetch Report (Data + Count + Totals)
	branchReport, totalCount, totals, err := h.DB.GetPurchaseReport(r.Context(), branchID, startDate, endDate, page, limit, search)
	if err != nil {
		h.errorLog.Println("ERROR_03_GetBranchReport: ", err)
		utils.BadRequest(w, err)
		return
	}

	// 5. Response
	resp := struct {
		Error      bool                 `json:"error"`
		Message    string               `json:"message"`
		Report     []*models.PurchaseDB `json:"report"`
		TotalCount int64                `json:"total_count"`
		Totals     interface{}          `json:"totals"` // Generic interface to hold the totals struct
	}{
		Error:      false,
		Message:    "Branch report generated successfully",
		Report:     branchReport,
		TotalCount: totalCount,
		Totals:     totals,
	}

	utils.WriteJSON(w, http.StatusOK, resp)
}
