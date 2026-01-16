// js/saleHistory.js

// --- STATE MANAGEMENT ---
window.saleHistoryState = window.saleHistoryState || {
  sales: [],
  selectedSale: null,
  totalRecords: 0,
  currentPage: 1,
  pageLength: 10,
  searchQuery: "",
  statusFilter: "",
  paymentAccounts: [],
  branchID: null, // Will be populated from global state
  searchDebounce: null,
};

// --- INITIALIZATION ---
window.initSalesHistoryPage = async function () {
  console.log("Initializing Sale History Page...");

  // 1. Grab Elements
  const searchInput = document.getElementById("searchSaleInput");
  const statusSelect = document.getElementById("statusFilter");
  const pageLengthSelect = document.getElementById("pageLengthSelector");

  // 2. Set Initial Branch ID
  if (window.globalState && window.globalState.user) {
    saleHistoryState.branchID = window.globalState.user.branch_id;
  }

  // 3. Search Listener
  if (searchInput) {
    searchInput.value = saleHistoryState.searchQuery;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(saleHistoryState.searchDebounce);
      saleHistoryState.searchDebounce = setTimeout(() => {
        const newVal = e.target.value.trim();
        if (saleHistoryState.searchQuery !== newVal) {
          saleHistoryState.searchQuery = newVal;
          saleHistoryState.currentPage = 1;
          fetchSales();
        }
      }, 400);
    });
  }

  // 4. Status Filter Listener
  if (statusSelect) {
    statusSelect.value = saleHistoryState.statusFilter;
    statusSelect.addEventListener("change", (e) => {
      saleHistoryState.statusFilter = e.target.value;
      saleHistoryState.currentPage = 1;
      fetchSales();
    });
  }

  // 5. Page Length Listener
  if (pageLengthSelect) {
    pageLengthSelect.value = saleHistoryState.pageLength.toString();
    pageLengthSelect.addEventListener("change", (e) => {
      saleHistoryState.pageLength = parseInt(e.target.value);
      saleHistoryState.currentPage = 1;
      fetchSales();
    });
  }

  // Note: Pagination listeners are now handled dynamically in updatePaginationInfo
  // via the window.changePage function below.

  // 6. Initial Fetch
  fetchSales();

  // 7. Fetch payment accounts
  accountsRes = await fetch(`${window.globalState.apiBase}/accounts`, {
    headers: window.getAuthHeaders(),
  });

  if (!accountsRes.ok) throw new Error("Failed to fetch accounts");

  const accountsData = await accountsRes.json();

  // Safety checks for data structure
  saleHistoryState.paymentAccounts = Array.isArray(accountsData.accounts)
    ? accountsData.accounts
    : [];
};

