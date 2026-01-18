/* --- STATE --- */
window.reportState = {
  data: [],
  totals: { total_advance_payment:0, total_production_units:0, total_overtime_hours:0 },
  // Pagination & Search State
  currentPage: 1,
  pageLength: 10,
  searchQuery: "",
  totalRecords: 0,
  searchDebounce: null,
};
window.employeePaymentState = {
  list: [], // Holds the raw data from API
  filtered: [], // Holds data currently shown in the table
  paymentAccounts: [], // Holds payment accounts
};
/* --- INITIALIZATION --- */
window.initWorkerProgressReportPage = async function () {
  
  // 1. Setup Search & Pagination Listeners (Existing code)
  const searchInput = document.getElementById("searchReportInput");
  const pageLengthSelect = document.getElementById("pageLengthSelector");

  if (searchInput) {
    searchInput.value = reportState.searchQuery;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(reportState.searchDebounce);
      reportState.searchDebounce = setTimeout(() => {
        reportState.searchQuery = e.target.value.trim();
        reportState.currentPage = 1;
        fetchReport();
      }, 400);
    });
  }

  if (pageLengthSelect) {
    pageLengthSelect.addEventListener("change", (e) => {
      reportState.pageLength = parseInt(e.target.value);
      reportState.currentPage = 1;
      fetchReport();
    });
  }

  // 2. Load Data for Autocomplete
  await fetchEmployees(); 
  await fetchPaymentAccounts(); 
  
  // 3. Setup Autocomplete for Worker
  window.initAutocomplete({
    prefix: "worker",
    // Filter only active workers
    data: window.employeePaymentState.list.filter(e => e.role === 'worker'), 
    searchKeys: ["name", "mobile"],
    hiddenId: "workerId",
    onSelect: (emp) => updateWorkerCardUI(emp),
  });

  // 4. Default Date Preset & Fetch
  applyPreset("this_month");
};

/* --- 1. DATE PRESETS --- */
window.applyPreset = function (type) {
  const today = new Date();
  let start = new Date();
  let end = new Date();

  // Define styles for Active vs Inactive states
  const activeClasses = [
    "bg-white",        // White background
    "text-brand-700",  // Darker brand color for contrast
    "shadow",          // Slightly stronger shadow than shadow-sm
    "ring-1",          // Adds a subtle border...
    "ring-slate-200",  // ...that matches the theme
    "font-bold",
    "active-preset"    // Keep identifier class
  ];

  const inactiveClasses = [
    "text-slate-600",
    "font-medium",
    "hover:bg-white/50", // Adds a subtle hover effect to inactive buttons
    "hover:text-slate-800"
  ];

  // Reset UI buttons
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    // 1. Clean slate: remove all possible classes from both lists
    btn.classList.remove(...activeClasses, ...inactiveClasses);

    // 2. logic to match the button text to the type (e.g. "This Month" -> "this_month")
    const btnKey = btn.textContent.trim().toLowerCase().replace(" ", "_");

    if (btnKey === type || (type === 'today' && btnKey === 'today')) {
      // Apply Active Styles
      btn.classList.add(...activeClasses);
    } else {
      // Apply Inactive Styles
      btn.classList.add(...inactiveClasses);
    }
  });

  // Calculate Dates
  if (type === "today") {
    // start & end = today
  } else if (type === "yesterday") {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (type === "this_month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (type === "last_month") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  }

  // Set Input Values (YYYY-MM-DD)
  document.getElementById("startDate").value = formatDateVal(start);
  document.getElementById("endDate").value = formatDateVal(end);

  // Reset pagination on date change and Fetch
  reportState.currentPage = 1;
  fetchReport();
};

function formatDateVal(date) {
  return date.toISOString().split("T")[0];
}

/* --- 2. FETCH DATA --- */
async function fetchReport() {
  const tbody = document.getElementById("reportTableBody");
  const tfoot = document.getElementById("reportTableFoot");

  // Show Loading
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center py-10 text-slate-400">Loading Report...</td></tr>';
  }
  if (tfoot) tfoot.innerHTML = "";

  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchId = window.globalState.user.branch_id;

  // Build Params
  const params = new URLSearchParams();
  params.append("branch_id", branchId);
  params.append("start_date", start);
  params.append("end_date", end);
  params.append("report_type", "daily");
  
  // Pagination & Search Params
  params.append("page", reportState.currentPage);
  params.append("limit", reportState.pageLength);
  if (reportState.searchQuery) {
    params.append("search", reportState.searchQuery);
  }

  try {
    const response = await fetch(
      `${window.globalState.apiBase}/reports/worker/progress?${params.toString()}`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch report");

    const resData = await response.json();
    
    // Update State
    reportState.data = resData.report || [];
    reportState.totalRecords = parseInt(resData.total_count || resData.totalRecords || 0);

    // Handle Totals
    // If backend provides pre-calculated totals for the whole range, use them.
    // Otherwise, calculateTotals() will sum the current page (fallback).
    if (resData.totals) {
        reportState.totals = resData.totals;
        
    } else {
        calculateTotals();
    }

    renderReportTable();
    
    // Render Pagination Controls
    if (window.renderPagination) {
      window.renderPagination(
        "paginationContainer", // ID of button container
        "paginationInfo",      // ID of text info
        {
          currentPage: reportState.currentPage,
          totalRecords: reportState.totalRecords,
          pageLength: reportState.pageLength,
        },
        (newPage) => {
          reportState.currentPage = newPage;
          fetchReport();
        }
      );
    }

  } catch (error) {
    console.error("Report Error:", error);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-500">Error loading report</td></tr>`;
    }
  }
}
/* ==========================================================================
   1. DATA FETCHING
   ========================================================================== */
