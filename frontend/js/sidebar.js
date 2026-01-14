// Define the structure of your sidebar
const menuConfig = [
  {
    type: "header",
    label: "Main Menu",
  },
  {
    type: "parent", // This is a dropdown
    label: "Product Management",
    icon: "ph-shopping-cart",
    pageId: "order-menu",
    id: "order-menu", // Unique ID for toggle
    roles: ["chairman", "manager"], // Parent permission
    children: [
      {
        label: "Order & Sale",
        pageId: "order_sale",
        action: "loadPage('order_sale','New Order Entry')",
        roles: ["chairman", "manager"], // Everyone can see
      },
      {
        label: "Restock Products",
        pageId: "restock_products",
        action: "loadPage('restock_products','Restock Product')",
        roles: ["chairman", "manager"], // Everyone can see
      },
      {
        label: "Order History",
        pageId: "order_history",
        action: "loadPage('order_history','Order History')",
        roles: ["chairman", "manager"],
      },
    ],
  },
  {
    type: "parent", // This is a dropdown
    label: "HR Management",
    icon: "ph-microsoft-teams-logo",
    pageId: "employee-menu",
    id: "employee-menu", // Unique ID for toggle
    roles: ["chairman", "manager"], // Parent permission
    children: [
      {
        label: "List Employees",
        action: "loadPage('employees','Employee Management')",
        pageId: "employees",
        roles: ["chairman", "manager"],
      },
      {
        label: "Payment & Salary",
        action:
          "loadPage('employee_payment','Employee Advance Payment & Salary')",
        pageId: "employee_payment",
        roles: ["chairman"],
      },
    ],
  },
  {
    type: "parent", // This is a dropdown
    label: "Customer & Supplier",
    icon: "ph-users-three",
    pageId: "customer-menu",
    id: "customer-menu", // Unique ID for toggle
    roles: ["chairman", "manager"], // Parent permission
    children: [
      {
        label: "List Customers",
        action: "loadPage('customers','Customer List')",
        pageId: "customers",
        roles: ["chairman", "manager"],
      },
      {
        label: "List Suppliers",
        action: "loadPage('suppliers','Supplier List')",
        pageId: "suppliers",
        roles: ["chairman", "manager"],
      },
    ],
  },

  {
    type: "parent", // This is a dropdown
    label: "Report",
    icon: "ph-chart-line-up",
    pageId: "report-menu",
    id: "report-menu", // Unique ID for toggle
    roles: ["chairman", "manager"], // Parent permission
    children: [
      {
        label: "Branch Report",
        action: "loadPage('branch_report','Branch Analytics')",
        pageId: "branch_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Purchase Report",
        action: "loadPage('purchase_report','Purchase Report')",
        pageId: "purchase_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Sales Report",
        action: "loadPage('sales_report','Sales Report')",
        pageId: "sales_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Stock Report",
        action: "loadPage('stock_report','Stock Report')",
        pageId: "stock_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Salesperson Progress",
        action:
          "loadPage('salesperson_progress_report','Salesperson Progress Report')",
        pageId: "salesperson_progress_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Worker Progress",
        action: "loadPage('worker_progress_report','Worker Progress Report')",
        pageId: "worker_progress_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Salary Report",
        action: "loadPage('salary_report','Salary Report')",
        pageId: "salary_report",
        roles: ["chairman", "manager"],
      },
      {
        label: "Transaction Report",
        action: "loadPage('transaction_report','Transaction Report')",
        pageId: "transaction_report",
        roles: ["chairman", "manager"],
      },
    ],
  },
];
// --- SIDEBAR SUBMENU TOGGLE ---

