/* ==========================================================================
   STATE MANAGEMENT
   ========================================================================== */
window.employeePaymentState = {
  list: [], // Holds the raw data from API
  filtered: [], // Holds data currently shown in the table
  paymentAccounts: [], // Holds payment accounts
};


/* ==========================================================================
   INITIALIZATION UPDATE
   ========================================================================== */
// Modify your window.initEmployeePaymentPage function
window.initEmployeePaymentPage = async function () {   
  // 1. Fetch Initial Data
  await fetchEmployees();
  await fetchPaymentAccounts();

  // 2. Attach Listeners for the Employee Table Search
  const searchInput = document.getElementById("employeeSearch");
  const roleFilter = document.getElementById("roleFilter");

  if (searchInput) searchInput.addEventListener("input", filterTableEmployees);
  if (roleFilter) roleFilter.addEventListener("change", filterTableEmployees);

  // 3. Initialize Top Section Autocomplete Logic

  // A. Salary Form (Allows searching ALL active employees)
  setupEmployeeAutocomplete("salary", (emp) => emp.status === "active");

  // B. Worker Progress Form (Allows searching ONLY active 'worker' role)
  setupEmployeeAutocomplete(
    "worker",
    (emp) => emp.status === "active" && emp.role === "worker"
  );
};


/* ==========================================================================
   LOGIC: FETCHING DATA
   ========================================================================== */

/* ==========================================================================
   LOGIC: RENDERING & FILTERING
   ========================================================================== */
