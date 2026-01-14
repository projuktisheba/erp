package api

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
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
		h.errorLog.Println("ERROR_01_CheckoutOrder: Branch id not found")
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

// GetProductStockHandler handles GET /api/product-stock requests
func (h *ProductHandler) GetProductStockReportHandler(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters: start_date, end_date
	startDateStr := r.URL.Query().Get("start_date")
	endDateStr := r.URL.Query().Get("end_date")

	if startDateStr == "" || endDateStr == "" {
		h.errorLog.Println("ERROR_01_GetProductStockReportHandler:Missing required parameters: branch_id, start_date, end_date")
		utils.BadRequest(w, errors.New("Missing required parameters: branch_id, start_date, end_date"))
		return
	}

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		h.errorLog.Println("ERROR_02_GetProductStockReportHandler: Branch id not found")
		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
		return
	}

	startDate, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		h.errorLog.Println("ERROR_03_GetProductStockReportHandler: Branch id not found")
		utils.BadRequest(w, errors.New("Invalid start_date format (expected YYYY-MM-DD)"))
		return
	}

	endDate, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		h.errorLog.Println("ERROR_04_GetProductStockReportHandler: Branch id not found")
		utils.BadRequest(w, errors.New("Invalid end_date format (expected YYYY-MM-DD)"))
		return
	}

	// Fetch data from database
	records, err := h.DB.GetProductStockReportByDateRange(r.Context(), branchID, startDate, endDate)
	if err != nil {
		h.errorLog.Println("ERROR_05_GetProductStockReportHandler: Branch id not found")
		utils.BadRequest(w, fmt.Errorf("Database error: %w", err))
		return
	}

	var resp struct {
		Error   bool                           `json:"error"`
		Message string                         `json:"message"`
		Report  []*models.ProductStockRegistry `json:"report"`
	}

	resp.Error = false
	resp.Message = "Report fetched successfully"
	resp.Report = records

	utils.WriteJSON(w, http.StatusOK, resp)
}

// func (h *ProductHandler) SaleProducts(w http.ResponseWriter, r *http.Request) {
// 	branchID := utils.GetBranchID(r)
// 	if branchID == 0 {
// 		h.errorLog.Println("ERROR_01_SaleProducts: Branch id not found")
// 		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
// 		return
// 	}

// 	var requestBody models.Sale

// 	err := utils.ReadJSON(w, r, &requestBody)
// 	if err != nil {
// 		h.errorLog.Println("ERROR_02_SaleProducts: Unable to unmarshal JSON =>", err)
// 		utils.BadRequest(w, err)
// 		return
// 	}

// 	h.infoLog.Printf("Received order data: %+v\n", requestBody)

// 	memoNo, err := h.DB.SaleProducts(r.Context(), branchID, &requestBody)
// 	if err != nil {

// 		h.errorLog.Println("ERROR_03_SaleProducts: Unable to process sale =>", err)
// 		if strings.Contains(err.Error(), `duplicate key value violates unique constraint "sales_history_memo_no_branch_id_key"`) {
// 			err = errors.New("Duplicate memo number is not allowed")
// 		}
// 		utils.BadRequest(w, err)
// 		return
// 	}

// 	var resp struct {
// 		Error   bool   `json:"error"`
// 		Message string `json:"message"`
// 		MemoNo  string `json:"memo_no"`
// 	}

// 	resp.Error = false
// 	resp.Message = "Products sold successfully"
// 	resp.MemoNo = memoNo

// 	utils.WriteJSON(w, http.StatusCreated, resp)
// }
// func (h *ProductHandler) UpdateSoldProducts(w http.ResponseWriter, r *http.Request) {
// 	branchID := utils.GetBranchID(r)
// 	if branchID == 0 {
// 		h.errorLog.Println("ERROR_01_UpdateSoldProducts: Branch id not found")
// 		utils.BadRequest(w, errors.New("Branch ID not found. Please include 'X-Branch-ID' header, e.g., X-Branch-ID: 1"))
// 		return
// 	}
// 	memoNo := strings.TrimSpace(r.URL.Query().Get("memo_no"))
// 	if memoNo == "" {
// 		h.errorLog.Println("ERROR_02_UpdateSoldProducts: Memo not found in the payload")
// 		utils.BadRequest(w, errors.New("Memo not found in the payload"))
// 		return
// 	}
// 	var requestBody models.Sale
// 	err := utils.ReadJSON(w, r, &requestBody)
// 	if err != nil {
// 		h.errorLog.Println("ERROR_03_UpdateSoldProducts: Unable to unmarshal JSON =>", err)
// 		utils.BadRequest(w, err)
// 		return
// 	}
// 	requestBody.MemoNo = memoNo
// 	h.infoLog.Println(requestBody)
// 	for _, v := range requestBody.Items {
// 		fmt.Println(v.ID)
// 	}

// 	err = h.DB.UpdateSoldProducts(r.Context(), branchID, requestBody)
// 	if err != nil {
// 		h.errorLog.Println("ERROR_03_SaleProducts: Unable to process sale =>", err)
// 		utils.BadRequest(w, err)
// 		return
// 	}

// 	var resp struct {
// 		Error   bool   `json:"error"`
// 		Message string `json:"message"`
// 	}

// 	resp.Error = false
// 	resp.Message = "Sold products updated successfully"

// 	utils.WriteJSON(w, http.StatusCreated, resp)
// }

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
// func (o *ProductHandler) UpdateSale(w http.ResponseWriter, r *http.Request) {
// 	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
// 	if id == 0 || err != nil {
// 		utils.BadRequest(w, errors.New("Invalid order id"))
// 		return
// 	}
// 	var orderDetails models.OrderDB
// 	if err := utils.ReadJSON(w, r, &orderDetails); err != nil {
// 		o.errorLog.Println("UpdateOrder_ReadJSON:", err)
// 		utils.BadRequest(w, err)
// 		return
// 	}

// 	branchID := utils.GetBranchID(r)
// 	if branchID == 0 {
// 		utils.BadRequest(w, errors.New("Branch ID not found. Include 'X-Branch-ID' header"))
// 		return
// 	}
// 	orderDetails.BranchID = branchID

// 	o.infoLog.Printf("Received order data: %+v\n", orderDetails)

// 	// load old data
// 	oldOrderDetails, err := o.DB.GetOrderDetailsByID(r.Context(), orderDetails.ID)
// 	if err != nil {
// 		o.errorLog.Println("UpdateOrder_DB:", err)
// 		utils.ServerError(w, err)
// 		return
// 	}
// 	err = o.DB.UpdateOrder(r.Context(), &orderDetails, oldOrderDetails)
// 	if err != nil {
// 		o.errorLog.Println("UpdateOrder_DB:", err)
// 		utils.ServerError(w, err)
// 		return
// 	}

// 	resp := map[string]any{
// 		"error":   false,
// 		"status":  "success",
// 		"message": "Order updated successfully",
// 	}
// 	utils.WriteJSON(w, http.StatusCreated, resp)
// }

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
		"sale":  sale,
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
		"sales":      sales,
		"total_count": totalCount,
		"page":        page,
	}

	utils.WriteJSON(w, http.StatusOK, response)
}
