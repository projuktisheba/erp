package api

import (
	"net"
	"net/http"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/projuktisheba/erp-mini-api/internal/utils"
)

func (app *application) routes() http.Handler {
	mux := chi.NewRouter()

	// --- Global middlewares ---
	mux.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Branch-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	mux.Use(app.Logger) // logger

	// --- Public Routes ---
	mux.Post("/api/v1/signin", app.Handlers.Auth.Signin)

	// --- Static file serving for images ---
	imageDir := filepath.Join(".", "data", "images")
	fs := http.StripPrefix("/api/v1/images/", http.FileServer(http.Dir(imageDir)))
	mux.Handle("/api/v1/images/*", fs)

	// --- Health check ---
	mux.Get("/api/v1/ping", func(w http.ResponseWriter, r *http.Request) {
		ip := "unknown"
		if conn, err := net.Dial("udp", "1.1.1.1:80"); err == nil {
			defer conn.Close()
			ip = conn.LocalAddr().(*net.UDPAddr).IP.String()
		}
		resp := map[string]interface{}{
			"status":    "live",
			"server_ip": ip,
		}
		utils.WriteJSON(w, http.StatusOK, resp)
	})

	// --- Protected Routes ---
	protected := chi.NewRouter()
	// protected.Use(app.AuthUser)

	// -------------------- HR(Employee) Routes --------------------
	protected.Route("/api/v1/hr", func(r chi.Router) {
		// Get single employee by id, email, or mobile (query param)
		// Example: GET /api/v1/hr/employee?id=5
		r.Get("/employee", app.Handlers.Employee.GetEmployeeByID)

		// Add a new employee
		// Example: POST /api/v1/hr/employee/new
		r.Post("/employee/new", app.Handlers.Employee.AddEmployee)

		// Get paginated list of employees with optional filters
		// Example: GET /api/v1/hr/employees?page=1&limit=20&role=salesperson&status=active
		r.Get("/employees", app.Handlers.Employee.PaginatedEmployeeList)

		// 	// Get all active employee names and IDs
		// 	// Example: GET /api/v1/hr/employees/names
		// 	r.Get("/employees/names", app.Handlers.Employee.GetEmployeesNameAndID)

		// 	// Upload employee profile picture
		// 	// Example: POST /api/v1/hr/profile-picture
		// 	r.Post("/employee/profile-picture", app.Handlers.Employee.UploadEmployeeProfilePicture)

		// Update general employee details
		// Example: PUT /api/v1/hr/employee/update/{id}
		r.Put("/employee/update/{id}", app.Handlers.Employee.UpdateEmployee)

		// 	// Update employee salary and overtime rate
		// 	// Example: PUT /api/v1/hr/employee/salary
		// 	r.Put("/employee/salary", app.Handlers.Employee.UpdateEmployeeSalary)

		// 	// Generate and give employee salary
		// 	// Example: POST /api/v1/hr/employee/salary/submit
		// 	r.Post("/employee/salary/submit", app.Handlers.Employee.SubmitSalary)

		// 	// Update employee role and status
		// 	// Example: PUT /api/v1/hr/employee/role
		// 	r.Put("/employee/role", app.Handlers.Employee.UpdateEmployeeRole)

		// 	// Update employee progress record
		// 	r.Post("/worker/progress", app.Handlers.Employee.RecordWorkerDailyProgress)
		// 	r.Patch("/worker/progress", app.Handlers.Employee.UpdateWorkerDailyProgress)
	})

	// -------------------- Customer Routes --------------------
	protected.Route("/api/v1", func(r chi.Router) {
		r.Get("/customer", app.Handlers.Customer.GetCustomerByID)

		//create customer
		r.Post("/customer/new", app.Handlers.Customer.AddCustomer)
		//update customer
		r.Put("/customer/update/{id}", app.Handlers.Customer.UpdateCustomerInfo)

		// r.Put("/customer/due/deduct", app.Handlers.Customer.DeductCustomerDueAmount)
		// r.Put("/customer/status", app.Handlers.Customer.UpdateCustomerStatus)

		r.Get("/customers", app.Handlers.Customer.GetCustomers) //query {branchID, limit, page}

		r.Get("/customers/filter", app.Handlers.Customer.FilterCustomersByName)
		r.Get("/customers/names", app.Handlers.Customer.GetCustomersNameAndID)
		r.Get("/customers/with-due", app.Handlers.Customer.GetCustomersWithDueHandler)

		r.Post("/supplier", app.Handlers.Supplier.AddSupplier)
		r.Put("/supplier", app.Handlers.Supplier.UpdateSupplier)
		r.Get("/supplier", app.Handlers.Supplier.GetSupplierByID)
		r.Get("/suppliers", app.Handlers.Supplier.ListSuppliers)
	})

	// -------------------- Product Routes --------------------
	protected.Route("/api/v1/products", func(r chi.Router) {
		r.Get("/", app.Handlers.Product.GetProductsHandler)
		// r.Post("/restock", app.Handlers.Product.RestockProducts)
		// r.Get("/stocks", app.Handlers.Product.GetProductStockReportHandler)
		r.Post("/sales/new", app.Handlers.Product.SaleProducts)
		// r.Patch("/sale", app.Handlers.Product.UpdateSoldProducts)
		// r.Get("/sales/details", app.Handlers.Product.GetSaleDetails)
		// r.Get("/sales/history", app.Handlers.Product.GetSaleReport)

		// -------------------- Order Routes --------------------
		r.Post("/orders/new", app.Handlers.Order.AddOrder)

		// r.Get("/orders/search", app.Handlers.Order.SearchOrders)
		r.Get("/orders", app.Handlers.Order.GetOrdersHandler)
		r.Get("/orders/{id}", app.Handlers.Order.GetOrderDetailsByID)
		// r.Patch("/", app.Handlers.Order.UpdateOrder)
		// r.Delete("/", app.Handlers.Order.CancelOrder)
		// r.Patch("/checkout", app.Handlers.Order.CheckoutOrder)
		// r.Patch("/delivery", app.Handlers.Order.OrderDelivery)
		// r.Get("/", app.Handlers.Order.GetOrderDetailsByID)
		// r.Get("/items", app.Handlers.Order.GetOrderItemsByMemoNo)
		// r.Get("/list", app.Handlers.Order.ListOrders)
		// r.Get("/list/paginated", app.Handlers.Order.ListOrdersPaginatedHandler)
		// r.Get("/list/status", app.Handlers.Order.ListOrdersByStatusHandler)
		// r.Get("/summary", app.Handlers.Order.GetOrderSummaryHandler)

	})

	// -------------------- Inventory Routes --------------------
	protected.Route("/api/v1/purchase", func(r chi.Router) {
		r.Post("/", app.Handlers.Purchase.AddPurchase)
		r.Patch("/", app.Handlers.Purchase.UpdatePurchase)
		r.Get("/list", app.Handlers.Purchase.ListPurchases)
	})

	// -------------------- Account & Transaction Routes --------------------
	protected.Route("/api/v1/accounts", func(r chi.Router) {
		r.Get("/", app.Handlers.Account.GetAccountsHandler)
		r.Get("/names", app.Handlers.Account.GetAccountNamesHandler)
	})

	protected.Route("/api/v1/transactions", func(r chi.Router) {
		r.Get("/summary", app.Handlers.Transaction.GetTransactionSummaryHandler)
		r.Get("/list", app.Handlers.Transaction.GetTransactionSummaryHandler)
	})

	// -------------------- Report Routes --------------------
	protected.Route("/api/v1/reports", func(r chi.Router) {
		r.Get("/dashboard/orders/overview", app.Handlers.Report.GetOrderOverView)
		r.Get("/employee/progress", app.Handlers.Report.GetEmployeeProgressReport)
		r.Get("/employee/salaries", app.Handlers.Report.GetSalaryListHandler)
		r.Get("/worker/progress", app.Handlers.Report.GetWorkerProgressReport)
		r.Get("/branch", app.Handlers.Report.GetBranchReport)
	})

	// Mount protected routes
	mux.Mount("/", protected)

	return mux
}
