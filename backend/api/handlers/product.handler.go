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

type ProductHandler struct {
	DB       *dbrepo.ProductRepo
	infoLog  *log.Logger
	errorLog *log.Logger
}

func NewProductHandler(db *dbrepo.ProductRepo, infoLog *log.Logger, errorLog *log.Logger) *ProductHandler {
	return &ProductHandler{
		DB:       db,
		infoLog:  infoLog,
		errorLog: errorLog,
	}
}

// GetProductsHandler fetches all products
// Example: GET /api/v1/products
func (h *ProductHandler) GetProductsHandler(w http.ResponseWriter, r *http.Request) {
	branchID := utils.GetBranchID(r)

	products, err := h.DB.GetProducts(r.Context(), branchID)
	if err != nil {
		h.errorLog.Println("ERROR_GetProductsHandler:", err)
		utils.ServerError(w, err)
		return
	}

	var resp struct {
		Error    bool              `json:"error"`
		Status   string            `json:"status"`
		Message  string            `json:"message"`
		Products []*models.Product `json:"products"`
	}
	resp.Error = false
	resp.Status = "success"
	resp.Message = "Product Names and IDs fetched successfully"
	resp.Products = products

	utils.WriteJSON(w, http.StatusOK, resp)
}

func (h *ProductHandler) RestockProducts(w http.ResponseWriter, r *http.Request) {

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		h.errorLog.Println("ERROR_01_RestockProducts: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
		return
	}
	var requestBody struct {
		Date     time.Time        `json:"date"`
		MemoNo   string           `json:"memo_no"`
		Products []models.Product `json:"products"`
	}

	err := utils.ReadJSON(w, r, &requestBody)
	if err != nil {
		h.errorLog.Println("ERROR_01_RestockProducts: Unable to unmarshal JSON => ", err)
		utils.BadRequest(w, err)
		return
	}

	h.infoLog.Println(requestBody)

	memoNo, err := h.DB.RestockProducts(r.Context(), requestBody.Date, requestBody.MemoNo, branchID, requestBody.Products)
	if err != nil {
		h.errorLog.Println("ERROR_02_RestockProducts: Unable to update stocks => ", err)
		utils.BadRequest(w, err)
		return
	}
	var resp struct {
		Error   bool   `json:"error"`
		Message string `json:"message"`
		MemoNo  string `json:"memo_no"`
	}

	resp.Error = false
	resp.Message = "Products stored successfully"
	resp.MemoNo = memoNo
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// GetProductStockHandler handles GET /api/products/stock requests
func (h *ProductHandler) GetProductStockReportHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Validate Branch ID
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		h.errorLog.Println("ERROR_01_GetProductStockReportHandler: Branch id not found")
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
	page, err := strconv.ParseInt(q.Get("page"), 10, 64)
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.ParseInt(q.Get("limit"), 10, 64)
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
	branchReport, totalCount, totals, err := h.DB.GetProductStockReportByDateRange(r.Context(), branchID, startDate, endDate, search, page, limit)
	if err != nil {
		h.errorLog.Println("ERROR_03_GetBranchReport: ", err)
		utils.BadRequest(w, err)
		return
	}

	// 5. Response
	resp := struct {
		Error      bool                           `json:"error"`
		Message    string                         `json:"message"`
		Report     []*models.ProductStockRegistry `json:"report"`
		TotalCount int64                          `json:"total_count"`
		Totals     interface{}                    `json:"totals"` // Generic interface to hold the totals struct
	}{
		Error:      false,
		Message:    "Branch report generated successfully",
		Report:     branchReport,
		TotalCount: totalCount,
		Totals:     totals,
	}

	utils.WriteJSON(w, http.StatusOK, resp)
}

