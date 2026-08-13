package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/projuktisheba/erp-mini-api/internal/dbrepo"
	"github.com/projuktisheba/erp-mini-api/internal/models"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

type OrderHandler struct {
	DB        *dbrepo.OrderRepo
	ProductDB *dbrepo.ProductRepo
	BranchDB  *dbrepo.BranchRepo
	infoLog   *log.Logger
	errorLog  *log.Logger
}

func GetUserFromContext(r *http.Request) (*models.JWT, bool) {
	u, ok := r.Context().Value(models.UserContextKey).(*models.JWT)
	if !ok || u == nil {
		return nil, false
	}
	return u, true
}

func NewOrderHandler(db *dbrepo.OrderRepo, productDB *dbrepo.ProductRepo, branchDB *dbrepo.BranchRepo, infoLog *log.Logger, errorLog *log.Logger) *OrderHandler {
	return &OrderHandler{
		DB:        db,
		ProductDB: productDB,
		BranchDB:  branchDB,
		infoLog:   infoLog,
		errorLog:  errorLog,
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

	orderID, err := o.DB.CreateOrder(r.Context(), &orderDetails)
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
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid order id"))
		return
	}

	user, ok := GetUserFromContext(r)
	if !ok || user == nil || strings.ToLower(user.Role) != "chairman" {
		utils.WriteJSON(w, http.StatusForbidden, models.Response{
			Error:   true,
			Message: "Only Chairman can edit an order",
		})
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

	// load old data
	oldOrderDetails, err := o.DB.GetOrderDetailsByID(r.Context(), orderDetails.ID)
	if err != nil {
		o.errorLog.Println("UpdateOrder_DB:", err)
		utils.ServerError(w, err)
		return
	}
	err = o.DB.UpdateOrder(r.Context(), &orderDetails, oldOrderDetails)
	if err != nil {
		o.errorLog.Println("UpdateOrder_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Order updated successfully",
	}
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// CancelOrder handles DELETE /orders/cancel/{id}
func (o *OrderHandler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if orderID == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid order id"))
		return
	}

	user, ok := GetUserFromContext(r)
	if !ok || user == nil || strings.ToLower(user.Role) != "chairman" {
		utils.WriteJSON(w, http.StatusForbidden, models.Response{
			Error:   true,
			Message: "Only Chairman can cancel an order",
		})
		return
	}

	err = o.DB.CancelOrder(r.Context(), orderID)
	if err != nil {
		o.errorLog.Println("CancelOrder_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Order cancelled successfully",
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

// UndoCancelOrder handles POST /orders/undo-cancel/{id}
func (o *OrderHandler) UndoCancelOrder(w http.ResponseWriter, r *http.Request) {
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if orderID == 0 || err != nil {
		utils.BadRequest(w, errors.New("Invalid order id"))
		return
	}

	user, ok := GetUserFromContext(r)
	if !ok || user == nil || strings.ToLower(user.Role) != "chairman" {
		utils.WriteJSON(w, http.StatusForbidden, models.Response{
			Error:   true,
			Message: "Only Chairman can undo order cancellation",
		})
		return
	}

	err = o.DB.UndoCancelOrder(r.Context(), orderID)
	if err != nil {
		o.errorLog.Println("UndoCancelOrder_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Order cancellation undone successfully",
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

// OrderDelivery handles POST /orders/delivery
func (o *OrderHandler) OrderDelivery(w http.ResponseWriter, r *http.Request) {
	var orderTx models.OrderTransactionDB
	err := utils.ReadJSON(w, r, &orderTx)
	if err != nil {
		o.errorLog.Println("OrderDelivery_ReadJSON:", err)
		utils.BadRequest(w, err)
		return
	}
	// load old data
	oldOrderDetails, err := o.DB.GetOrderDetailsByID(r.Context(), *orderTx.OrderID)
	if err != nil {
		o.errorLog.Println("OrderDelivery_DB => can't load old order info:", err)
		utils.ServerError(w, err)
		return
	}
	err = o.DB.OrderDelivery(r.Context(), orderTx, *oldOrderDetails)
	if err != nil {
		o.errorLog.Println("OrderDelivery_DB:", err)
		utils.ServerError(w, err)
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Order delivery recorded successfully",
	}
	utils.WriteJSON(w, http.StatusCreated, resp)
}

// DeleteOrderDeliveryRecord handles POST /orders/delivery
func (o *OrderHandler) DeleteOrderDeliveryRecord(w http.ResponseWriter, r *http.Request) {
	orderTxID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if orderTxID == 0 || err != nil {
		utils.ServerError(w, errors.New("Invalid order transaction id"))
		return
	}

	branchID := utils.GetBranchID(r)
	if branchID == 0 {
		utils.BadRequest(w, errors.New("Branch ID not found. Include 'X-Branch-ID' header"))
		return
	}
	err = o.DB.DeleteOrderDeliveryRecord(r.Context(), orderTxID, branchID)
	if err != nil {
		o.errorLog.Println("DeleteOrderDeliveryRecord_DB:", err)
		utils.ServerError(w, errors.New("Failed to delete record"))
		return
	}

	resp := map[string]any{
		"error":   false,
		"status":  "success",
		"message": "Delivery record deleted successfully",
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

// GetPublicInvoice handles GET /api/v1/public/invoice?type=order|sale&memo_no=234234
func (o *OrderHandler) GetPublicInvoice(w http.ResponseWriter, r *http.Request) {
	invoiceType := strings.ToLower(r.URL.Query().Get("type"))
	memoNo := r.URL.Query().Get("memo_no")

	if memoNo == "" {
		utils.BadRequest(w, errors.New("Invoice memo_no is required"))
		return
	}

	var data any
	var branchID int64

	if invoiceType == "sale" {
		sale, err := o.ProductDB.GetSaleDetailsByMemoNo(r.Context(), memoNo)
		if err != nil {
			o.errorLog.Println("GetPublicInvoice_Sale:", err)
			utils.NotFound(w, "Sale invoice not found")
			return
		}
		data = sale
		branchID = sale.BranchID
	} else {
		order, err := o.DB.GetOrderDetailsByMemoNo(r.Context(), memoNo)
		if err != nil {
			o.errorLog.Println("GetPublicInvoice_Order:", err)
			utils.NotFound(w, "Order invoice not found")
			return
		}
		data = order
		branchID = order.BranchID
	}

	var branch *models.Branch
	if branchID > 0 && o.BranchDB != nil {
		branch, _ = o.BranchDB.GetBranchByID(r.Context(), branchID)
	}

	resp := map[string]any{
		"error":  false,
		"status": "success",
		"type":   invoiceType,
		"data":   data,
		"branch": branch,
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}
