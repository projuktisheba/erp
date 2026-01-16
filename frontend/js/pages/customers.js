/* --- STATE MANAGEMENT --- */
window.customerState = {
  list: [],
  filtered: [],
};

/* --- INITIALIZATION --- */
window.initCustomersPage = async function () {
  await fetchCustomers();
};

/* --- 1. FETCH DATA (READ) --- */
async function fetchCustomers() {
  const tbody = document.getElementById("customerTableBody");
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center py-10">Loading...</td></tr>';

  try {
    const branchId = window.globalState.user.branch_id;
    const response = await fetch(
      `${window.globalState.apiBase}/customers?branch_id=${branchId}`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch");

    const data = await response.json();
    customerState.list = data.customers || [];
    customerState.filtered = data.customers || [];
    renderTable();
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

  if (customerState.filtered.length === 0) {
    customerTable.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  customerTable.classList.remove("hidden");
  emptyState.classList.add("hidden");

  customerState.filtered.forEach((customer) => {
    const statusBadge = customer.status
      ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span>`
      : `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Inactive</span>`;

    // Format address/tax for display
    const subInfo =
      [customer.address, customer.tax_id ? `Tax: ${customer.tax_id}` : null]
        .filter(Boolean)
        .join("<br>") || // Creates a double line
      "No Address";
    /* --- Inside renderTable() --- */
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
                    <button onclick="editCustomer(${
                      customer.id
                    })" class="text-blue-600 hover:bg-blue-50 md:rounded">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>                    
                </div>
            </td>
        </tr>
    `;
  });
}

/* --- 3. HANDLE SEARCH --- */
window.handleSearch = function (query) {
  const term = query.toLowerCase();
  customerState.filtered = customerState.list.filter(
    (c) => c.name.toLowerCase().includes(term) || c.mobile.includes(term)
  );
  renderTable();
};

/* --- 4. MODAL ACTIONS --- */
window.openCustomerModal = function () {
  // Reset Form
  document.getElementById("customerId").value = "";
  document.getElementById("modalTitle").textContent = "New Customer";

  // Clear Inputs
  const ids = [
    "inputName",
    "inputMobile",
    "inputTaxId",
    "inputAddress",
    "measureLength",
    "measureShoulder",
    "measureBust",
    "measureWaist",
    "measureHip",
    "measureArmHole",
    "measureSleeveL",
    "measureSleeveW",
    "measureRoundW",
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

  //show submit spinner
  document.getElementById(
    "customerSubmitBtn"
  ).innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processing...`;
  const id = document.getElementById("customerId").value;
  const isEdit = !!id;

  // Construct Payload based on DB Schema
  const payload = {
    branch_id: window.globalState.user.branch_id,
    name: document.getElementById("inputName").value,
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
      showNotification(
        "success",
        `${isEdit ? "Customer updated!" : "Customer created!"}`
      );
      fetchCustomers(); // Refresh list
    } else {
      showNotification(
        "error",
        `${"Error: " + (result.message || "Could not save customer")}`
      );
    }
  } catch (error) {
    console.error(error);
    showNotification("error", "Server Error");
  } finally {
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

  document.getElementById("inputName").value = customer.name;
  document.getElementById("inputMobile").value = customer.mobile;
  document.getElementById("inputAddress").value = customer.address;
  document.getElementById("inputTaxId").value = customer.tax_id;
  document.getElementById("inputStatus").checked = customer.status;

  // Populate Measurements
  document.getElementById("measureLength").value = customer.length || "";
  document.getElementById("measureShoulder").value = customer.shoulder || "";
  document.getElementById("measureBust").value = customer.bust || "";
  document.getElementById("measureWaist").value = customer.waist || "";
  document.getElementById("measureHip").value = customer.hip || "";
  document.getElementById("measureArmHole").value = customer.arm_hole || "";
  document.getElementById("measureSleeveL").value =
    customer.sleeve_length || "";
  document.getElementById("measureSleeveW").value = customer.sleeve_width || "";
  document.getElementById("measureRoundW").value = customer.round_width || "";

  document.getElementById("customerModal").classList.remove("hidden");
};

// /* --- 7. DELETE LOGIC --- */
// window.deleteCustomer = async function (id) {
//   if (!confirm("Are you sure you want to delete this customer?")) return;

//   try {
//     const response = await fetch(
//       `${window.globalState.apiBase}/customer/delete/${id}`,
//       {
//         method: "DELETE",
//         headers: window.getAuthHeaders(),
//       }
//     );

//     if (response.ok) {
//       showNotification('success', 'Customer Deleted');
//       fetchCustomers();
//     } else {
//       showNotification('error', 'Cannot delete (Constraint Violation or Server Error)');
//     }
//   } catch (error) {
//     console.error(error);
//    showNotification('error', 'Server Error');
//   }
// };

/* --- PRINT --- */
window.printCustomerReport = function () {
  const branchName = GetBranchName();

  const columns = [
    { label: "ID", key: "id", align: "left" },
    { label: "Name", key: "name", align: "left" },
    { label: "Mobile", key: "mobile", align: "left" },
    { label: "Address", key: "address", align: "left" },
    { label: "Due", key: "due_amount", align: "right" },
  ];

  printReportGeneric({
    header: {
      companyName: branchName,
      reportTitle: "Customer Report",
      branchName: "",
      startDate: "",
      endDate: "",
    },
    columns: columns,
    rows: customerState.filtered,
    totals: null,
  });
};
