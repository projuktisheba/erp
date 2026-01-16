/* --- STATE --- */
window.workerProgressReportState = {
  data: [],
  totals: { total_production_units: 0, total_overtime_hours: 0, total_advance_payment: 0 },
  // 1. ADDED: Search state management
  searchQuery: "",
  searchDebounce: null,
};

/* --- INITIALIZATION --- */
window.initWorkerProgressReportPage = async function () {
  console.log("Report Page Loaded");

  // 2. ADDED: Search Listener
  const searchInput = document.getElementById("reportSearchInput");
  
  if (searchInput) {
    searchInput.value = workerProgressReportState.searchQuery; // Persist value
    
    searchInput.addEventListener("input", (e) => {
      clearTimeout(workerProgressReportState.searchDebounce);
      
      workerProgressReportState.searchDebounce = setTimeout(() => {
        const newVal = e.target.value.trim();
        
        // Only fetch if value changed
        if (workerProgressReportState.searchQuery !== newVal) {
            workerProgressReportState.searchQuery = newVal;
            fetchReport();
        }
      }, 400); // 400ms delay (Debounce)
    });
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
    btn.classList.remove(
      "active-preset",
      "bg-white",
      "shadow-sm",
      "text-brand-700",
      "font-bold"
    );
    btn.classList.add("text-slate-700", "font-medium");
    if (btn.textContent.toLowerCase().replace(" ", "_").includes(type)) {
      btn.classList.add(
        "active-preset",
        "bg-white",
        "shadow-sm",
        "text-brand-700",
        "font-bold"
      );
      btn.classList.remove("text-slate-700");
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
  
  // 3. ADDED: Prepare Search Query
  const searchQuery = workerProgressReportState.searchQuery;

  try {
    // 4. ADDED: Append search param to URL
    // NOTE: Your backend API must be set up to handle &search=... for this to work
    const response = await fetch(
      `${window.globalState.apiBase}/reports/worker/progress?branch_id=${branchId}&start_date=${start}&end_date=${end}&report_type=daily&search=${searchQuery}`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch report");

    const resData = await response.json();
    workerProgressReportState.data = resData.report || [];

    calculateTotals();
    renderReportTable();
  } catch (error) {
    console.error("Report Error:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-500">Error loading report</td></tr>`;
  }
}

/* --- 3. CALCULATE TOTALS --- */
function calculateTotals() {
  let t = { total_production_units: 0, total_overtime_hours: 0, total_advance_payment: 0 };

  workerProgressReportState.data.forEach((row) => {
    t.total_production_units += parseInt(row.total_production_units || 0);
    t.total_overtime_hours += parseInt(row.total_overtime_hours || 0);
    t.total_advance_payment += parseInt(row.total_advance_payment || 0);
  });

  workerProgressReportState.totals = t;
}

/* --- 4. RENDER TABLE --- */
function renderReportTable() {
  const tbody = document.getElementById("reportTableBody");
  const tfoot = document.getElementById("reportTableFoot");
  const emptyState = document.getElementById("emptyReportState");
  const table = document.getElementById("reportTable");

  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  if (workerProgressReportState.data.length === 0) {
    table.classList.add("hidden");
    if(emptyState) emptyState.classList.remove("hidden"); // check if element exists
    
    // Optional: If empty state element doesn't exist, show row
    if (!emptyState) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No records found.</td></tr>`;
        table.classList.remove("hidden");
    }
    return;
  }

  table.classList.remove("hidden");
  if(emptyState) emptyState.classList.add("hidden");

  // -- BODY ROWS --
  workerProgressReportState.data.forEach((row) => {
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
                <td class="px-4 py-3 border-r border-slate-100 font-medium">${
                  row.worker_name
                }</td>
                <td class="px-4 py-3 text-right border-r border-slate-100">${
                  row.total_production_units || "0"
                }</td>
                <td class="px-4 py-3 text-right border-r border-slate-100">
                    ${row.total_overtime_hours}
                </td>
                                
                <td class="px-4 py-3 text-right border-r border-slate-100">
                    ${row.total_advance_payment}
                </td>
                
                
            </tr>
        `;
  });

  // -- FOOTER ROW (TOTALS) --
  const t = workerProgressReportState.totals;
  tfoot.innerHTML = `
        <tr class="bg-slate-100 border-t-2 border-slate-200">
            <td class="px-4 py-3 text-right uppercase text-xs tracking-wider text-slate-500" colspan="2">Total</td>
            <td class="px-4 py-3 text-right">${t.total_production_units}</td>
            <td class="px-4 py-3 text-right">${t.total_overtime_hours}</td>
            <td class="px-4 py-3 text-right">${t.total_advance_payment}</td>
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
window.printWorkerReport = function () {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  const branchName = GetBranchName ? GetBranchName() : "Branch"; // Added safety check
  const columns = [
    { label: "Date", key: "date", align: "left" },
    { label: "Name", key: "worker_name", align: "left" },
    { label: "Mobile", key: "mobile", align: "left" },
    { label: "Production Units", key: "total_production_units", align: "right" },
    { label: "Overtime Hours", key: "total_overtime_hours", align: "right" },
    { label: "Advance Payment", key: "total_advance_payment", align: "right" },
  ];

  // Clone data to avoid mutating state
  const printData = workerProgressReportState.data.map(row => {
     const newRow = {...row};
     const dateObj = new Date(newRow.date);
     newRow.date = formatDate(dateObj)
    return newRow;
  });

  printReportGeneric({
    header: {
      companyName: branchName,
      reportTitle: "Worker Progress Report",
      branchName: "",
      startDate: start,
      endDate: end,
    },
    columns: columns,
    rows: printData,
    totals: workerProgressReportState.totals,
  });
};