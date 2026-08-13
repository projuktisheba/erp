/* --- STATE MANAGEMENT --- */
window.customerState = {
  list: [],
  // Pagination & Filter State
  currentPage: 1,
  pageLength: 10,
  searchQuery: "",
  dueFilter: "all", // 'all', 'due', 'no_due'
  totalRecords: 0,
  searchDebounce: null,
};

/* --- INITIALIZATION --- */
window.initCustomersPage = async function () {
  
  // 1. Grab Elements
  const searchInput = document.getElementById("searchCustomerInput");
  const dueSelect = document.getElementById("dueFilterSelector");
  const pageLengthSelect = document.getElementById("pageLengthSelector");

  // 2. Search Listener (Debounced)
  if (searchInput) {
    searchInput.value = customerState.searchQuery;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(customerState.searchDebounce);
      customerState.searchDebounce = setTimeout(() => {
        const newVal = e.target.value.trim();
        if (customerState.searchQuery !== newVal) {
          customerState.searchQuery = newVal;
          customerState.currentPage = 1; // Reset to page 1
          fetchCustomers();
        }
      }, 400);
    });
  }

  // 3. Due Filter Listener
  if (dueSelect) {
    dueSelect.value = customerState.dueFilter;
    dueSelect.addEventListener("change", (e) => {
      customerState.dueFilter = e.target.value;
      customerState.currentPage = 1;
      fetchCustomers();
    });
  }

  // 4. Page Length Listener
  if (pageLengthSelect) {
    pageLengthSelect.value = customerState.pageLength.toString();
    pageLengthSelect.addEventListener("change", (e) => {
      customerState.pageLength = parseInt(e.target.value);
      customerState.currentPage = 1;
      fetchCustomers();
    });
  }

  // 5. Initial Fetch
  await fetchCustomers();
};