function renderEmployees(list) {
  const container = document.getElementById("employeeGrid");
  const emptyState = document.getElementById("emptyState");

  // Re-inject Table structure if it was replaced by Loading Spinner
  if (container && !container.querySelector("table")) {
    container.className =
      "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden";
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                        <th class="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Base Salary</th>
                        <th class="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th class="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody id="employeeTableBody" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>
     `;
  }

  const tbody = document.getElementById("employeeTableBody");
  if (tbody) tbody.innerHTML = "";

  // Handle Empty
  if (list.length === 0) {
    if (container) container.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (container) container.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  // Render Rows
  list.forEach((emp) => {
    if (tbody) tbody.appendChild(createEmployeeTableRow(emp));
  });
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
    const response = await fetch(`${window.globalState.apiBase}/hr/employees`, {
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Failed to fetch employees");

    const data = await response.json();

    // Store Data
    employeePaymentState.list = data.employees || data || [];
    employeePaymentState.filtered = employeePaymentState.list;

    // Render Table
    renderEmployees(employeePaymentState.list);

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
      "salaryPaymentAccountSelect",
      employeePaymentState.paymentAccounts || []
    );
    renderPaymentAccounts(
      "advancePaymentAccountSelect",
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
/* ==========================================================================
   2. TOP SECTION: AUTOCOMPLETE & CARD LOGIC
   ========================================================================== */

/**
 * Sets up the search-as-you-type logic.
 * @param {string} prefix - 'salary' or 'worker' (matches HTML IDs)
 * @param {function} filterFn - Condition to filter the list (e.g., role check)
 */
function setupEmployeeAutocomplete(prefix, filterFn) {
  const input = document.getElementById(`${prefix}SearchInput`);
  const suggestionsBox = document.getElementById(`${prefix}Suggestions`);

  if (!input || !suggestionsBox) return;

  // Event: User Types
  input.addEventListener("input", function () {
    const query = this.value.toLowerCase().trim();

    // Hide if empty
    if (query.length === 0) {
      suggestionsBox.classList.add("hidden");
      return;
    }

    // Filter Global List
    const matches = employeePaymentState.list.filter((emp) => {
      const matchesQuery =
        emp.name.toLowerCase().includes(query) || emp.mobile.includes(query);
      return matchesQuery && filterFn(emp);
    });

    renderSuggestions(prefix, matches, suggestionsBox);
  });

  // Event: Click Outside to Close
  document.addEventListener("click", function (e) {
    if (!input.contains(e.target) && !suggestionsBox.contains(e.target)) {
      suggestionsBox.classList.add("hidden");
    }
  });
}

function renderSuggestions(prefix, matches, container) {
  container.innerHTML = "";

  // No Results
  if (matches.length === 0) {
    container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">No employees found</div>`;
    container.classList.remove("hidden");
    return;
  }

  // Render List
  matches.forEach((emp) => {
    const div = document.createElement("div");
    div.className =
      "flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors";

    // Initials
    const initials = emp.name.substring(0, 2).toUpperCase();

    div.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                ${initials}
            </div>
            <div>
                <div class="text-sm font-bold text-slate-700">${emp.name}</div>
                <div class="text-xs text-slate-400 capitalize">${emp.role} • ${emp.mobile}</div>
            </div>
        `;

    // Click Action
    div.onclick = () => selectEmployeeForForm(prefix, emp);
    container.appendChild(div);
  });

  container.classList.remove("hidden");
}

function selectEmployeeForForm(prefix, emp) {
  // 1. UI: Hide Search, Show Card
  document.getElementById(`${prefix}SearchContainer`).classList.add("hidden");
  document.getElementById(`${prefix}SelectedCard`).classList.remove("hidden");
  document.getElementById(`${prefix}Suggestions`).classList.add("hidden"); // Close list

  // 2. DATA: Populate Card Details
  document.getElementById(`${prefix}CardInitials`).textContent = emp.name
    .substring(0, 2)
    .toUpperCase();
  document.getElementById(`${prefix}CardName`).textContent = emp.name;
  document.getElementById(`${prefix}CardMobile`).textContent = emp.mobile;

  // Context specific details
  if (prefix === "salary") {
    const roleEl = document.getElementById(`salaryCardRole`);
    const baseEl = document.getElementById(`salaryCardBase`);
    if (roleEl) roleEl.textContent = emp.role;
    if (baseEl)
      baseEl.textContent = parseFloat(emp.base_salary || 0).toLocaleString();
  } else {
    const otEl = document.getElementById(`workerCardOvertime`);
    if (otEl) otEl.textContent = emp.overtime_rate || 0;
  }

  // 3. FORM: Set ID and Show Form
  const idInput = document.getElementById(`${prefix}EmpId`);
  const form = document.getElementById(`${prefix}Form`);

  if (idInput) idInput.value = emp.id;

  if (form) {
    form.classList.remove("hidden", "opacity-50", "pointer-events-none");

    // Set default date to today if empty
    const dateInput = document.getElementById(`${prefix}Date`);
    if (dateInput && !dateInput.value) {
      dateInput.valueAsDate = new Date();
    }
  }
}

// Global Function to Reset (called by 'X' button or after submit)
window.resetAutocomplete = function (prefix) {
  // 1. Reset Search UI
  document
    .getElementById(`${prefix}SearchContainer`)
    .classList.remove("hidden");
  document.getElementById(`${prefix}SelectedCard`).classList.add("hidden");
  document.getElementById(`${prefix}SearchInput`).value = "";

  // 2. Hide and Reset Form
  const form = document.getElementById(`${prefix}Form`);
  if (form) {
    form.classList.add("hidden", "opacity-50", "pointer-events-none");
    form.reset();
  }

  // 3. Clear ID
  const idInput = document.getElementById(`${prefix}EmpId`);
  if (idInput) idInput.value = "";
};

/* ==========================================================================
   3. FORM SUBMISSIONS
   ========================================================================== */

// --- A. Save Salary ---
window.saveSalaryRecord = async function () {
  const empId = document.getElementById("salaryEmpId").value;
  const amount = document.getElementById("salaryAmount").value;
  const paymentAccountID = document.getElementById(
    "salaryPaymentAccountSelect"
  ).value;
  const date = document.getElementById("salaryDate").value;
  // const note = document.getElementById("salaryNote").value;

  const error = !empId
    ? "Please select an employee"
    : !amount
    ? "Please enter salary amount"
    : !paymentAccountID
    ? "Please select payment account"
    : !date
    ? "Please select payment date"
    : null;

  if (error) {
    showModalConfirm("error", "Error", error, "Ok", () => {});
    return;
  }

  try {
    const payload = {
      employee_id: parseInt(empId),
      payment_account_id: parseInt(paymentAccountID),
      amount: parseFloat(amount),
      payment_date: new Date(date).toISOString(),
      // note: note,
      // type: "salary"
    };

    const response = await fetch(
      `${window.globalState.apiBase}/hr/employee/salary/create`,
      {
        method: "POST",
        headers: window.getAuthHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (response.ok) {
      showNotification("success", "Salary payment recorded successfully!");
      resetAutocomplete("salary");
    } else {
      const err = await response.json();
      throw new Error(err.message || "Failed to save salary");
    }
  } catch (error) {
    showNotification("error", error.message);
  }
};

// --- B. Save Worker Progress ---
window.saveWorkerProgress = async function () {
  const empId = document.getElementById("workerEmpId").value;
  const date = document.getElementById("workerDate").value;
  const overtime = document.getElementById("workerOvertime").value || 0;
  const productionUnits = document.getElementById("productionUnits").value || 0;
  const advance = document.getElementById("workerAdvance").value || 0;

  if (!empId || !date) {
    showNotification("warning", "Please select a worker and date.");
    return;
  }

  try {
    const payload = {
      employee_id: parseInt(empId),
      sheet_date: new Date(date).toISOString(),
      production_units: parseInt(productionUnits),
      overtime_hours: parseFloat(overtime),
      advance_payment: parseFloat(advance),
    };

    const response = await fetch(
      `${window.globalState.apiBase}/hr/employee/worker/progress`,
      {
        method: "POST",
        headers: window.getAuthHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (response.ok) {
      showNotification("success", "Worker progress updated!");
      resetAutocomplete("worker");
    } else {
      const err = await response.json();
      throw new Error(err.message || "Failed to update progress");
    }
  } catch (error) {
    showNotification("error", error.message);
  }
};
