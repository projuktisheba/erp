/* --- STATE --- */
window.reportState = {
  data: [],
  totals: { total_salary:0},
  // Pagination & Search State
  currentPage: 1,
  pageLength: 10,
  searchQuery: "",
  totalRecords: 0,
  searchDebounce: null,
};

/* --- INITIALIZATION --- */
window.initSalaryReportPage = async function () {
  
  // 1. Grab Elements
  const searchInput = document.getElementById("searchReportInput"); // Assumed ID
  const pageLengthSelect = document.getElementById("pageLengthSelector");

  // 2. Search Listener (Debounced)
  if (searchInput) {
    searchInput.value = reportState.searchQuery;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(reportState.searchDebounce);
      reportState.searchDebounce = setTimeout(() => {
        const newVal = e.target.value.trim();
        if (reportState.searchQuery !== newVal) {
          reportState.searchQuery = newVal;
          reportState.currentPage = 1; // Reset to page 1 on search
          fetchReport();
        }
      }, 400);
    });
  }

  // 3. Page Length Listener
  if (pageLengthSelect) {
    pageLengthSelect.value = reportState.pageLength.toString();
    pageLengthSelect.addEventListener("change", (e) => {
      reportState.pageLength = parseInt(e.target.value);
      reportState.currentPage = 1; // Reset to page 1 on change
      fetchReport();
    });
  }

  // 4. Default Date Preset (Triggers Initial Fetch)
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
      `${window.globalState.apiBase}/reports/employee/salary?${params.toString()}`,
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

/* --- 3. CALCULATE TOTALS --- */
function calculateTotals() {
  let t = { total_salary:0 };

  // Note: If paginated, this only sums the visible page unless backend sends aggregate totals
  reportState.data.forEach((row) => {
    t.total_salary += row.total_salary || 0;
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
            <td class="px-4 py-3 text-left border-r border-slate-100">${row.employee_name || "Unknown"}</td>                
            <td class="px-4 py-3 text-left border-r border-slate-100">${row.role || "-"}</td> 
            <td class="px-4 py-3 text-left border-r border-slate-100">${row.employee_mobile || "-"}</td>               
            <td class="px-4 py-3 text-right border-r border-slate-100"> ${row.total_salary}</td>
            <td class="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
              <button onclick='editSalary(${row.id})' class="text-slate-400 hover:text-brand-600 transition-colors p-2 hover:bg-brand-50 rounded-full">
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
        <td class="px-4 py-3 text-right uppercase text-xs tracking-wider text-slate-500" colspan="4">Total</td>
        <td class="px-4 py-3 text-right">${t.total_salary}</td>
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
    { label: "Name", key: "employee_name", align: "left" },
    { label: "Role", key: "role", align: "left" },
    { label: "Mobile", key: "employee_mobile", align: "left" },
    { label: "Salary", key: "total_salary", align: "right" },
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



/* --- 6. MODAL & FORM --- */

window.editEmployee = function (emp) {
  document.getElementById("modalTitle").textContent = "Edit Employee Details";
  document.getElementById("empId").value = emp.id;
  document.getElementById("empName").value = emp.name;
  document.getElementById("empRole").value = emp.role;
  document.getElementById("empMobile").value = emp.mobile;
  document.getElementById("empMobileAlt").value = emp.mobile_alt || "";
  document.getElementById("empEmail").value = emp.email || "";
  document.getElementById("empStatus").value = emp.status;
  document.getElementById("empSalary").value = emp.base_salary;
  document.getElementById("empOvertime").value = emp.overtime_rate;
  document.getElementById("empPassport").value = emp.passport_no || "";
  document.getElementById("empAddress").value = emp.address || "";
  document.getElementById("empPassword").value = "";

  // --- DATE DISPLAY LOGIC (UTC -> Local Input) ---
  if (emp.joining_date) {
    const dateObj = new Date(emp.joining_date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    document.getElementById("empJoinDate").value = `${year}-${month}-${day}`;
  }

  document.getElementById("employeeModal").classList.remove("hidden");
};

function closeEmployeeModal() {
  document.getElementById("employeeModal").classList.add("hidden");
}

/* --- 5. SAVE (CREATE / UPDATE) --- */
async function saveEmployee() {
  const id = document.getElementById("empId").value;
  const branch_id = window.globalState.user.branch_id;

  // Required Fields Check
  const name = document.getElementById("empName").value;
  const role = document.getElementById("empRole").value;
  const mobile = document.getElementById("empMobile").value;

  if (!name || !role || !mobile) {
    showNotification("warning", "Please fill in Name, Role, and Mobile.");
    return;
  }

  // --- DATE SAVE LOGIC (Local Input -> ISO String) ---
  const rawDate = document.getElementById("empJoinDate").value;
  let datePayload = null;

  if (rawDate) {
    datePayload = new Date(rawDate).toISOString();
  } else {
    datePayload = new Date().toISOString();
  }

  const payload = {
    name,
    role,
    mobile,
    mobile_alt: document.getElementById("empMobileAlt").value,
    email: document.getElementById("empEmail").value,
    password: document.getElementById("empPassword").value,
    status: document.getElementById("empStatus").value,
    base_salary: parseFloat(document.getElementById("empSalary").value) || 0,
    overtime_rate: parseFloat(document.getElementById("empOvertime").value) || 0,
    passport_no: document.getElementById("empPassport").value,
    address: document.getElementById("empAddress").value,
    joining_date: datePayload,
    branch_id: branch_id,
  };

  const url = id
    ? `${window.globalState.apiBase}/hr/employee/update/${id}`
    : `${window.globalState.apiBase}/hr/employee/new`;

  const method = id ? "PUT" : "POST";

  try {
    const response = await fetch(url, {
      method: method,
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      showNotification(
        "success",
        id ? "Employee updated!" : "New employee added!"
      );
      closeEmployeeModal();
      fetchEmployees();
    } else {
      throw new Error(data.message || "Operation failed");
    }
  } catch (error) {
    console.error(error);
    showNotification("error", error.message);
  }
}
