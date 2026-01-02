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
  const grid = document.getElementById("employeeGrid");
  grid.innerHTML =
    '<div class="col-span-full text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-brand-600"></i></div>';

  try {
    const response = await fetch(`${window.globalState.apiBase}/hr/employees`, {
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) throw new Error("Failed to fetch employees");

    const data = await response.json();
    // Adjust this depending on whether your API returns [array] or { employees: [...] }
    allEmployees = data.employees || data || [];

    renderEmployees(allEmployees);
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="col-span-full text-center text-red-500 font-bold">Failed to load employee data</div>`;
    showNotification("error", "Could not load employees.");
  }
}

/* --- 2. RENDER GRID --- */
function renderEmployees(list) {
  const grid = document.getElementById("employeeGrid");
  const emptyState = document.getElementById("emptyState");

  grid.innerHTML = "";

  if (list.length === 0) {
    grid.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  grid.classList.remove("hidden");
  emptyState.classList.add("hidden");

  list.forEach((emp) => {
    const card = createEmployeeCard(emp);
    grid.appendChild(card);
  });
}

function createEmployeeCard(emp) {
  // 1. Badge Styles (Compact)
  const roleColors = {
    manager: "bg-purple-50 text-purple-700 border-purple-100",
    salesperson: "bg-blue-50 text-blue-700 border-blue-100",
    worker: "bg-slate-50 text-slate-700 border-slate-100",
    chairman: "bg-amber-50 text-amber-700 border-amber-100",
  };
  const badgeClass = roleColors[emp.role] || "bg-slate-50 text-slate-600";

  // 2. Status Logic (Ring Color)
  const statusRing =
    emp.status === "active" ? "ring-emerald-400" : "ring-slate-300";
  const statusBg = emp.status === "active" ? "bg-emerald-400" : "bg-slate-300";

  const div = document.createElement("div");
  // Card Container
  div.className =
    "group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-200 transition-all duration-200 relative overflow-hidden flex flex-col";

  div.innerHTML = `
        <button onclick='editEmployee(${JSON.stringify(emp)})' 
                class="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10">
            <i class="ph ph-note-pencil text-lg"></i>
        </button>

        <div class="p-4 flex-1">
            <div class="flex items-start gap-3">
                <div class="relative shrink-0">
                    <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 border border-slate-200">
                        ${emp.name.charAt(0).toUpperCase()}
                    </div>
                    <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${statusBg} border-2 border-white rounded-full"></span>
                </div>
                
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-0.5">
                        <h4 class="font-bold text-slate-800 text-sm truncate leading-tight">${
                          emp.name
                        }</h4>
                    </div>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${badgeClass}">
                        ${emp.role}
                    </span>
                </div>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-y-2">
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <i class="ph ph-phone text-slate-400"></i>
                    <span class="font-medium text-slate-700 select-all">${
                      emp.mobile
                    }</span>
                </div>
                
                ${
                  emp.email
                    ? `
                <div class="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                    <i class="ph ph-envelope text-slate-400"></i>
                    <span class="truncate hover:text-brand-600 transition-colors cursor-pointer" title="${emp.email}">${emp.email}</span>
                </div>`
                    : ""
                }

                 ${
                   emp.address
                     ? `
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <i class="ph ph-address-book text-slate-400"></i>
                    <span class="truncate hover:text-brand-600 transition-colors cursor-pointer" title="${emp.address}">${emp.address}</span>
                </div>`
                     : ""
                 }
                ${
                  emp.passport_no
                    ? `
                <div class="flex items-center gap-2 text-xs text-slate-500">
                    <i class="ph ph-airplane-tilt text-slate-400"></i>
                    <span class="uppercase tracking-wider hover:text-brand-600 font-mono" title="${emp.passport_no}">${emp.passport_no}</span>
                </div>`
                    : ""
                }
            </div>
        </div>

        <div class="bg-slate-50/80 border-t border-slate-100 px-4 py-2 flex justify-between items-center text-xs">
            <div class="flex flex-col">
                <span class="text-[10px] text-slate-400 font-semibold uppercase">Base Salary</span>
                <span class="font-bold text-slate-700 font-mono">
                    ${
                      emp.base_salary > 0
                        ? parseFloat(emp.base_salary).toLocaleString()
                        : "0"
                    } <span class="text-[10px] text-slate-400 font-sans">SAR</span>
                </span>
            </div>
            
            ${
              emp.overtime_rate > 0
                ? `
            <div class="flex flex-col items-end border-l border-slate-200 pl-3">
                <span class="text-[10px] text-slate-400 font-semibold uppercase">Overtime</span>
                <span class="font-bold text-emerald-600 font-mono">
                    ${parseFloat(
                      emp.overtime_rate
                    ).toLocaleString()} <span class="text-[10px] text-slate-400 font-sans">/hr</span>
                </span>
            </div>`
                : ""
            }
        </div>
    `;

  return div;
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

  // 1. Reset options to base (Worker/Salesperson) to prevent duplicates
  // Assuming your HTML has Worker/Salesperson hardcoded, we keep those and remove others if needed,
  // OR simply re-logic them. Here is a safe way:
  if (window.globalState.user.role === "chairman") {
    // Check if Manager already exists to avoid double appending
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
    // Create a Date object from the UTC string
    const dateObj = new Date(emp.joining_date);

    // Get local Year, Month, Day
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
    const day = String(dateObj.getDate()).padStart(2, "0");

    // Set the input value (YYYY-MM-DD)
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
  const rawDate = document.getElementById("empJoinDate").value; // "YYYY-MM-DD"
  let datePayload = null;

  if (rawDate) {
    // new Date("YYYY-MM-DD") creates a date object at 00:00:00 LOCAL TIME
    // .toISOString() converts that specific instant to UTC for the backend
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
    overtime_rate:
      parseFloat(document.getElementById("empOvertime").value) || 0,
    passport_no: document.getElementById("empPassport").value,
    address: document.getElementById("empAddress").value,

    // This sends the full timestamp (e.g. 2023-10-25T18:00:00.000Z)
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
