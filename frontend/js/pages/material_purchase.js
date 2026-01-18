/* ==========================================================================
   STATE MANAGEMENT
   ========================================================================== */
window.materialPurchaseState = {
  list: [], // Holds the raw data from API
  filtered: [], // Holds data currently shown in the table
  paymentAccounts: [], // Holds payment accounts
};

/* ==========================================================================
   INITIALIZATION UPDATE
   ========================================================================== */
// Modify your window.initMaterialPurchasePage function
window.initMaterialPurchasePage = async function () {
  // 1. Fetch Initial Data
  await fetchSuppliers();
  // await fetchPaymentAccounts();

  // 2. Attach Listeners for the Supplier Table Search
  const searchInput = document.getElementById("supplierSearch");
  const roleFilter = document.getElementById("roleFilter");

  if (searchInput) searchInput.addEventListener("input", filterTableSuppliers);
  if (roleFilter) roleFilter.addEventListener("change", filterTableSuppliers);

  // 3. Initialize Top Section Autocomplete Logic

  // A. Supplier Form (Allows searching ALL active suppliers)
  setupSupplierAutocomplete("supplier", (emp) => emp.status === "active");
};

/* ==========================================================================
   LOGIC: FETCHING DATA
   ========================================================================== */

/* ==========================================================================
   LOGIC: RENDERING & FILTERING
   ========================================================================== */
function renderSuppliers(list) {
  const container = document.getElementById("supplierGrid");
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
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Supplier</th>
                        <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                        <th class="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody id="supplierTableBody" class="divide-y divide-slate-100"></tbody>
            </table>
        </div>
     `;
  }

  const tbody = document.getElementById("supplierTableBody");
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
    if (tbody) tbody.appendChild(createSupplierTableRow(emp));
  });
}

/* ==========================================================================
   1. DATA FETCHING
   ========================================================================== */
async function fetchSuppliers() {
  const container = document.getElementById("supplierGrid");

  // Show Loading Spinner in Table Area
  if (container) {
    container.innerHTML =
      '<div class="w-full text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-brand-600"></i></div>';
  }

  try {
    const response = await fetch(`${window.globalState.apiBase}/suppliers`, {
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Failed to fetch suppliers");

    const data = await response.json();

    // Store Data
    materialPurchaseState.list = data.suppliers || data || [];
    materialPurchaseState.filtered = materialPurchaseState.list;

    // Render Table
    // renderSuppliers(materialPurchaseState.list);

    // Note: We don't need to manually update the top forms here because
    // the autocomplete functions always read directly from `materialPurchaseState.list`
  } catch (error) {
    console.error(error);
    if (container)
      container.innerHTML = `<div class="w-full text-center text-red-500 font-bold py-4">Failed to load supplier data</div>`;
    showNotification("error", "Could not load suppliers.");
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
    materialPurchaseState.paymentAccounts = data.accounts || [];

    // Render dropdown
    renderPaymentAccounts(
      "supplierPaymentAccountSelect",
      materialPurchaseState.paymentAccounts || []
    );
  } catch (error) {
    console.error(error);
    if (container)
      container.innerHTML = `<div class="w-full text-center text-red-500 font-bold py-4">Failed to load supplier data</div>`;
    showNotification("error", "Could not load suppliers.");
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

  select.addEventListener("change", () => {
    console.log(
      "Selected account: ",
      select.options[select.selectedIndex].textContent
    );
  });
}
/* ==========================================================================
   2. TOP SECTION: AUTOCOMPLETE & CARD LOGIC
   ========================================================================== */

/**
 * Sets up the search-as-you-type logic.
 * @param {string} prefix - 'salary' or 'worker' (matches HTML IDs)
 * @param {function} filterFn - Condition to filter the list (e.g., role check)
 */
function setupSupplierAutocomplete(prefix, filterFn) {
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
    const matches = materialPurchaseState.list.filter((emp) => {
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
    container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">No suppliers found</div>`;
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
                <div class="text-xs text-slate-400 capitalize">${emp.mobile}</div>
            </div>
        `;

    // Click Action
    div.onclick = () => selectSupplierForForm(prefix, emp);
    container.appendChild(div);
  });

  container.classList.remove("hidden");
}

function selectSupplierForForm(prefix, emp) {
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

  // 3. FORM: Set ID and Show Form
  const idInput = document.getElementById(`supplierId`);
  const form = document.getElementById(`${prefix}Form`);

  if (idInput) idInput.value = emp.id;

  if (form) {
    form.classList.remove("hidden", "opacity-50", "pointer-events-none");

    // Set default date to today if empty
    const dateInput = document.getElementById(`purchaseDate`);
    if (dateInput && !dateInput.value) {
      dateInput.valueAsDate = new Date();
    }
  }
}

// Global Function to Reset (called by 'X' button or after submit)
window.resetAutocomplete = function (prefix) {
  // 1. Reset Search UI
  document.getElementById(`${prefix}SearchContainer`).classList.remove("hidden");
  document.getElementById(`${prefix}SelectedCard`).classList.add("hidden");
  document.getElementById(`${prefix}SearchInput`).value = "";

  // 2. Hide and Reset Form
  const form = document.getElementById(`${prefix}Form`);
  if (form) {
    form.classList.add("hidden", "opacity-50", "pointer-events-none");
    form.reset();
  }

  // 3. Clear ID
  const idInput = document.getElementById(`supplierId`);
  if (idInput) idInput.value = "";
};

/* ==========================================================================
   3. FORM SUBMISSIONS
   ========================================================================== */

// --- A. Save Salary ---
window.saveMaterialPurchaseRecord = async function () {
  const supplierId = document.getElementById("supplierId").value;
  const memoNo = document.getElementById("memoNo").value;
  const totalAmount = document.getElementById("totalAmount").value;
  // const paymentAccountID = document.getElementById(
  //   "PaymentAccountSelect"
  // ).value;
  const purchaseDate = document.getElementById("purchaseDate").value;
  // const note = document.getElementById("salaryNote").value;

  const error = !supplierId
    ? "Please select supplier"
    : !totalAmount
      ? "Please enter price amount"
      : !memoNo
        ? "Please enter memo no"
        : !purchaseDate
          ? "Please select purchase date"
          : null;

  if (error) {
    showModalConfirm("error", "Error", error, "Ok", () => {});
    return;
  }

  try {
    const payload = {
      memo_no: memoNo,
      purchase_date: new Date(purchaseDate).toISOString(),
      supplier_id: parseInt(supplierId),
      branch_id:window.globalState.user.branch_id,
      total_amount: parseFloat(totalAmount),
    };
    console.log(payload);
    const response = await fetch(
      `${window.globalState.apiBase}/purchase/new`,
      {
        method: "POST",
        headers: window.getAuthHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch report");

    const data = await response.json();
    if (response.ok) {
      showNotification("success", "Purchase completed!");
      resetAutocomplete("supplier");
    } else {
      throw new Error(data.message || "Failed to make purchase");
    }
  } catch (error) {
    console.error(error)
    showNotification("error", error.message);
  }
};