/* --- 1. FETCH DATA (READ) --- */
async function fetchCustomers() {
  const tbody = document.getElementById("customerTableBody");
  
  // Loading State
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-400">Loading Customers...</td></tr>';

  try {
    const branchId = window.globalState.user.branch_id;
    
    // Build Query Params (Server-side Pagination & Filtering)
    const params = new URLSearchParams();
    params.append("branch_id", branchId);
    params.append("page", customerState.currentPage);
    params.append("limit", customerState.pageLength);
    
    if (customerState.searchQuery) {
      params.append("search", customerState.searchQuery);
    }
    
    if (customerState.dueFilter !== 'all') {
      params.append("due_filter", customerState.dueFilter);
    }

    const response = await fetch(
      `${window.globalState.apiBase}/customers?${params.toString()}`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch");

    const data = await response.json();
    
    // Update State
    customerState.list = data.customers || [];
    customerState.totalRecords = parseInt(data.total_count || data.totalRecords || 0);
    
    renderTable();

    // Render Pagination Controls
    if (window.renderPagination) {
      window.renderPagination(
        "paginationContainer", // ID of button container
        "paginationInfo",      // ID of text info
        {
          currentPage: customerState.currentPage,
          totalRecords: customerState.totalRecords,
          pageLength: customerState.pageLength,
        },
        (newPage) => {
          customerState.currentPage = newPage;
          fetchCustomers();
        }
      );
    }

  } catch (error) {
    console.error("Error:", error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-500">Error loading data</td></tr>`;
  }
}

/* --- 2. RENDER TABLE --- */
function renderTable() {
  const customerTable = document.getElementById("customerTable");
  const tbody = document.getElementById("customerTableBody");
  const emptyState = document.getElementById("emptyState");
  tbody.innerHTML = "";

  if (customerState.list.length === 0) {
    customerTable.classList.add("hidden");
    emptyState.classList.remove("hidden");
    // Clear pagination info if empty
    const pageInfo = document.getElementById("paginationInfo");
    if (pageInfo) pageInfo.innerHTML = "";
    return;
  }

  customerTable.classList.remove("hidden");
  emptyState.classList.add("hidden");

  customerState.list.forEach((customer) => {
    const statusBadge = customer.status
      ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span>`
      : `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Inactive</span>`;

    // Format address/tax for display
    const subInfo =
      [customer.address, customer.tax_id ? `Tax: ${customer.tax_id}` : null]
        .filter(Boolean)
        .join("<br>") || "No Address";

    tbody.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
            <td class="px-4 py-3 md:px-6 md:py-4 font-medium text-slate-900">
                ${customer.name}
            </td>
            
            <td class="px-4 py-3 md:px-6 md:py-4 text-slate-600">
                ${customer.mobile}
            </td>
            
            <td class="hidden md:table-cell px-6 py-4 text-xs text-slate-500 max-w-[200px] truncate">
                ${subInfo}
            </td>
            
            <td class="px-4 py-3 md:px-6 md:py-4 text-right font-bold ${
              customer.due_amount > 0 ? "text-red-500" : "text-slate-900"
            }">
                ${parseFloat(customer.due_amount).toFixed(2)}
            </td>
            
            <td class="hidden sm:table-cell px-6 py-4 text-center">
                ${statusBadge}
            </td>
            
            <td class="px-4 py-3 md:px-6 md:py-4 text-center">
                <div class="flex justify-center gap-2">
                    <button onclick="editCustomer(${customer.id})" class="text-blue-600 hover:bg-blue-50 md:rounded">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>                    
                </div>
            </td>
        </tr>
    `;
  });
}

/* --- 3. COUNTRY SELECTOR LOGIC --- */
window.toggleCountryDropdown = function (e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("countryDropdown");
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains("hidden");
  if (isHidden) {
    dropdown.classList.remove("hidden");
    const searchInput = document.getElementById("countrySearchInput");
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    window.renderCountryList("");
  } else {
    dropdown.classList.add("hidden");
  }
};

window.filterCountryList = function (query) {
  window.renderCountryList(query);
};

window.renderCountryList = function (query = "") {
  const container = document.getElementById("countryListContainer");
  if (!container || !window.getGroupedCountries) return;

  const grouped = window.getGroupedCountries(query);
  const letters = Object.keys(grouped).sort();

  if (letters.length === 0) {
    container.innerHTML = `<div class="px-4 py-6 text-center text-slate-400 text-xs">No countries found</div>`;
    return;
  }

  let html = "";
  letters.forEach((letter) => {
    html += `
      <div class="px-3 py-1 font-bold text-slate-400 bg-slate-50 border-y border-slate-100 uppercase tracking-wider text-[10px] sticky top-0 z-10">
        ${letter}
      </div>
    `;

    grouped[letter].forEach((c) => {
      // Escape name for single quote safety
      const safeName = c.name.replace(/'/g, "\\'");
      const flagImg = window.getFlagImgHtml ? window.getFlagImgHtml(c.iso, c.name) : c.flag;
      html += `
        <div onclick="selectCountry('${safeName}', '${c.code}', '${c.flag}', '${c.iso}')"
             class="px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between cursor-pointer transition-colors text-slate-700">
          <div class="flex items-center gap-2 min-w-0">
            ${flagImg}
            <span class="font-medium text-xs text-slate-800 truncate">${c.name}</span>
          </div>
          <span class="font-bold text-slate-600 text-xs shrink-0 ml-2">+${c.code}</span>
        </div>
      `;
    });
  });

  container.innerHTML = html;
};

window.selectCountry = function (name, code, flag, iso = "") {
  document.getElementById("inputCountry").value = name;
  document.getElementById("inputCountryCode").value = code;

  const flagSpan = document.getElementById("selectedCountryFlag");
  const dialSpan = document.getElementById("selectedCountryDialCode");

  if (flagSpan) {
    const flagImg = window.getFlagImgHtml ? window.getFlagImgHtml(iso, name) : flag;
    flagSpan.innerHTML = flagImg || flag;
  }
  if (dialSpan) dialSpan.textContent = "+" + code;

  const dropdown = document.getElementById("countryDropdown");
  if (dropdown) dropdown.classList.add("hidden");
};

// Close country dropdown on click outside
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("countryDropdown");
  const btn = document.getElementById("countrySelectBtn");
  if (dropdown && !dropdown.classList.contains("hidden") && !dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.add("hidden");
  }
});

/* --- 4. MODAL ACTIONS --- */
window.openCustomerModal = function () {
  // Reset Form
  document.getElementById("customerId").value = "";
  document.getElementById("modalTitle").textContent = "New Customer";

  // Set default country to Qatar
  window.selectCountry("Qatar", "974", "🇶🇦", "QA");

  // Clear Inputs
  const ids = [
    "inputName", "inputMobile", "inputTaxId", "inputAddress",
    "measureLength", "measureShoulder", "measureBust", "measureWaist",
    "measureHip", "measureArmHole", "measureSleeveL", "measureSleeveW", "measureRoundW",
  ];
  ids.forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("inputStatus").checked = true;

  document.getElementById("customerModal").classList.remove("hidden");
};

window.closeCustomerModal = function () {
  document.getElementById("customerModal").classList.add("hidden");
};

/* --- 5. CREATE / UPDATE LOGIC --- */
window.handleSaveCustomer = async function (e) {
  e.preventDefault();

  const btn = document.getElementById("customerSubmitBtn");
  const originalBtnContent = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processing...`;
  
  const id = document.getElementById("customerId").value;
  const isEdit = !!id;

  const payload = {
    branch_id: window.globalState.user.branch_id,
    name: document.getElementById("inputName").value,
    country: document.getElementById("inputCountry").value || "Qatar",
    country_code: document.getElementById("inputCountryCode").value || "974",
    mobile: document.getElementById("inputMobile").value,
    address: document.getElementById("inputAddress").value,
    tax_id: document.getElementById("inputTaxId").value,
    status: document.getElementById("inputStatus").checked,

    // Measurements
    length: document.getElementById("measureLength").value,
    shoulder: document.getElementById("measureShoulder").value,
    bust: document.getElementById("measureBust").value,
    waist: document.getElementById("measureWaist").value,
    hip: document.getElementById("measureHip").value,
    arm_hole: document.getElementById("measureArmHole").value,
    sleeve_length: document.getElementById("measureSleeveL").value,
    sleeve_width: document.getElementById("measureSleeveW").value,
    round_width: document.getElementById("measureRoundW").value,
  };

  const url = isEdit
    ? `${window.globalState.apiBase}/customer/update/${id}`
    : `${window.globalState.apiBase}/customer/new`;

  const method = isEdit ? "PUT" : "POST";

  try {
    const response = await fetch(url, {
      method: method,
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response || response.ok) {
      showNotification("success", `${isEdit ? "Customer updated!" : "Customer created!"}`);
      fetchCustomers(); // Refresh list to show changes
    } else {
      showNotification("error", `${"Error: " + (result.message || "Could not save customer")}`);
    }
  } catch (error) {
    console.error(error);
    showNotification("error", "Server Error");
  } finally {
    btn.innerHTML = originalBtnContent;
    closeCustomerModal();
  }
};

/* --- 6. EDIT PREP --- */
window.editCustomer = function (id) {
  const customer = customerState.list.find((c) => c.id === id);
  if (!customer) return;

  // Populate Fields
  document.getElementById("customerId").value = customer.id;
  document.getElementById("modalTitle").textContent = "Edit Customer";

  const countryName = customer.country || "Qatar";
  const countryCode = customer.country_code || "974";
  const foundCountry = (window.COUNTRY_LIST || []).find(c => c.code === countryCode || c.name === countryName);
  const flag = foundCountry ? foundCountry.flag : "🇶🇦";
  const iso = foundCountry ? foundCountry.iso : "QA";

  window.selectCountry(countryName, countryCode, flag, iso);

  document.getElementById("inputName").value = customer.name;
  document.getElementById("inputMobile").value = customer.mobile;
  document.getElementById("inputAddress").value = customer.address;
  document.getElementById("inputTaxId").value = customer.tax_id || "";
  document.getElementById("inputStatus").checked = customer.status;

  // Populate Measurements
  const fields = {
      measureLength: customer.length,
      measureShoulder: customer.shoulder,
      measureBust: customer.bust,
      measureWaist: customer.waist,
      measureHip: customer.hip,
      measureArmHole: customer.arm_hole,
      measureSleeveL: customer.sleeve_length,
      measureSleeveW: customer.sleeve_width,
      measureRoundW: customer.round_width
  };

  for (const [key, val] of Object.entries(fields)) {
      document.getElementById(key).value = val || "";
  }

  document.getElementById("customerModal").classList.remove("hidden");
};

/* --- 6. PRINT --- */
window.printCustomerReport = function () {
  const branchName = GetBranchName();

  const columns = [
    { label: "Name", key: "name", align: "left" },
    { label: "Mobile", key: "mobile", align: "left" },
    { label: "Address", key: "address", align: "left" },
    { label: "Due", key: "due_amount", align: "right" },
  ];

  printReportGeneric({
    header: {
      companyName: branchName,
      reportTitle: "Customer List",
      branchName: "",
      startDate: "",
      endDate: "",
    },
    columns: columns,
    rows: customerState.list, // Prints current page view
    totals: null,
  });
};