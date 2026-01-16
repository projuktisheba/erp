// --- CONFIGURATION ---
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
    roles: ["chairman", "manager"],
    children: [
      {
        label: "Order & Sale",
        pageId: "order_sale",
        action: "loadPage('order_sale','New Order Entry')",
        roles: ["chairman", "manager"],
      },
      {
        label: "Restock Products",
        pageId: "restock_products",
        action: "loadPage('restock_products','Restock Product')",
        roles: ["chairman", "manager"],
      },
      {
        label: "Material Purchase",
        pageId: "material_purchase",
        action: "loadPage('material_purchase','Material Purchase')",
        roles: ["chairman", "manager"],
      },
      {
        label: "Order History",
        pageId: "order_history",
        action: "loadPage('order_history','Order History')",
        roles: ["chairman", "manager"],
      },
      {
        label: "Sales History",
        pageId: "sales_history",
        action: "loadPage('sales_history','Sales History')",
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

// --- STATE MANAGEMENT ---
let currentRole = GetUserRole(); // Default role

// --- 1. RENDER SIDEBAR ---
function renderSidebar(role) {
    if (role) currentRole = role;
    const navContainer = document.getElementById("sidebar-nav");
    navContainer.innerHTML = "";

    // A. INJECT SEARCH INPUT
    const searchHtml = `
        <div class="px-3 mb-4 mt-2">
            <div class="relative group">
                <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10"></i>
                
                <input type="text" id="sidebarSearch" placeholder="Search menu..." 
                    onkeyup="filterSidebar(this.value)"
                    autocomplete="off" 
                    spellcheck="false"
                    autocorrect="off"
                    autocapitalize="off"
                    class="sidebar-search-input w-full bg-slate-800 text-sm text-white placeholder-slate-500 rounded-lg pl-9 pr-10 py-2 outline-none border border-slate-700 focus:border-brand-500 transition-colors">
                
                <button id="searchClearBtn" onclick="clearSidebarSearch()" 
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white hover:text-[#009FFA] transition-all hidden">
                    <i class="ph ph-x-circle text-md"></i>
                </button>
            </div>
        </div>
    `;
    navContainer.innerHTML += searchHtml;

    // B. LOOP & RENDER ITEMS
    menuConfig.forEach((item) => {
        if (item.roles && !item.roles.includes(currentRole)) return;

        if (item.type === "header") {
            navContainer.innerHTML += `<p class="px-3 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4 search-target">${item.label}</p>`;
            return;
        }

        // Render Normal Link
        if (item.type === "link") {
            navContainer.innerHTML += `
                <button onclick="${item.action}; toggleSidebarOnMobile()" data-page="${item.pageId}" tabindex="0"
                    class="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all search-target">
                    <i class="ph ${item.icon} text-lg"></i> 
                    <span class="text-left">${item.label}</span>
                </button>`;
            return;
        }

        // Render Dropdown Parent
        if (item.type === "parent") {
            const visibleChildren = item.children.filter(
                (child) => !child.roles || child.roles.includes(currentRole)
            );
            if (visibleChildren.length === 0) return;

            let childrenHtml = "";
            visibleChildren.forEach((child) => {
                childrenHtml += `
                    <button onclick="${child.action}; toggleSidebarOnMobile()" data-page="${child.pageId}" tabindex="0"
                        class="child-item group w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white hover:bg-slate-800/50 rounded-r-lg border-l-2 border-transparent hover:border-brand-500 transition-all search-target">
                        <div class="dot w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-brand-500 transition-colors"></div>
                        <span class="text-left">${child.label}</span>
                    </button>`;
            });

            navContainer.innerHTML += `
                <div class="parent-group space-y-1 pt-1">
                    <button onclick="toggleSubmenu('${item.id}', this)" tabindex="0"
                        class="parent-btn w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all group select-none search-target">
                        <div class="flex items-center gap-3">
                            <i class="ph ${item.icon} text-lg group-hover:text-brand-500 transition-colors"></i>
                            <span class="text-left">${item.label}</span>
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

    // C. INITIALIZE KEYBOARD NAVIGATION
    setupKeyboardNavigation();
}

// --- 2. PERMISSION UPDATE ---
function updateSidebarRole(newRole) {
    if (newRole !== currentRole) {
        renderSidebar(newRole);
    }
}

// --- 3. SUBMENU LOGIC (Accordion + Animation) ---
function toggleSubmenu(wrapperId, btn) {
    const wrapper = document.getElementById(wrapperId);
    const arrow = btn.querySelector(".arrow-icon");
    if (!wrapper) return;

    // A. Close other menus (Accordion behavior)
    // We strictly apply this only if we are NOT searching
    const isSearching = document.getElementById('sidebarSearch').value.length > 0;
    
    if (!isSearching) {
        document.querySelectorAll('.submenu-wrapper.open').forEach((openMenu) => {
            if (openMenu.id !== wrapperId) {
                closeMenu(openMenu);
            }
        });
    }

    // B. Toggle current menu
    const isClosed = !wrapper.classList.contains("open");
    if (isClosed) {
        openMenu(wrapper, btn, arrow);
    } else {
        closeMenu(wrapper, btn, arrow);
    }
}

// Helper: Open Menu (Simplified)
function openMenu(wrapper, btn = null, arrow = null) {
    // 1. Just add the class (CSS Grid handles the animation)
    wrapper.classList.add("open");
    
    // 2. Handle Icon/Button styling
    if (!btn) btn = wrapper.previousElementSibling;
    if (!arrow && btn) arrow = btn.querySelector(".arrow-icon");

    if (btn) {
        btn.classList.add("text-white");
        const icon = btn.querySelector("i");
        if(icon) icon.classList.add("text-brand-500");
    }
    if (arrow) arrow.style.transform = "rotate(180deg)";
}

// Helper: Close Menu (Simplified)
function closeMenu(wrapper, btn = null, arrow = null) {
    // 1. Just remove the class
    wrapper.classList.remove("open");

    // 2. Handle Icon/Button styling
    if (!btn) btn = wrapper.previousElementSibling;
    if (!arrow && btn) arrow = btn.querySelector(".arrow-icon");

    if (btn) {
        btn.classList.remove("text-white");
        const icon = btn.querySelector("i");
        if(icon) icon.classList.remove("text-brand-500");
    }
    if (arrow) arrow.style.transform = "rotate(0deg)";
}


// --- 4. SEARCH FUNCTIONALITY ---
function filterSidebar(query) {
    const filter = query.toLowerCase();
    const clearBtn = document.getElementById("searchClearBtn");

    // Toggle Clear Button Visibility
    if (filter.length > 0) {
        clearBtn.classList.remove("hidden");
    } else {
        clearBtn.classList.add("hidden");
    }

    const navContainer = document.getElementById("sidebar-nav");
    const allItems = navContainer.querySelectorAll(".parent-group, .nav-item");

    // ... (Rest of your existing filtering logic) ...
    allItems.forEach(group => {
        if(group.classList.contains("nav-item")) {
            const text = group.textContent.toLowerCase();
            group.style.display = text.includes(filter) ? "flex" : "none";
            return;
        }

        if(group.classList.contains("parent-group")) {
            const parentBtn = group.querySelector(".parent-btn");
            const children = group.querySelectorAll(".child-item");
            const wrapper = group.querySelector(".submenu-wrapper");
            
            let parentMatch = parentBtn.textContent.toLowerCase().includes(filter);
            let childMatch = false;

            children.forEach(child => {
                const text = child.textContent.toLowerCase();
                const isMatch = text.includes(filter);
                child.style.display = isMatch ? "flex" : "none";
                if(isMatch) childMatch = true;
            });

            if (filter === "") {
                group.style.display = "block";
                children.forEach(c => c.style.display = "flex");
                closeMenu(wrapper); 
            } 
            else if (parentMatch || childMatch) {
                group.style.display = "block";
                openMenu(wrapper);
            } else {
                group.style.display = "none";
            }
        }
    });
}
// --- CLEAR SEARCH BAR TEXT
function clearSidebarSearch() {
    const input = document.getElementById("sidebarSearch");
    
    // 1. Clear value
    input.value = "";
    
    // 2. Reset Focus to input (so user can type again immediately)
    input.focus();
    
    // 3. Trigger filter to reset the list
    filterSidebar("");
}

// --- 5. KEYBOARD NAVIGATION ---
function setupKeyboardNavigation() {
    const navContainer = document.getElementById("sidebar-nav");

    navContainer.addEventListener("keydown", (e) => {
        const focusable = Array.from(navContainer.querySelectorAll('button[tabindex="0"]:not([style*="display: none"])'));
        const index = focusable.indexOf(document.activeElement);

        if (index === -1) return; // Focus not in sidebar

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = focusable[index + 1] || focusable[0];
            next.focus();
        } 
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = focusable[index - 1] || focusable[focusable.length - 1];
            prev.focus();
        }
        else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            document.activeElement.click();
        }
    });
}


// --- 6. ACTIVE STATE & PERSISTENCE ---
function setActiveSidebarItem(pageId) {
    // 1. Reset all styles
    document.querySelectorAll(".nav-item, .child-item").forEach((btn) => {
        btn.classList.remove("text-white", "border-brand-500", "bg-slate-800/50");
        btn.classList.add("text-slate-400", "border-transparent"); // Reset text & borders
        const dot = btn.querySelector(".dot");
        if (dot) dot.classList.replace("bg-brand-500", "bg-slate-600");
    });

    // 2. Find Active Button
    const activeBtn = document.querySelector(`button[data-page="${pageId}"]`);
    if (!activeBtn) return;

    // 3. Highlight Logic
    activeBtn.classList.remove("text-slate-400", "text-slate-500", "border-transparent");
    activeBtn.classList.add("text-white", "border-brand-500", "bg-slate-800/50");

    // If it's a child, handle the parent
    if (activeBtn.classList.contains("child-item")) {
        const dot = activeBtn.querySelector(".dot");
        if (dot) dot.classList.replace("bg-slate-600", "bg-brand-500");

        const parentWrapper = activeBtn.closest(".submenu-wrapper");
        if (parentWrapper) {
            openMenu(parentWrapper);
        }
    }
    
    // 4. Smooth Scroll to Active Item (UX Improvement)
    setTimeout(() => {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
}

// --- 7. MOBILE HELPERS ---
function toggleSidebarOnMobile() {
    if (window.innerWidth < 768) {
        toggleSidebar();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("mobileOverlay");
    const isClosed = sidebar.classList.contains("-translate-x-full");

    if (isClosed) {
        sidebar.classList.remove("-translate-x-full");
        overlay.classList.remove("hidden");
        setTimeout(() => overlay.classList.remove("opacity-0"), 10);
        // Auto-focus search on open for better UX
        setTimeout(() => document.getElementById("sidebarSearch").focus(), 100); 
    } else {
        sidebar.classList.add("-translate-x-full");
        overlay.classList.add("opacity-0");
        setTimeout(() => overlay.classList.add("hidden"), 300);
    }
}