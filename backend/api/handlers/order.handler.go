package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/projuktisheba/erp-mini-api/internal/dbrepo"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type OrderHandler struct {
	DB       *dbrepo.OrderRepo
	infoLog  *log.Logger
	errorLog *log.Logger
}

func NewOrderHandler(db *dbrepo.OrderRepo, infoLog *log.Logger, errorLog *log.Logger) *OrderHandler {
	return &OrderHandler{
		DB:       db,
		infoLog:  infoLog,
		errorLog: errorLog,
	}
}

// AddOrder handles POST /orders/new
func (o *OrderHandler) AddOrder(w http.ResponseWriter, r *http.Request) {
	var orderDetails models.OrderDB
	if err := utils.ReadJSON(w, r, &orderDetails); err != nil {
		o.errorLog.Println("AddOrder_ReadJSON:", err)
		utils.BadRequest(w, err)
		return
	}

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		utils.BadRequest(w, errors.New("Branch ID not found. Include 'X-Branch-ID' header"))
		return
	}
	orderDetails.BranchID = branchID

	o.infoLog.Printf("Received order data: %+v\n", orderDetails)

	orderID, err := o.DB.CreateOrder(r.Context(), &orderDetails);
	if err != nil {
		o.errorLog.Println("AddOrder_DB:", err)
		if utils.IsUniqueViolation(err, "orders_memo_no_branch_id_key") {
			utils.BadRequest(w, errors.New("duplicate memo number not allowed"))
			return
		}
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":    false,
		"status":   "success",
		"message":  "Order added successfully",
		"order_id": orderID,
	}
	utils.WriteJSON(w, http.StatusCreated, resp)
}
// UpdateOder handles PATCH /orders/update/{id}
func (o *OrderHandler) UpdateOrder(w http.ResponseWriter, r *http.Request) {
	id, err:= strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid order id"))
		return
	}
	var orderDetails models.OrderDB
	if err := utils.ReadJSON(w, r, &orderDetails); err != nil {
		o.errorLog.Println("UpdateOrder_ReadJSON:", err)
		utils.BadRequest(w, err)
		return
	}

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		utils.BadRequest(w, errors.New("Branch ID not found. Include 'X-Branch-ID' header"))
		return
	}
	orderDetails.BranchID = branchID

	o.infoLog.Printf("Received order data: %+v\n", orderDetails)

	// load old data
	oldOrderDetails, err := o.DB.GetOrderDetailsByID(r.Context(), orderDetails.ID);
	if err != nil {
		o.errorLog.Println("UpdateOrder_DB:", err)
		utils.ServerError(w, err)
		return
	}
	err = o.DB.UpdateOrder(r.Context(), &orderDetails, oldOrderDetails);
	if err != nil {
		o.errorLog.Println("UpdateOrder_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":    false,
		"status":   "success",
		"message":  "Order updated successfully",
	}
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// SearchOrders handles GET /orders/search?search=xxx&branch_id=1&limit=20
func (o *OrderHandler) GetOrdersHandler(w http.ResponseWriter, r *http.Request) {
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
	orders, totalCount, err := o.DB.GetOrders(r.Context(), branchID, search, status, page, limit)
	if err != nil {
		utils.BadRequest(w, errors.New(""))
		return
	}

	// 3. Return JSON
	response := map[string]interface{}{
		"orders":      orders,
		"total_count": totalCount,
		"page":        page,
	}

	utils.WriteJSON(w, http.StatusOK, response)
}

// GetOrderByID handles GET /orders/{id}
func (o *OrderHandler) GetOrderDetailsByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	if idStr == "" {
		utils.BadRequest(w, errors.New("order ID required"))
		return
	}

	orderID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(w, errors.New("invalid order ID"))
		return
	}

	order, err := o.DB.GetOrderDetailsByID(r.Context(), orderID)
	if err != nil {
		o.errorLog.Println("GetOrderByID_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":  false,
		"status": "success",
		"order":  order,
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}
