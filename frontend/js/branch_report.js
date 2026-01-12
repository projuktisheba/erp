/* --- STATE --- */
let reportState = {
  data: [],
  totals: { expense: 0, cash: 0, bank: 0, balance: 0, orders: 0, delivery: 0 },
};

/* --- INITIALIZATION --- */
window.initBranchReportPage = async function () {
  console.log("Report Page Loaded");

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
    btn.classList.remove(
      "active-preset",
      "bg-white",
      "shadow-sm",
      "text-brand-600",
      "font-bold"
    );
    btn.classList.add("text-slate-600", "font-medium");
    if (btn.textContent.toLowerCase().replace(" ", "_").includes(type)) {
      btn.classList.add(
        "active-preset",
        "bg-white",
        "shadow-sm",
        "text-brand-600",
        "font-bold"
      );
      btn.classList.remove("text-slate-600");
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

  // Fetch Data
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
  tbody.innerHTML =
    '<tr><td colspan="7" class="text-center py-10 text-slate-400">Loading Report...</td></tr>';
  tfoot.innerHTML = "";

  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchId = window.globalState.user.branch_id;

  try {
    const response = await fetch(
      `${window.globalState.apiBase}/reports/branch?branch_id=${branchId}&start_date=${start}&end_date=${end}&report_type=daily`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch report");

    const resData = await response.json();
    reportState.data = resData.report || [];

    calculateTotals();
    renderReportTable();
  } catch (error) {
    console.error("Report Error:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-500">Error loading report</td></tr>`;
  }
}

/* --- 3. CALCULATE TOTALS --- */
function calculateTotals() {
  let t = { expense: 0, cash: 0, bank: 0, balance: 0, orders: 0, delivery: 0 };

  reportState.data.forEach((row) => {
    t.expense += row.expense || 0;
    t.cash += row.cash || 0;
    t.bank += row.bank || 0;
    t.balance += row.balance || 0; // or calculate manually: (cash+bank) - expense
    t.orders += row.order_count || 0;
    t.delivery += row.delivery || 0;
  });

  reportState.totals = t;
}

/* --- 4. RENDER TABLE --- */
function renderReportTable() {
  const tbody = document.getElementById("reportTableBody");
  const tfoot = document.getElementById("reportTableFoot");
  const emptyState = document.getElementById("emptyReportState");
  const table = document.getElementById("reportTable");

  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  if (reportState.data.length === 0) {
    table.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  table.classList.remove("hidden");
  emptyState.classList.add("hidden");

  // -- BODY ROWS --
  reportState.data.forEach((row) => {
    // Parse date for display (e.g., "12 Jan, 2024")
    const dateObj = new Date(row.date);
    const dateStr = dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-slate-700">
                <td class="px-4 py-3 border-r border-slate-100 font-medium">${dateStr}</td>
                <td class="px-4 py-3 text-center border-r border-slate-100">${
                  row.order_count || "-"
                }</td>
                <td class="px-4 py-3 text-center border-r border-slate-100">${
                  row.delivery || "-"
                }</td>
                
                <td class="px-4 py-3 text-right text-red-500 border-r border-slate-100 font-mono">
                    ${formatMoney(row.expense)}
                </td>
                
                <td class="px-4 py-3 text-right text-emerald-600 border-r border-slate-100 font-mono">
                    ${formatMoney(row.cash)}
                </td>
                
                <td class="px-4 py-3 text-right text-blue-600 border-r border-slate-100 font-mono">
                    ${formatMoney(row.bank)}
                </td>
                
                <td class="px-4 py-3 text-right font-bold text-slate-800 font-mono">
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
            <td class="px-4 py-3 text-center">${t.orders}</td>
            <td class="px-4 py-3 text-center">${t.delivery}</td>
            <td class="px-4 py-3 text-right text-red-600">${formatMoney(
              t.expense
            )}</td>
            <td class="px-4 py-3 text-right text-emerald-700">${formatMoney(
              t.cash
            )}</td>
            <td class="px-4 py-3 text-right text-blue-700">${formatMoney(
              t.bank
            )}</td>
            <td class="px-4 py-3 text-right text-slate-900 text-base">${formatMoney(
              t.balance
            )}</td>
        </tr>
    `;
}

/* --- HELPER: Money Format --- */
function formatMoney(amount) {
  if (!amount && amount !== 0) return "-";
  // Returns string like "1,200.50"
  return parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* --- 5. PRINT --- */
window.printReport = function () {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchName = GetBranchName();

  const columns = [
    { label: "Date", key: "date", align: "left", action:"date" },
    { label: "Orders", key: "orders", align: "center" },
    { label: "Delivery", key: "delivery", align: "center" },
    { label: "Expense", key: "expense" },
    { label: "Cash", key: "cash" },
    { label: "Bank", key: "bank" },
    { label: "Balance", key: "balance" },
  ];
  reportState.data.forEach((row) => {
    // Parse date for display (e.g., "12 Jan, 2024")
    const dateObj = new Date(row.date);
    const dateStr = dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    row.date = dateStr;
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
    rows: reportState.data,
    totals: reportState.totals,
  });
};
