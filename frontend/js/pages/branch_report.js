/* --- STATE --- */
window.reportState = {
  data: [],
  totals: { expense: 0, cash: 0, bank: 0, balance: 0, orders: 0, delivery: 0 },
  // Pagination & Search State
  currentPage: 1,
  pageLength: 10,
  searchQuery: "",
  totalRecords: 0,
  searchDebounce: null,
};

/* --- INITIALIZATION --- */
window.initBranchReportPage = async function () {
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

  // 4. Initialize Flatpickr Datepickers
  if (window.initReportDatePickers) {
    window.initReportDatePickers(() => {
      document.querySelectorAll(".preset-btn").forEach((btn) => {
        btn.classList.remove("bg-white", "text-brand-700", "shadow", "ring-1", "ring-slate-200", "font-bold", "active-preset");
        btn.classList.add("text-slate-600", "font-medium", "hover:bg-white/50", "hover:text-slate-800");
      });
      reportState.currentPage = 1;
      fetchReport();
    });
  }

  // 5. Default Date Preset (Triggers Initial Fetch)
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
  const startStr = formatDateVal(start);
  const endStr = formatDateVal(end);

  const startEl = document.getElementById("startDate");
  const endEl = document.getElementById("endDate");

  if (startEl && startEl._flatpickr) {
    startEl._flatpickr.setDate(startStr, false);
  } else if (startEl) {
    startEl.value = startStr;
  }

  if (endEl && endEl._flatpickr) {
    endEl._flatpickr.setDate(endStr, false);
  } else if (endEl) {
    endEl.value = endStr;
  }

  // Reset pagination on date change and Fetch
  reportState.currentPage = 1;
  fetchReport();
};


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
      `${window.globalState.apiBase}/reports/branch?${params.toString()}`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch report");

    const resData = await response.json();

    // Update State
    reportState.data = resData.report || [];
    reportState.totalRecords = parseInt(
      resData.total_count || resData.totalRecords || 0
    );

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
        "paginationInfo", // ID of text info
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
  let t = { expense: 0, cash: 0, bank: 0, balance: 0, orders: 0, delivery: 0, ready_made:0, sales_amount:0};

  // Note: If paginated, this only sums the visible page unless backend sends aggregate totals
  reportState.data.forEach((row) => {
    t.expense += row.expense || 0;
    t.cash += row.cash || 0;
    t.bank += row.bank || 0;
    t.balance += row.balance || 0;
    t.orders += row.order_count || 0;
    t.delivery += row.delivery || 0;
    t.ready_made += row.ready_made || 0;
    t.sales_amount += row.sales_amount || 0;
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
    if (table) table.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    // Clear pagination info if empty
    const pageInfo = document.getElementById("paginationInfo");
    if (pageInfo) pageInfo.innerHTML = "";
    return;
  }

  if (table) table.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  // -- BODY ROWS --
  reportState.data.forEach((row) => {
    tbody.innerHTML += `
    <tr class="group hover:bg-slate-50 border-b border-slate-200 text-sm transition-colors">
        <td class="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">
            ${formatDateVal(row.sheet_date)}
        </td>

        <td class="px-4 py-3 text-right text-slate-800 tabular-nums">
            ${row.order_count || "0"}
        </td>

        <td class="px-4 py-3 text-right border-r border-slate-100 text-slate-800 tabular-nums">
            ${row.delivery || "0"}
        </td>

        <td class="px-4 py-3 text-right border-r border-slate-100 text-slate-800 tabular-nums">
            ${row.ready_made || "0"}
        </td>

        <td class="px-4 py-3 text-right border-r border-slate-100 text-slate-800 tabular-nums">
            ${row.sales_amount || "0"}
        </td>
        
        <td class="px-4 py-3 text-right border-r border-slate-100 text-emerald-600 font-medium tabular-nums bg-emerald-50/30">
            ${formatMoney(row.cash)}
        </td>
        
        <td class="px-4 py-3 text-right border-r border-slate-100 text-blue-600 font-medium tabular-nums bg-blue-50/30">
            ${formatMoney(row.bank)}
        </td>

        <td class="px-4 py-3 text-right border-r border-slate-100 text-teal-700 font-medium bg-teal-50/50 tabular-nums">
            ${formatMoney(row.cash + row.bank)}
        </td>
                    
        <td class="px-4 py-3 text-right border-r border-slate-100 text-rose-600 font-medium tabular-nums">
            ${formatMoney(row.expense)}
        </td>

        <td class="px-4 py-3 text-right text-slate-800 bg-slate-50/80 font-bold tabular-nums">
            ${formatMoney(row.balance)}
        </td>
    </tr>
`;
  });

  // -- FOOTER ROW (TOTALS) --
  const t = reportState.totals;
  tfoot.innerHTML = `
        <tr class="bg-slate-100 border-t-2 border-slate-200">
            <td class="px-4 py-3 text-right uppercase text-xs tracking-wider text-slate-500">Total</td>
            <td class="px-4 py-3 text-right tabular-nums">${t.orders}</td>
            <td class="px-4 py-3 text-right tabular-nums">${t.delivery}</td>
            <td class="px-4 py-3 text-right tabular-nums">${t.ready_made}</td>
            <td class="px-4 py-3 text-right tabular-nums">${t.sales_amount}</td>
            <td class="px-4 py-3 text-right text-emerald-700 tabular-nums">${formatMoney(
              t.cash
            )}</td>
            <td class="px-4 py-3 text-right text-blue-700 tabular-nums">${formatMoney(
              t.bank
            )}</td>
            <td class="px-4 py-3 text-right text-teal-700 font-bold bg-teal-50/50 tabular-nums">${formatMoney(
              t.cash + t.bank
            )}</td>
            <td class="px-4 py-3 text-right text-red-600 tabular-nums">${formatMoney(
              t.expense
            )}</td>            
            <td class="px-4 py-3 text-right text-slate-900 text-base tabular-nums">${formatMoney(
              t.balance
            )}</td>
        </tr>
    `;
}

/* --- 5. PRINT --- */
window.printReport = function () {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchName = GetBranchName(); // Ensure this function exists globally

  const columns = [
    { label: "Date", key: "sheet_date", align: "center", action: "date" },
    { label: "Orders", key: "orders", align: "right" },
    { label: "Delivery", key: "delivery", align: "right" },
    { label: "Cash", key: "cash", align: "right" },
    { label: "Bank", key: "bank", align: "right" },
    { label: "Expense", key: "expense", align: "right" },
    { label: "Balance", key: "balance", align: "right" },
  ];

  // Create a copy of data to format dates for print without mutating state
  const printData = reportState.data.map((row) => {
    const dateObj = row.sheet_date;
    return {
      ...row,
      sheet_date: formatDateVal(dateObj),
      orders: row.order_count, // Map key mismatch if necessary
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
