/* --- STATE MANAGEMENT --- */
window.supplierState = {
  list: [],
  filtered: [],
};

/* --- INITIALIZATION --- */
window.initSuppliersPage = async function () {
  await fetchSuppliers();
};

/* --- 1. FETCH DATA (READ) --- */
async function fetchSuppliers() {
  const tbody = document.getElementById("supplierTableBody");
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center py-10">Loading...</td></tr>';

  try {
    const branchId = window.globalState.user.branch_id;
    const response = await fetch(
      `${window.globalState.apiBase}/suppliers?branch_id=${branchId}`,
      {
        method: "GET",
        headers: window.getAuthHeaders(),
      }
    );

    if (!response.ok) throw new Error("Failed to fetch");

    const data = await response.json();
    supplierState.list = data.suppliers || [];
    supplierState.filtered = data.suppliers || [];
    renderTable();
  } catch (error) {
    console.error("Error:", error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-500">Error loading data</td></tr>`;
  }
}

/* --- 2. RENDER TABLE --- */
function renderTable() {
  const supplierTable = document.getElementById("supplierTable");
  const tbody = document.getElementById("supplierTableBody");
  const emptyState = document.getElementById("emptyState");
  tbody.innerHTML = "";

  if (supplierState.filtered.length === 0) {
    supplierTable.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  supplierTable.classList.remove("hidden");
  emptyState.classList.add("hidden");

  supplierState.filtered.forEach((supplier) => {
    const statusBadge = supplier.status == 'active'
      ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span>`
      : `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Inactive</span>`;

    /* --- Inside renderTable() --- */
    tbody.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
            <td class="px-4 py-3 md:px-6 md:py-4 font-medium text-slate-900">
                ${supplier.name}
            </td>
            
            <td class="px-4 py-3 md:px-6 md:py-4 text-slate-600">
                ${supplier.mobile}
            </td>

            <td class="hidden sm:table-cell px-6 py-4 text-center">
                ${statusBadge}
            </td>
            
            <td class="px-4 py-3 md:px-6 md:py-4 text-center">
                <div class="flex justify-center gap-2">
                    <button onclick="editSupplier(${
                      supplier.id
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
  supplierState.filtered = supplierState.list.filter(
    (c) => c.name.toLowerCase().includes(term) || c.mobile.includes(term)
  );
  renderTable();
};

/* --- 4. MODAL ACTIONS --- */
window.openSupplierModal = function () {
  // Reset Form
  document.getElementById("supplierId").value = "";
  document.getElementById("modalTitle").textContent = "New Supplier";

  // Clear Inputs
  const ids = ["inputName", "inputMobile"];
  ids.forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("inputStatus").checked = true;

  document.getElementById("supplierModal").classList.remove("hidden");
};

window.closeSupplierModal = function () {
  document.getElementById(
    "supplierSubmitBtn"
  ).innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i>Save`;
  document.getElementById("supplierModal").classList.add("hidden");
};

/* --- 5. CREATE / UPDATE LOGIC --- */
window.handleSaveSupplier = async function (e) {
  e.preventDefault();

  //show submit spinner
  document.getElementById(
    "supplierSubmitBtn"
  ).innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Processing...`;
  const id = document.getElementById("supplierId").value;
  const isEdit = !!id;

  // Construct Payload based on DB Schema
  const payload = {
    branch_id: window.globalState.user.branch_id,
    name: document.getElementById("inputName").value,
    mobile: document.getElementById("inputMobile").value,
    status: document.getElementById("inputStatus").checked
      ? "active"
      : "inactive",
  };

  const url = isEdit
    ? `${window.globalState.apiBase}/supplier/update/${id}`
    : `${window.globalState.apiBase}/supplier/new`;

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
        `${isEdit ? "Supplier updated!" : "Supplier created!"}`
      );
      fetchSuppliers(); // Refresh list
    } else {
      showNotification(
        "error",
        `${"Error: " + (result.message || "Could not save supplier")}`
      );
    }
  } catch (error) {
    console.error(error);
    showNotification("error", "Server Error");
  } finally {
    closeSupplierModal();
  }
};

/* --- 6. EDIT PREP --- */
window.editSupplier = function (id) {
  const supplier = supplierState.list.find((c) => c.id === id);
  if (!supplier) return;

  // Populate Fields
  document.getElementById("supplierId").value = supplier.id;
  document.getElementById("modalTitle").textContent = "Edit Supplier";

  document.getElementById("inputName").value = supplier.name;
  document.getElementById("inputMobile").value = supplier.mobile;
  document.getElementById("inputStatus").checked = supplier.status == "active";

  document.getElementById("supplierModal").classList.remove("hidden");
};

// /* --- 7. DELETE LOGIC --- */
// window.deleteSupplier = async function (id) {
//   if (!confirm("Are you sure you want to delete this supplier?")) return;

//   try {
//     const response = await fetch(
//       `${window.globalState.apiBase}/supplier/delete/${id}`,
//       {
//         method: "DELETE",
//         headers: window.getAuthHeaders(),
//       }
//     );

//     if (response.ok) {
//       showNotification('success', 'Supplier Deleted');
//       fetchSuppliers();
//     } else {
//       showNotification('error', 'Cannot delete (Constraint Violation or Server Error)');
//     }
//   } catch (error) {
//     console.error(error);
//    showNotification('error', 'Server Error');
//   }
// };

/* --- PRINT --- */
window.printSupplierReport = function () {
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
      reportTitle: "Supplier Report",
      branchName: "",
      startDate: "",
      endDate: "",
    },
    columns: columns,
    rows: supplierState.filtered,
    totals: null,
  });
};