// --- FETCH SALES ---
async function fetchSales() {
  // Show loading state (Optional but good UX)
  const tbody = document.getElementById("historyTableBody");
  if (tbody && saleHistoryState.sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Loading...</td></tr>`;
  }

  const params = new URLSearchParams();

  // Backend expects 0-based index usually, or handle the math here
  // Assuming backend takes: limit, offset OR pageIndex, pageSize
  if (saleHistoryState.branchID)
    params.append("branch_id", saleHistoryState.branchID);
  if (saleHistoryState.searchQuery)
    params.append("search", saleHistoryState.searchQuery);
  if (
    saleHistoryState.statusFilter &&
    saleHistoryState.statusFilter !== "all"
  ) {
    params.append("status", saleHistoryState.statusFilter);
  }

  // Pagination params
  params.append("page", saleHistoryState.currentPage); // 1-based for some APIs
  params.append("pageIndex", saleHistoryState.currentPage - 1); // 0-based for others (Check your Go backend)
  params.append("pageLength", saleHistoryState.pageLength);
  params.append("limit", saleHistoryState.pageLength); // Alias

  try {
    // Ensure apiBase is defined, fallback to relative path if not
    const apiBase = window.globalState?.apiBase || "/api/v1";

    const res = await fetch(
      `${apiBase}/products/sales/list?${params.toString()}`,
      {
        headers: window.getAuthHeaders
          ? window.getAuthHeaders()
          : {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
      }
    );

    if (!res.ok) throw new Error("Failed to fetch sales");

    const data = await res.json();

    // Safety checks for data structure
    saleHistoryState.sales = Array.isArray(data.sales) ? data.sales : [];
    saleHistoryState.totalRecords = parseInt(
      data.total_count || data.totalRecords || 0
    );

    renderSales();
    // REUSABLE PAGINATION CALL
    window.renderPagination(
      "paginationContainer", // ID of button container
      "paginationInfo", // ID of text info
      {
        currentPage: saleHistoryState.currentPage,
        totalRecords: saleHistoryState.totalRecords,
        pageLength: saleHistoryState.pageLength,
      },
      (newPage) => {
        // The Callback: What happens when a user clicks a page?
        saleHistoryState.currentPage = newPage;
        fetchSales();
      }
    );
  } catch (err) {
    console.error("Fetch Error:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
            <td colspan="7" class="py-8 text-center text-rose-500 bg-rose-50 rounded-lg">
                Error loading data. Please try again.
            </td>
        </tr>`;
    }
  }
}