function renderSidebar(currentUserRole = "manager") {
  const navContainer = document.getElementById("sidebar-nav");
  navContainer.innerHTML = "";

  menuConfig.forEach((item) => {
    if (item.roles && !item.roles.includes(currentUserRole)) return;

    if (item.type === "header") {
      navContainer.innerHTML += `<p class="px-3 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">${item.label}</p>`;
      return;
    }

    // 1. RENDER NORMAL LINKS
    if (item.type === "link") {
      navContainer.innerHTML += `
                <button onclick="${item.action}; toggleSidebarOnMobile()" data-page="${item.pageId}"
                    class="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
                    <i class="ph ${item.icon} text-lg"></i> 
                    <span>${item.label}</span>
                </button>`;
      return;
    }

    // 2. RENDER PARENT/CHILD LINKS
    if (item.type === "parent") {
      const visibleChildren = item.children.filter(
        (child) => !child.roles || child.roles.includes(currentUserRole)
      );
      if (visibleChildren.length === 0) return;

      let childrenHtml = "";
      visibleChildren.forEach((child) => {
        childrenHtml += `
                    <button onclick="${child.action}; toggleSidebarOnMobile()" data-page="${child.pageId}"
                        class="child-item group w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white hover:bg-slate-800/50 rounded-r-lg border-l-2 border-transparent hover:border-brand-500 transition-all">
                        <div class="dot w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-brand-500 transition-colors"></div>
                        <span>${child.label}</span>
                    </button>`;
      });

      navContainer.innerHTML += `
                <div class="space-y-1 pt-1">
                    <button onclick="toggleSubmenu('${item.id}', this)"
                        class="parent-btn w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all group select-none">
                        <div class="flex items-center gap-3">
                            <i class="ph ${item.icon} text-lg group-hover:text-brand-500 transition-colors"></i>
                            <span>${item.label}</span>
                        </div>
                        <i class="ph ph-caret-down arrow-icon transition-transform duration-300"></i>
                    </button>
                    <div id="${item.id}" class="submenu-wrapper">
                        <div class="submenu-inner">
                            <div class="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-3">
                                ${childrenHtml}
                            </div>
                        </div>
                    </div>
                </div>`;
    }
  });
}
function setActiveSidebarItem(pageId) {
  // 1. RESET ALL: Remove active classes from Top-level and Child links
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.remove("text-white", "border-brand-500", "bg-slate-800/50");
    btn.classList.add("text-slate-400"); // Reset to default grey
    const icon = btn.querySelector("i");
    if (icon) icon.classList.remove("text-white");
  });

  document.querySelectorAll(".child-item").forEach((btn) => {
    btn.classList.remove("text-white", "border-brand-500", "bg-slate-800/50");
    btn.classList.add("text-slate-500", "border-transparent");

    // Reset the dot color
    const dot = btn.querySelector(".dot");
    if (dot) {
      dot.classList.remove("bg-brand-500");
      dot.classList.add("bg-slate-600");
    }
  });

  // 2. FIND ACTIVE: Look for the button with data-page="pageId"
  // (Note: This relies on the renderSidebar() function we wrote previously)
  const activeBtn = document.querySelector(`button[data-page="${pageId}"]`);

  if (!activeBtn) return; // If page not found in menu, stop here

  // 3. HIGHLIGHT: Check if it is a Parent (nav-item) or Child (child-item)
  if (activeBtn.classList.contains("nav-item")) {
    // --- TOP LEVEL LINK ---
    activeBtn.classList.remove("text-slate-400");
    activeBtn.classList.add(
      "text-white",
      "border-brand-500",
      "bg-slate-800/50"
    );
  } else if (activeBtn.classList.contains("child-item")) {
    // --- CHILD LINK ---
    activeBtn.classList.remove("text-slate-500", "border-transparent");
    activeBtn.classList.add(
      "text-white",
      "border-brand-500",
      "bg-slate-800/50"
    );

    // Highlight the dot
    const dot = activeBtn.querySelector(".dot");
    if (dot) {
      dot.classList.remove("bg-slate-600");
      dot.classList.add("bg-brand-500");
    }

    // 4. AUTO-EXPAND PARENT
    const parentWrapper = activeBtn.closest(".submenu-wrapper");
    // The button immediately before the wrapper is the Parent Toggle
    const parentBtn = parentWrapper?.previousElementSibling;

    if (parentWrapper && parentBtn) {
      // Open the accordion if it's closed
      if (!parentWrapper.classList.contains("open")) {
        // We reuse your existing toggle function logic here manually
        parentWrapper.classList.add("open");
        const arrow = parentBtn.querySelector(".arrow-icon");
        if (arrow) arrow.style.transform = "rotate(180deg)";
      }
      // Ensure parent text is highlighted to indicate active section
      parentBtn.classList.add("text-white");
      const parentIcon = parentBtn.querySelector("i");
      if (parentIcon) parentIcon.classList.add("text-brand-500");
    }
  }
}
// --- 1. SIDEBAR TOGGLE (MOBILE) ---
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("mobileOverlay");

  // Check if sidebar is currently hidden (translated off screen)
  const isClosed = sidebar.classList.contains("-translate-x-full");

  if (isClosed) {
    // Open Sidebar
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
    setTimeout(() => overlay.classList.remove("opacity-0"), 10); // Fade in
  } else {
    // Close Sidebar
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("opacity-0");
    setTimeout(() => overlay.classList.add("hidden"), 300); // Wait for fade out
  }
}

// --- 2. SUBMENU TOGGLE (ACCORDION) ---
function toggleSubmenu(wrapperId, btn) {
  const wrapper = document.getElementById(wrapperId);
  const arrow = btn.querySelector(".arrow-icon");

  if (!wrapper) return;

  // Toggle grid state
  wrapper.classList.toggle("open");

  // Rotate Arrow
  if (wrapper.classList.contains("open")) {
    arrow.style.transform = "rotate(180deg)";
    btn.classList.add("text-white"); // Highlight parent
  } else {
    arrow.style.transform = "rotate(0deg)";
    btn.classList.remove("text-white");
  }
}

// --- 3. HELPER FOR MOBILE CLICKS ---
function toggleSidebarOnMobile() {
  if (window.innerWidth < 768) {
    toggleSidebar();
  }
}
