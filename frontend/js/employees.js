/* --- EMPLOYEES PAGE LOGIC --- */
let allEmployees = [];

// Initialize Page
window.initEmployeesPage = async function () {
  console.log("Employees Page Initialized");

  // Set default date for new entry
  document.getElementById("empJoinDate").valueAsDate = new Date();

  await fetchEmployees();

  // Attach Search Listener
  document
    .getElementById("employeeSearch")
    .addEventListener("input", filterEmployees);
  document
    .getElementById("roleFilter")
    .addEventListener("change", filterEmployees);
};

/* --- 1. FETCH DATA --- */
async function fetchEmployees() {
  const container = document.getElementById("employeeGrid"); // We use the same ID, but treat it as a table container
  
  // Loading State
  container.innerHTML =
    '<div class="w-full text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-brand-600"></i></div>';

  try {
    const response = await fetch(`${window.globalState.apiBase}/hr/employees`, {
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Failed to fetch employees");

    const data = await response.json();
    allEmployees = data.employees || data || [];

    renderEmployees(allEmployees);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="w-full text-center text-red-500 font-bold py-4">Failed to load employee data</div>`;
    showNotification("error", "Could not load employees.");
  }
}

/* --- 2. RENDER TABLE --- */
function renderEmployees(list) {
  const container = document.getElementById("employeeGrid");
  const emptyState = document.getElementById("emptyState");

  // Reset container styles to be a Table Container instead of a Grid
  container.className = "col-span-full overflow-x-auto bg-white rounded-lg shadow border border-slate-200";
  container.innerHTML = "";

  if (list.length === 0) {
    container.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  container.classList.remove("hidden");
  emptyState.classList.add("hidden");

  // Build Table Structure
  const table = document.createElement("table");
  table.className = "min-w-full divide-y divide-slate-200";
  
  // Table Header
  table.innerHTML = `
    <thead class="bg-slate-50">
        <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Employee</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contact</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Salary (SAR)</th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
        </tr>
    </thead>
    <tbody class="bg-white divide-y divide-slate-200" id="employeeTableBody">
    </tbody>
  `;

  container.appendChild(table);
  const tbody = table.querySelector("#employeeTableBody");

  // Append Rows
  list.forEach((emp) => {
    const row = createEmployeeTableRow(emp);
    tbody.appendChild(row);
  });
}

function createEmployeeTableRow(emp) {
  // 1. Badge Styles
  const roleColors = {
    manager: "bg-purple-50 text-purple-700 ring-purple-600",
    salesperson: "bg-blue-50 text-blue-700 ring-blue-700",
    worker: "bg-slate-50 text-slate-600 ring-slate-500",
    chairman: "bg-amber-50 text-amber-700 ring-amber-600",
  };
  const badgeClass = roleColors[emp.role] || "bg-slate-50 text-slate-600 ring-slate-500/10";

  // 2. Status Logic
  const statusColor = emp.status === "active" ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20" : "text-slate-600 bg-slate-50 ring-slate-500/10";

  const tr = document.createElement("tr");
  tr.className = "hover:bg-slate-50 transition-colors duration-150";

  tr.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex items-center">
              <div class="h-9 w-9 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-bold border border-brand-100 mr-3 text-sm">
                  ${emp.name.charAt(0).toUpperCase()}
              </div>
              <div class="flex flex-col">
                  <div class="text-sm font-medium text-slate-900">${emp.name}</div>
                  <div class="text-xs text-slate-400">${emp.passport_no || ''}</div>
              </div>
          </div>
      </td>

      <td class="px-6 py-4 whitespace-nowrap">
          <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass} uppercase tracking-wide">
              ${emp.role}
          </span>
      </td>

      <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex flex-col gap-0.5">
            <div class="text-sm text-slate-600 flex items-center gap-1.5">
                <i class="ph ph-phone text-slate-400 text-xs"></i> ${emp.mobile}
            </div>
            ${emp.email ? `
            <div class="text-xs text-slate-500 flex items-center gap-1.5">
                <i class="ph ph-envelope text-slate-400 text-xs"></i> 
                <span class="truncate max-w-[150px]" title="${emp.email}">${emp.email}</span>
            </div>` : ''}
          </div>
      </td>

      <td class="px-6 py-4 whitespace-nowrap">
          <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusColor} capitalize">
              ${emp.status}
          </span>
      </td>

      <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm text-slate-900 font-medium">
             ${parseFloat(emp.base_salary).toLocaleString()}
          </div>
          ${emp.overtime_rate > 0 ? `
            <div class="text-xs text-emerald-600 font-medium">
                +${parseFloat(emp.overtime_rate).toLocaleString()} /hr
            </div>
          ` : '<div class="text-xs text-slate-400"></div>'}
      </td>

      <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <button onclick='editEmployee(${JSON.stringify(emp)})' 
                  class="text-slate-400 hover:text-brand-600 transition-colors p-2 hover:bg-brand-50 rounded-full">
              <i class="ph ph-pencil-simple text-lg"></i>
          </button>
      </td>
  `;

  return tr;
}

/* --- 3. SEARCH & FILTER --- */
function filterEmployees() {
  const query = document.getElementById("employeeSearch").value.toLowerCase();
  const role = document.getElementById("roleFilter").value;

  const filtered = allEmployees.filter((emp) => {
    const matchesName =
      emp.name.toLowerCase().includes(query) || emp.mobile.includes(query);
    const matchesRole = role === "all" || emp.role === role;
    return matchesName && matchesRole;
  });

  renderEmployees(filtered);
}

/* --- 4. MODAL & FORM --- */
function openEmployeeModal() {
  const empRole = document.getElementById("empRole");

  if (window.globalState.user.role === "chairman") {
    let hasManager = Array.from(empRole.options).some(
      (opt) => opt.value === "manager"
    );
    let hasChairman = Array.from(empRole.options).some(
      (opt) => opt.value === "chairman"
    );

    if (!hasManager) {
      empRole.add(new Option("Manager", "manager"));
    }
    if (!hasChairman) {
      empRole.add(new Option("Chairman", "chairman"));
    }
  }

  document.getElementById("employeeForm").reset();
  document.getElementById("empId").value = "";
  document.getElementById("modalTitle").textContent = "Add New Employee";
  document.getElementById("empStatus").value = "active";
  document.getElementById("empRole").disabled = !["manager", "chairman"].some(
    (role) => window.globalState.user?.role?.includes(role)
  );
  // Set default date to Today (Local Time)
  document.getElementById("empJoinDate").valueAsDate = new Date();
  document.getElementById("employeeModal").classList.remove("hidden");
}

window.editEmployee = function (emp) {
  document.getElementById("modalTitle").textContent = "Edit Employee Details";
  document.getElementById("empId").value = emp.id;
  document.getElementById("empName").value = emp.name;
  document.getElementById("empRole").value = emp.role;
  document.getElementById("empMobile").value = emp.mobile;
  document.getElementById("empEmail").value = emp.email || "";
  document.getElementById("empStatus").value = emp.status;
  document.getElementById("empSalary").value = emp.base_salary;
  document.getElementById("empOvertime").value = emp.overtime_rate;
  document.getElementById("empPassport").value = emp.passport_no || "";
  document.getElementById("empAddress").value = emp.address || "";
  document.getElementById("empPassword").value = "";

  // --- DATE DISPLAY LOGIC (UTC -> Local Input) ---
  if (emp.joining_date) {
    const dateObj = new Date(emp.joining_date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    document.getElementById("empJoinDate").value = `${year}-${month}-${day}`;
  }

  document.getElementById("employeeModal").classList.remove("hidden");
};

function closeEmployeeModal() {
  document.getElementById("employeeModal").classList.add("hidden");
}

/* --- 5. SAVE (CREATE / UPDATE) --- */
async function saveEmployee() {
  const id = document.getElementById("empId").value;
  const branch_id = window.globalState.user.branch_id;

  // Required Fields Check
  const name = document.getElementById("empName").value;
  const role = document.getElementById("empRole").value;
  const mobile = document.getElementById("empMobile").value;

  if (!name || !role || !mobile) {
    showNotification("warning", "Please fill in Name, Role, and Mobile.");
    return;
  }

  // --- DATE SAVE LOGIC (Local Input -> ISO String) ---
  const rawDate = document.getElementById("empJoinDate").value;
  let datePayload = null;

  if (rawDate) {
    datePayload = new Date(rawDate).toISOString();
  } else {
    datePayload = new Date().toISOString();
  }

  const payload = {
    name,
    role,
    mobile,
    email: document.getElementById("empEmail").value,
    password: document.getElementById("empPassword").value,
    status: document.getElementById("empStatus").value,
    base_salary: parseFloat(document.getElementById("empSalary").value) || 0,
    overtime_rate: parseFloat(document.getElementById("empOvertime").value) || 0,
    passport_no: document.getElementById("empPassport").value,
    address: document.getElementById("empAddress").value,
    joining_date: datePayload,
    branch_id: branch_id,
  };

  const url = id
    ? `${window.globalState.apiBase}/hr/employee/update/${id}`
    : `${window.globalState.apiBase}/hr/employee/new`;

  const method = id ? "PUT" : "POST";

  try {
    const response = await fetch(url, {
      method: method,
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      showNotification(
        "success",
        id ? "Employee updated!" : "New employee added!"
      );
      closeEmployeeModal();
      fetchEmployees();
    } else {
      throw new Error(data.message || "Operation failed");
    }
  } catch (error) {
    console.error(error);
    showNotification("error", error.message);
  }
}