func (h *ProductHandler) DeleteStockProducts(w http.ResponseWriter, r *http.Request) {
	stockID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if stockID == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid stock id"))
		return
	}
	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
		return
	}

	err = h.DB.DeleteStockProducts(r.Context(), stockID, branchID)
	if err != nil {
		h.errorLog.Println("ERROR_02_DeleteStockProducts: Unable to update stocks => ", err)
		utils.BadRequest(w, err)
		return
	}
	var resp struct {
		Error   bool   `json:"error"`
		Message string `json:"message"`
	}

	resp.Error = false
	resp.Message = "Record deleted successfully"
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// AddSale handles POST /sales/new
func (o *ProductHandler) AddSale(w http.ResponseWriter, r *http.Request) {
	var saleDetails models.SaleDB
	if err := utils.ReadJSON(w, r, &saleDetails); err != nil {
		o.errorLog.Println("AddSale_ReadJSON:", err)
		utils.BadRequest(w, err)
		return
	}

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		utils.BadRequest(w, errors.New("Branch ID not found. Include 'X-Branch-ID' header"))
		return
	}
	saleDetails.BranchID = branchID

	o.infoLog.Printf("Received sale data: %+v\n", saleDetails)

	saleID, err := o.DB.SaleProducts(r.Context(), &saleDetails)
	if err != nil {
		o.errorLog.Println("AddSale_DB:", err)
		if utils.IsUniqueViolation(err, "sales_memo_no_branch_id_key") {
			utils.BadRequest(w, errors.New("duplicate memo number not allowed"))
			return
		}
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Sale added successfully",
		"sale_id": saleID,
	}
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// UpdateOder handles PATCH /sales/update/{id}
func (o *ProductHandler) UpdateSale(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid sale id"))
		return
	}
	var saleDetails models.SaleDB
	if err := utils.ReadJSON(w, r, &saleDetails); err != nil {
		o.errorLog.Println("UpdateSale_ReadJSON:", err)
		utils.BadRequest(w, err)
		return
	}

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		utils.BadRequest(w, errors.New("Branch ID not found. Include 'X-Branch-ID' header"))
		return
	}
	saleDetails.BranchID = branchID

	o.infoLog.Printf("Received sale data: %+v\n", saleDetails)

	// load old data
	oldSaleDetails, err := o.DB.GetSaleDetailsByID(r.Context(), saleDetails.ID)
	if err != nil {
		o.errorLog.Println("UpdateSale_DB:", err)
		utils.ServerError(w, err)
		return
	}
	err = o.DB.UpdateSale(r.Context(), &saleDetails, oldSaleDetails)
	if err != nil {
		o.errorLog.Println("UpdateSale_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Sale updated successfully",
	}
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// GetSaleByID handles GET /sales/{sale_id}
// (v2)
func (o *ProductHandler) GetSaleDetailsByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "sale_id")
	if idStr == "" {
		utils.BadRequest(w, errors.New("order ID required"))
		return
	}

	saleID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(w, errors.New("invalid order ID"))
		return
	}

	sale, err := o.DB.GetSaleDetailsByID(r.Context(), saleID)
	if err != nil {
		o.errorLog.Println("GetOrderByID_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":  false,
		"status": "success",
		"sale":   sale,
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

// GetSalesHandler handles GET /sales/?search=xxx&branch_id=1&limit=20
func (o *ProductHandler) GetSalesHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Get Query Params
	query := r.URL.Query()

	// Helper to parse Int
	page, _ := strconv.Atoi(query.Get("pageIndex")) // Frontend sends 0-based index
	limit, _ := strconv.Atoi(query.Get("pageLength"))
	search := query.Get("search")
	status := query.Get("status")

	// Assuming you have Branch ID in context/session
	branchID := utils.GetBranchID(r)

	// 2. Call the Unified Repo Function
	sales, totalCount, err := o.DB.GetSales(r.Context(), branchID, search, status, page, limit)
	if err != nil {
		utils.BadRequest(w, err)
		return
	}

	// 3. Return JSON
	response := map[string]interface{}{
		"sales":       sales,
		"total_count": totalCount,
		"page":        page,
	}

	utils.WriteJSON(w, http.StatusOK, response)
}