async function fetchEmployees() {
  const container = document.getElementById("employeeGrid");

  // Show Loading Spinner in Table Area
  if (container) {
    container.innerHTML =
      '<div class="w-full text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-brand-600"></i></div>';
  }

  try {
    const response = await fetch(`${window.globalState.apiBase}/hr/employees?role=worker`, {
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Failed to fetch employees");

    const data = await response.json();

    // Store Data
    employeePaymentState.list = data.employees || data || [];
    employeePaymentState.filtered = employeePaymentState.list;

    // Note: We don't need to manually update the top forms here because
    // the autocomplete functions always read directly from `employeePaymentState.list`
  } catch (error) {
    console.error(error);
    if (container)
      container.innerHTML = `<div class="w-full text-center text-red-500 font-bold py-4">Failed to load employee data</div>`;
    showNotification("error", "Could not load employees.");
  }
}
async function fetchPaymentAccounts() {
  try {
    const response = await fetch(`${window.globalState.apiBase}/accounts`, {
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Failed to fetch payment accounts");

    const data = await response.json();

    // Store Data
    employeePaymentState.paymentAccounts = data.accounts || [];

    // Render dropdown
    renderPaymentAccounts(
      "paymentAccountSelect",
      employeePaymentState.paymentAccounts || []
    );
  } catch (error) {
    console.error(error);
    if (container)
      container.innerHTML = `<div class="w-full text-center text-red-500 font-bold py-4">Failed to load employee data</div>`;
    showNotification("error", "Could not load employees.");
  }
}
function renderPaymentAccounts(elementId, list) {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML = `<option value="" disabled>Select Payment Method</option>`;
  if (!list || list.length === 0) {
    select.innerHTML = `<option value="" disabled>No Payment Method Found</option>`;
  } else {
    list.forEach((item) => {
      select.innerHTML += `<option value="${item.id}">${item.name}(${item.type})</option>`;
    });
  }
}
/* --- 3. CALCULATE TOTALS --- */
function calculateTotals() {
  let t = { total_advance_payment:0, total_production_units:0, total_overtime_hours:0 };

  // Note: If paginated, this only sums the visible page unless backend sends aggregate totals
  reportState.data.forEach((row) => {
    t.total_advance_payment += row.total_advance_payment || 0;
    t.total_overtime_hours += row.total_overtime_hours || 0;
    t.total_production_units += row.total_production_units || 0;
  });

  reportState.totals = t;
}

/* --- 4. RENDER TABLE --- */
function renderReportTable() {
  const tbody = document.getElementById("reportTableBody");
  const tfoot = document.getElementById("reportTableFoot");
  const emptyState = document.getElementById("emptyReportState");
  const table = document.getElementById("reportTable");

  if (!tbody || !tfoot) return;

  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  if (reportState.data.length === 0) {
    if(table) table.classList.add("hidden");
    if(emptyState) emptyState.classList.remove("hidden");
    // Clear pagination info if empty
    const pageInfo = document.getElementById("paginationInfo");
    if(pageInfo) pageInfo.innerHTML = "";
    return;
  }

  if(table) table.classList.remove("hidden");
  if(emptyState) emptyState.classList.add("hidden");

  // -- BODY ROWS --
  reportState.data.forEach((row) => {
    tbody.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-slate-700">
            <td class="px-4 py-3 text-left border-r border-slate-100 font-medium">${formatDate(row.sheet_date)}</td>
            <td class="px-4 py-3 text-left border-r border-slate-100">${row.worker_name || "Unknown"}</td>
            <td class="px-4 py-3 text-left border-r border-slate-100">${row.mobile || "-"}</td>                
            <td class="px-4 py-3 text-right border-r border-slate-100"> ${row.total_production_units}</td>                
            <td class="px-4 py-3 text-right border-r border-slate-100">${row.total_overtime_hours}</td>
            <td class="px-4 py-3 text-right border-r border-slate-100">${row.total_advance_payment}</td>
            <td class="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
              <button onclick='openWorkerModal(${row.id})' class="text-slate-400 hover:text-brand-600 transition-colors p-2 hover:bg-brand-50 rounded-full">
                  <i class="ph ph-pencil-simple text-lg"></i>
              </button>
            </td>
        </tr>
    `;
  });

  // -- FOOTER ROW (TOTALS) --
  const t = reportState.totals;
  tfoot.innerHTML = `
    <tr class="bg-slate-100 border-t-2 border-slate-200">
        <td class="px-4 py-3 text-right uppercase text-xs tracking-wider text-slate-500" colspan="3">Total</td>
        <td class="px-4 py-3 text-right">${t.total_production_units}</td>
        <td class="px-4 py-3 text-right">${t.total_overtime_hours}</td>
        <td class="px-4 py-3 text-right">${t.total_advance_payment}</td>
        <td class="px-4 py-3 text-right"></td>
    </tr>
  `;
}

/* --- 5. PRINT --- */
window.printReport = function () {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchName = GetBranchName(); // Ensure this function exists globally

  const columns = [
    { label: "Date", key: "sheet_date", align: "left", action:"date" },
    { label: "Worker Name", key: "worker_name", align: "left" },
    { label: "Mobile", key: "mobile", align: "left" },
    { label: "Production Units", key: "total_production_units", align: "right" },
    { label: "Overtime Hours", key: "total_overtime_hours", align: "right" },
    { label: "Advance Payment", key: "total_advance_payment", align: "right" },
  ];
  
  // Create a copy of data to format dates for print without mutating state
  const printData = reportState.data.map(row => {
      const dateObj = row.sheet_date;
      return {
          ...row,
          sheet_date: formatDate(dateObj),
      };
  });

  printReportGeneric({
    header: {
      companyName: branchName,
      reportTitle: "Branch Report",
      branchName: "",
      startDate: start,
      endDate: end,
    },
    columns: columns,
    rows: printData,
    totals: reportState.totals,
  });
};

/* --- HELPER: UPDATE CARD UI --- */
function updateWorkerCardUI(emp) {
    if (!emp) return;
    document.getElementById("workerCardInitials").textContent = emp.name.substring(0, 2).toUpperCase();
    document.getElementById("workerId").value = emp.id;
    document.getElementById("workerCardName").textContent = emp.name;
    document.getElementById("workerCardMobile").textContent = emp.mobile || '--';
    document.getElementById("workerCardRole").textContent = emp.role || 'Worker';
}

/* --- MODAL ACTIONS --- */

// 1. OPEN MODAL & PRE-FILL
window.openWorkerModal = function (rowId) {
  // Find the row data
  const rowData = reportState.data.find((item) => item.id === rowId);
  if (!rowData) return;

  const empInfo = window.employeePaymentState.list.find(e => e.id === rowData.worker_id);

  // Fill Form Fields
  document.getElementById("progressRecordId").value = rowData.id;
  document.getElementById("workerId").value = rowData.worker_id;
  document.getElementById("workerDate").value = formatDateVal(new Date(rowData.sheet_date));
  
  document.getElementById("workerProduction").value = rowData.total_production_units || 0;
  document.getElementById("workerOvertime").value = rowData.total_overtime_hours || 0;
  document.getElementById("workerAdvance").value = rowData.total_advance_payment || 0;

  // Setup UI State (Card vs Search)
  if (empInfo) {
      updateWorkerCardUI(empInfo);
      document.getElementById("workerSearchContainer").classList.add("hidden");
      document.getElementById("workerSelectedCard").classList.remove("hidden");
      document.getElementById("workerSearchInput").value = "";
  } else {
      // Fallback
      document.getElementById("workerSearchContainer").classList.remove("hidden");
      document.getElementById("workerSelectedCard").classList.add("hidden");
  }

  document.getElementById("workerModal").classList.remove("hidden");
};

// 2. CLOSE MODAL
window.closeWorkerModal = function () {
  document.getElementById("workerModal").classList.add("hidden");
};

// 3. SAVE / UPDATE
window.handleUpdateWorkerProgress = async function(e) {
    e.preventDefault();

    const empId = document.getElementById("workerId").value;
    const progressRecordId = document.getElementById("progressRecordId").value;
    const date = document.getElementById("workerDate").value;
    const production = document.getElementById("workerProduction").value || 0;
    const overtime = document.getElementById("workerOvertime").value || 0;
    const advance = document.getElementById("workerAdvance").value || 0;
    const paymentID = document.getElementById("paymentAccountSelect").value || 0;

    if (!empId || !date || !paymentID) {
        showNotification("error", "Employee, payment date and Payment account id are required");
        return;
    }

    try {
        const payload = {
            employee_id: parseInt(empId),
            sheet_date: new Date(date).toISOString(),
            production_units: parseInt(production),
            overtime_hours: parseFloat(overtime),
            advance_payment: parseFloat(advance),
            payment_account_id: parseInt(paymentID)
            // Note: Your Go backend handles upsert (INSERT... ON CONFLICT UPDATE)
            // so we don't strictly need the row ID if the unique constraint is (date, emp_id)
        };
        console.log(payload)
        const response = await fetch(`${window.globalState.apiBase}/hr/employee/worker/progress/update/${progressRecordId}`, {
            method: "PATCH",
            headers: window.getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showNotification("success", "Worker progress updated");
            closeWorkerModal();
            // fetchReport(); // Refresh Table
        } else {
            const err = await response.json();
            throw new Error(err.message || "Update failed");
        }
    } catch (error) {
        showNotification("error", error.message);
    }
};


function printData(id){
  console.log("payment account changed to: ", id)
}