// --- RENDER SALES (Aesthetic Version) ---
function renderSales() {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  // Empty State
  if (saleHistoryState.sales.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center">
          <div class="flex flex-col items-center justify-center text-slate-400">
            <svg class="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            <p class="text-base font-medium">No sales found.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  // Utilities
  const getInitials = (name) =>
    name
      ? name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "??";

  const getAvatarColor = (name) => {
    const colors = [
      "bg-blue-100 text-blue-600",
      "bg-purple-100 text-purple-600",
      "bg-emerald-100 text-emerald-600",
      "bg-amber-100 text-amber-600",
      "bg-rose-100 text-rose-600",
    ];
    return colors[(name?.length || 0) % colors.length];
  };

  // Render Rows
  tbody.innerHTML = saleHistoryState.sales
    .map((o) => {
      const customerName = o.customer?.name || o.customer_name || "Unknown";
      const customerMobile = o.customer?.mobile || o.customer_mobile || "";

      const total = o.total_amount || 0;
      const paid = o.received_amount || 0;
      const due = total - paid;

      const dateStr = new Date(o.sale_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      // Status Styling
      let st = {
        css: "bg-slate-100 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
      };
      if (o.status === "delivered")
        st = {
          css: "bg-emerald-50 text-emerald-700 border-emerald-200",
          dot: "bg-emerald-500",
        };
      else if (o.status === "pending")
        st = {
          css: "bg-amber-50 text-amber-700 border-amber-200",
          dot: "bg-amber-500",
        };
      else if (o.status === "partial")
        st = {
          css: "bg-blue-50 text-blue-700 border-blue-200",
          dot: "bg-blue-500",
        };
      else if (o.status === "cancelled")
        st = {
          css: "bg-rose-50 text-rose-700 border-rose-200",
          dot: "bg-rose-500",
        };

      const canDeliver = o.status === "pending" || o.status === "partial";
      // const canEdit = o.status === "pending";
      const canEdit = true;

      return `
      <tr class="group border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-all duration-200">
        <td class="px-6 py-4 whitespace-nowrap">
           <span class="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
             #${o.memo_no.replace("INV-", "")}
           </span>
        </td>

        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
             ${dateStr}
        </td>

        <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex items-center">
            <div class="h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${getAvatarColor(
              customerName
            )} mr-3 ring-1 ring-slate-100">
              ${getInitials(customerName)}
            </div>
            <div>
              <div class="text-sm font-bold text-slate-900">${customerName}</div>
              <div class="text-xs font-medium text-slate-500 tracking-wide">${customerMobile}</div>
            </div>
          </div>
        </td>

        <td class="px-6 py-4 whitespace-nowrap text-right">
           <div class="flex flex-col items-end gap-1">
             <span class="inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-semibold bg-slate-50 text-black-600 border border-dark-100">
                    <span>Total:</span>
                    <span>${total}</span>
                  </span>
             
             ${
               due > 0
                 ? `<span class="inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                    <span>Due:</span>
                    <span>${due}</span>
                  </span>`
                 : `<span class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-transparent px-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    Paid
                  </span>`
             }
           </div>
        </td>

        <td class="px-6 py-4 whitespace-nowrap text-center">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
            st.css
          }">
            <span class="w-2 h-2 mr-2 rounded-full ${st.dot}"></span>
            ${o.status.toUpperCase()}
          </span>
        </td>

        <td class="px-6 py-4 whitespace-nowrap text-center">
          <div class="flex items-center justify-center space-x-3 opacity-80 group-hover:opacity-100 transition-opacity">
            <button onclick="viewSale(${
              o.id
            })" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 hover:shadow-sm" title="View">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </button>
            ${
              canEdit
                ? `
            <button onclick="editSale(${o.id})" class="p-2 text-slate-400 hover:text-amber-600 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-200 hover:shadow-sm" title="Edit">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>`
                : `<div class="w-9"></div>`
            }
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

// --- GLOBAL ACTIONS ---
// These need to be on the window object so the HTML 'onclick' attributes can find them

window.editSale = function (id) {
  console.log("Edit Sale:", id);
  // Trigger your Edit Logic here
  localStorage.setItem("saleID", id);
  loadPage("order_sale", "Edit Sale Entry");
};

async function viewSale(id) {
  const modal = document.getElementById("viewSaleModal");
  if (!modal) return;

  modal.classList.remove("hidden");

  // Helper to safely set text
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("viewMemoNo", "Loading...");

  // Reset Tables with "Loading" state that spans correct columns
  const itemsBody = document.getElementById("viewItemsBody");
  const transBody = document.getElementById("viewTransactionsBody");

  if (itemsBody)
    itemsBody.innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-sm text-slate-500 animate-pulse">Loading items...</td></tr>`;
  if (transBody)
    transBody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500 animate-pulse">Loading history...</td></tr>`;

  try {
    const response = await fetch(
      `${window.globalState.apiBase}/products/sales/details/${id}`
    );
    const data = await response.json();

    if (data.error) throw new Error("Server returned error");
    const sale = data.sale;

    if (sale == null) {
      showNotification("error", "Sale Details Not Found");
      saleHistoryState.selectedSale = null;
      return;
    }
    //assign value to selected sale
    saleHistoryState.selectedSale = sale;

    // --- 1. POPULATE HEADER & INFO ---
    setText("viewMemoNo", `#${sale.memo_no}`); // Added # hash for style
    setText("viewCustomerName", sale.customer?.name || "Unknown Customer");
    setText("viewCustomerMobile", sale.customer?.mobile || "");

    const formatDate = (d) =>
      d
        ? new Date(d).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "-";
    const formatMoney = (m) =>
      parseFloat(m || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    setText("viewSaleDate", formatDate(sale.sale_date));
    // Optional: If you kept the salesperson field in HTML
    setText("viewSalespersonName", sale.salesperson?.name || "Unknown");
    setText("viewSalespersonMobile", sale.salesperson?.mobile || "");

    // --- 2. STATUS BADGE ---
    const statusEl = document.getElementById("viewStatus");
    if (statusEl) {
      const status = sale.status.toLowerCase();
      statusEl.textContent = status.toUpperCase();

      // Reset base classes
      statusEl.className =
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ring-1 ring-inset uppercase tracking-wide";

      // Apply specific color schemes
      if (status === "delivered") {
        statusEl.classList.add(
          "bg-emerald-50",
          "text-emerald-700",
          "ring-emerald-600/20"
        );
      } else if (status === "pending") {
        statusEl.classList.add(
          "bg-amber-50",
          "text-amber-700",
          "ring-amber-600/20"
        );
      } else if (status === "partial") {
        statusEl.classList.add(
          "bg-blue-50",
          "text-blue-700",
          "ring-blue-600/20"
        );
      } else if (status === "cancelled") {
        statusEl.classList.add(
          "bg-rose-50",
          "text-rose-700",
          "ring-rose-600/20"
        );
      } else {
        statusEl.classList.add(
          "bg-slate-50",
          "text-slate-600",
          "ring-slate-500/20"
        );
      }
    }

    // --- 3. ITEMS TABLE ---
    const items = sale.items || [];
    if (itemsBody) {
      if (items.length === 0) {
        itemsBody.innerHTML = `<tr><td colspan="3" class="px-4 py-6 text-center text-sm text-slate-400 italic">No items found.</td></tr>`;
      } else {
        itemsBody.innerHTML = items
          .map(
            (item) => `
                    <tr class="group hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3 text-sm font-medium text-slate-900 group-hover:text-black">
                            ${item.product_name}
                        </td>
                        <td class="px-4 py-3 text-sm text-slate-600 text-right">
                            ${item.quantity}
                        </td>
                        <td class="px-4 py-3 text-sm text-slate-900 text-right font-bold">
                            ${formatMoney(item.subtotal)}
                        </td>
                    </tr>
                `
          )
          .join("");

        // Add Summary Row inside the table (Optional, or rely on the footer cards)
        // This styling matches the table footer look
        itemsBody.innerHTML += `
                    <tr class="bg-slate-50 border-t border-slate-200">
                        <td class="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                            Total Items
                        </td>
                        <td class="px-4 py-2 text-sm font-bold text-slate-800 text-right">
                            ${sale.total_items}
                        </td>
                         <td class="px-4 py-2 text-sm font-bold text-slate-800 text-right">
                            ${formatMoney(sale.total_amount)}
                        </td>
                    </tr>`;
      }
    }

    // --- 4. TRANSACTIONS TABLE ---
    const transactions = sale.sale_transactions || [];
    if (transBody) {
      if (transactions.length === 0) {
        transBody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-slate-400 italic">No history available.</td></tr>`;
      } else {
        // Calculate totals
        let totalQty = 0;
        let totalAmount = 0;

        transBody.innerHTML = transactions
          .map((t) => {
            const typeStr = t.transaction_type.toLowerCase();
            const isPayment =
              typeStr.includes("payment") || typeStr.includes("advance");
            const isDelivery = typeStr.includes("delivery");

            let typeBadgeClass = "bg-slate-100 text-slate-600 border-slate-200"; // Default
            if (isPayment)
              typeBadgeClass =
                "bg-emerald-50 text-emerald-600 border-emerald-200";
            if (isDelivery)
              typeBadgeClass = "bg-blue-50 text-blue-600 border-blue-200";

            // Update totals
            totalQty += t.quantity_delivered || 0;
            totalAmount += t.amount || 0;

            return `
          <tr class="hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 text-sm text-slate-600">
                  ${formatDate(t.transaction_date)}
              </td>
              <td class="px-4 py-3">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${typeBadgeClass}">
                      ${t.transaction_type}
                  </span>
              </td>
              <td class="px-4 py-3 text-sm text-center text-slate-600">
                  ${t.payment_account_name || ""}
              </td>
              <td class="px-4 py-3 text-sm text-right text-slate-600">
                  ${t.quantity_delivered > 0 ? t.quantity_delivered : "-"}
              </td>
              <td class="px-4 py-3 text-sm text-right font-bold text-emerald-600">
                  ${t.amount > 0 ? formatMoney(t.amount) : "-"}
              </td>
          </tr>
        `;
          })
          .join("");

        // Add totals row at the end
        transBody.innerHTML += `
        <tr class="bg-slate-100 font-bold">
            <td class="px-4 py-3 text-sm text-slate-700" colspan="3">Total</td>
            <td class="px-4 py-3 text-sm text-right text-slate-700">${
              totalQty > 0 ? totalQty : "-"
            }</td>
            <td class="px-4 py-3 text-sm text-right text-emerald-700">${
              totalAmount > 0 ? formatMoney(totalAmount) : "-"
            }</td>
        </tr>
      `;
      }
    }

    // --- 5. TOTALS FOOTER ---
    const total = parseFloat(sale.total_amount || 0);
    const received = parseFloat(sale.received_amount || 0);
    const due = Math.max(0, total - received);

    setText("viewTotalAmount", formatMoney(total));
    setText("viewReceivedAmount", formatMoney(received));
    setText("viewDueAmount", formatMoney(due));

    // Colorize Due Amount logic
    const dueEl = document.getElementById("viewDueAmount");
    if (dueEl) {
      if (due > 0) dueEl.className = "text-xl font-extrabold text-rose-600";
      else {
        dueEl.className = "text-xl font-extrabold text-emerald-600";
        dueEl.textContent = "PAID";
      }
    }

    window.currentViewingSaleId = id;
  } catch (error) {
    console.error("View Sale Error:", error);
    // User friendly error in the modal
    if (itemsBody)
      itemsBody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-center text-red-500">Error loading data.</td></tr>`;
  }
}

window.printSelectedSale = async function () {
  printSaleInvoice(
    saleHistoryState.selectedSale.id,
    saleHistoryState.selectedSale
  );
};

window.closeViewModal = function () {
  document.getElementById("viewSaleModal").classList.add("hidden");
};

// --- DYNAMIC PAYMENT MODAL LOGIC ---

// 1. Open & Render Modal
window.PaymentHandler = function (id) {
  console.log("Deliver button clicked for ID:", id);

  // 1. Find Sale using loose equality
  const sale = saleHistoryState.sales.find((o) => o.id == id);

  if (!sale) {
    console.error("Sale not found in state for ID:", id);
    showNotification(
      "error",
      "Error: Could not find sale details. Please refresh the page."
    );
    return;
  }

  const container = document.getElementById("paymentModalContainer");
  if (!container) return;

  // 2. Prepare Data for Display
  const todayDate = new Date().toISOString().split("T")[0];

  // Calculate Due Amount safely
  const total = parseFloat(sale.total_amount || 0);
  const received = parseFloat(sale.received_amount || 0);
  const dueAmount = (total - received).toFixed(2);

  // Format Due Amount Color (Red if positive, Green if paid)
  const dueClass =
    parseFloat(dueAmount) > 0 ? "text-rose-600" : "text-emerald-600";

  // 3. Prepare Account Options
  let accountOptions =
    '<option value="" disabled selected>Select Account</option>';
  if (
    saleHistoryState.paymentAccounts &&
    saleHistoryState.paymentAccounts.length > 0
  ) {
    saleHistoryState.paymentAccounts.forEach((acc) => {
      accountOptions += `<option value="${acc.id}">${acc.name} (${
        acc.type || "Account"
      })</option>`;
    });
  } else {
    accountOptions += `<option value="cash">Cash</option><option value="bank">Bank</option>`;
  }

  // 4. Construct Modal HTML with Info Header
  const modalHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="closeDeliverModal()"></div>

        <div class="relative z-10 bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 fade-in">
            
            <div class="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-900">Process Payment</h3>
                <button type="button" onclick="closeDeliverModal()" class="text-slate-400 hover:text-slate-600 transition-colors">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <div class="p-6 bg-slate-50/50 overflow-y-auto max-h-[80vh]">
                
                <div class="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-5 grid grid-cols-3 gap-4 shadow-sm">
                    <div>
                        <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Memo No</span>
                        <span class="font-bold text-slate-800 text-sm">#${
                          sale.memo_no || "N/A"
                        }</span>
                    </div>
                    <div class="text-right">
                        <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Due Amount</span>
                        <span class="font-extrabold text-sm ${dueClass}">${dueAmount}</span>
                    </div>
                    <div class="col-span-2 pt-2 mt-1">
                        <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Customer Details</span>
                        <div class="flex justify-between items-center">
                            <span class="font-semibold text-slate-800 text-sm truncate pr-2">${
                              sale.customer.name || "Unknown"
                            }</span>
                            <span class="text-xs font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-blue-100">${
                              sale.customer.mobile || "No Contact"
                            }</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <input type="hidden" id="deliverSaleId" value="${sale.id}">
                    <input type="hidden" id="memoNo" value="${sale.memo_no}">

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Exit Date</label>
                        <input type="date" id="deliverDate" value="${todayDate}" required 
                            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Paid Amount (Inflow)</label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input type="number" id="deliverPaidAmount" step="0.01" value="0" min="0" max="${dueAmount}" placeholder="0.00" required
                                class="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-600">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Payment Account</label>
                        <select id="deliverAccount" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer">
                            ${accountOptions}
                        </select>
                    </div>
                </div>
            </div>

            <div class="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-200">
                <button type="button" onclick="closeDeliverModal()" class="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="button" onclick="submitPayment()" class="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition-all active:scale-95">
                    Confirm Payment
                </button>
            </div>
        </div>
    </div>
    `;

  container.innerHTML = modalHTML;
};

// 2. Close Modal
window.closeDeliverModal = function () {
  const container = document.getElementById("paymentModalContainer");
  if (container) container.innerHTML = "";
};

// 3. Submit Logic
window.submitPayment = async function () {
  const saleId = document.getElementById("deliverSaleId").value;
  const memoNo = document.getElementById("memoNo").value;
  const dateVal = document.getElementById("deliverDate").value;
  const itemsVal = document.getElementById("deliverTotalItems").value;
  const paidVal = document.getElementById("deliverPaidAmount").value;
  const accountVal = document.getElementById("deliverAccount").value;

  // Validation
  if (!dateVal) {
    showNotification("error", "Please select an Exit Date");
    return;
  }

  // If both money and quantity cannot be zero
  if (parseFloat(paidVal) == 0 && itemsVal == 0) {
    showNotification("error", "Both Item and money cannot be zero.");
    return;
  }

  // If money is entered, account is mandatory
  if (parseFloat(paidVal) > 0 && !accountVal) {
    showNotification(
      "error",
      "Please select a Payment Account for the paid amount."
    );
    return;
  }

  const payload = {
    transaction_date: new Date(dateVal),
    sale_id: parseInt(saleId),
    memo_no: memoNo,
    payment_account_id: accountVal ? parseInt(accountVal) : null,
    quantity_delivered: parseInt(itemsVal),
    amount: parseFloat(paidVal || 0),
  };

  // UI Loading
  const submitBtn = document.querySelector(
    '#paymentModalContainer button[onclick="submitPayment()"]'
  );
  const originalText = submitBtn ? submitBtn.innerText : "Confirm";
  if (submitBtn) {
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;
  }

  try {
    const apiBase = window.globalState?.apiBase || "/api/v1";
    const response = await fetch(`${apiBase}/products/sales/payment`, {
      method: "POST",
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to process payment");
    }

    // Success
    if (typeof showNotification === "function") {
      showNotification("success", "Sale delivered successfully!");
    } else {
      showNotification("error", "Sale delivered successfully!");
    }

    closeDeliverModal();
    fetchSales(); // Refresh table
  } catch (error) {
    console.error("Payment Error:", error);
    showNotification("error", error.message);
  } finally {
    if (submitBtn) {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  }
};
