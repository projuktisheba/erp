/* --- STATE --- */
window.reportState = {
  data: [],
  totals: { order_count: 0, sale: 0, sale_return: 0 }, // Initialize totals
  totalRecords: 0,
  currentPage: 1,
  pageLength: 10,
  branchID: null,
};

/* --- INITIALIZATION --- */
window.initTransactionReportPage = function () {
  if (window.globalState && window.globalState.user) {
    reportState.branchID = window.globalState.user.branch_id;
  }

  const pageLengthSelect = document.getElementById("pageLengthSelector");

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

  // Reset to page 1 on new filter
  reportState.currentPage = 1;
  fetchReport();
};

function formatDateVal(date) {
  const d = new Date(date);
  // Handle timezone offset issues by using local string split
  const offset = d.getTimezoneOffset();
  const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
  return adjustedDate.toISOString().split("T")[0];
}

/* --- 2. FETCH DATA --- */
async function fetchReport() {
  const tbody = document.getElementById("reportTableBody");

  // Show Loading
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center py-10 text-slate-400">Loading Report...</td></tr>';

  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchId = reportState.branchID;

  // FIX: Initialize URLSearchParams
  const params = new URLSearchParams();

  // FIX: Use reportState, not orderHistoryState
  params.append("page", reportState.currentPage);
  params.append("pageLength", reportState.pageLength);
  params.append("limit", reportState.pageLength);
  params.append("start_date", start);
  params.append("end_date", end);
  if (branchId) params.append("branch_id", branchId);

  try {
    const apiBase = window.globalState?.apiBase || ""; // Fallback

    const res = await fetch(
      `${apiBase}/transactions/list?${params.toString()}`,
      {
        method: "GET",
        headers: window.getAuthHeaders ? window.getAuthHeaders() : {},
      }
    );

    if (!res.ok) throw new Error("Failed to fetch report");

    const data = await res.json();

    // FIX: Map the response data correctly
    reportState.data = data.report || [];
    reportState.totalRecords = parseInt(data.total_count || 0);

    renderReportTable();

    // CALL REUSABLE PAGINATION
    if (window.renderPagination) {
      window.renderPagination(
        "paginationContainer",
        "paginationInfo",
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
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-500">Error loading report</td></tr>`;
  }
}

/* --- 4. RENDER TABLE --- */
function renderReportTable() {
  const tbody = document.getElementById("reportTableBody");
  const emptyState = document.getElementById("emptyReportState");
  const table = document.getElementById("reportTable");

  tbody.innerHTML = "";

  if (reportState.data.length === 0) {
    table.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  table.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  // -- BODY ROWS --
  reportState.data.forEach((row) => {
    tbody.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-slate-700">
            <td class="px-4 py-3 border-r border-slate-100 font-medium">${
              row.transaction_id
            }</td>
            <td class="px-4 py-3 border-r border-slate-100 font-medium">${
              row.memo_no
            }</td>
            <td class="px-4 py-3 border-r border-slate-100 font-medium">${formatDate(
              row.transaction_date
            )}</td>
            <td class="px-4 py-3 border-r border-slate-100 font-medium">${
              row.from_account_name || ""
            }(${row.from_type})</td>
            <td class="px-4 py-3 border-r border-slate-100 font-medium">${
              row.to_account_name || ""
            }(${row.to_type})</td>
            <td class="px-4 py-3 border-r border-slate-100 font-medium">${
              row.transaction_type || "-"
            }</td>
            <td class="px-4 py-3 border-r border-slate-100 font-medium text-right">${
              row.amount || "0"
            }</td>
            
        </tr>
    `;
  });
}


/* --- 5. PRINT --- */
window.printReport = function () {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchName = GetBranchName ? GetBranchName() : "Branch"; // Added safety check

  const columns = [
    { label: "#ID", key: "transaction_id", align: "left" },
    { label: "Memo No", key: "memo_no", align: "left" },
    { label: "Date", key: "transaction_date", align: "left" },
    { label: "From", key: "from_account_name", align: "left" },
    { label: "To", key: "to_account_name", align: "left" },
    { label: "Transaction Type", key: "transaction_type", align: "left" },
    { label: "Amount", key: "amount", align: "right" },
  ];

  // Clone data to avoid mutating state
  const printData = reportState.data.map((row) => {
    const newRow = { ...row };
    const dateObj = newRow.transaction_date;
    newRow.transaction_date = formatDate(dateObj);
    return newRow;
  });

  printReportGeneric({
    header: {
      companyName: branchName,
      reportTitle: "Transaction Report",
      branchName: "",
      startDate: start,
      endDate: end,
    },
    columns: columns,
    rows: printData,
    totals: null,
  });
};
