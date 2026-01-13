/* --- STATE --- */
window.transactionReportState = {
  data: [],
  totals: { order_count: 0, sale: 0, sale_return: 0 }, // Initialize totals
  totalRecords: 0,
  currentPage: 1,
  pageLength: 10,
  branchID: null,
};

/* --- INITIALIZATION --- */
window.initTransactionReportPage = function () {
  console.log("Report Page Loaded");

  if (window.globalState && window.globalState.user) {
    transactionReportState.branchID = window.globalState.user.branch_id;
  }

  // Default to "This Month"
  applyPreset("this_month");
};

/* --- 1. DATE PRESETS --- */
window.applyPreset = function (type) {
  const today = new Date();
  let start = new Date();
  let end = new Date();

  // Reset UI buttons
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    // Reset styles (simplified for brevity)
    btn.className =
      "preset-btn px-3 py-1.5 text-xs font-medium rounded-md text-slate-700 hover:bg-white hover:shadow-sm transition";

    // Set Active State
    if (btn.textContent.toLowerCase().replace(" ", "_") === type) {
      btn.className =
        "preset-btn active-preset px-3 py-1.5 text-xs font-bold rounded-md bg-white shadow-sm text-brand-700 transition";
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
  transactionReportState.currentPage = 1;
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
  const branchId = transactionReportState.branchID;

  // FIX: Initialize URLSearchParams
  const params = new URLSearchParams();

  // FIX: Use transactionReportState, not orderHistoryState
  params.append("page", transactionReportState.currentPage);
  params.append("pageLength", transactionReportState.pageLength);
  params.append("limit", transactionReportState.pageLength);
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
    transactionReportState.data = data.report || [];
    transactionReportState.totalRecords = parseInt(data.total_count || 0);

    renderReportTable();

    // CALL REUSABLE PAGINATION
    if (window.renderPagination) {
      window.renderPagination(
        "paginationContainer",
        "paginationInfo",
        {
          currentPage: transactionReportState.currentPage,
          totalRecords: transactionReportState.totalRecords,
          pageLength: transactionReportState.pageLength,
        },
        (newPage) => {
          transactionReportState.currentPage = newPage;
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

  if (transactionReportState.data.length === 0) {
    table.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  table.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  // -- BODY ROWS --
  transactionReportState.data.forEach((row) => {
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

/* --- HELPER: Money Format --- */
function formatMoney(amount) {
  if (amount === undefined || amount === null) return "-";
  return parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* --- 5. PRINT --- */
window.printTransactionReport = function () {
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
  const printData = transactionReportState.data.map((row) => {
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
