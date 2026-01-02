// Define the structure of your sidebar
const menuConfig = [
    {
        type: 'header',
        label: 'Main Menu'
    },
    {
        type: 'link',
        label: 'New Order',
        icon: 'ph-shopping-cart',
        action: "loadPage('order','New Order Entry')",
        roles: ['chairman', 'manager'] // Everyone can see
    },
    // const titles = {
    //   order: ,
    //   history: "",
    //   customers: "",
    //   employees: "",
    // };
    {
        type: 'link',
        label: 'History',
        icon: 'ph-clock-counter-clockwise',
        action: "loadPage('history','Transaction History')",
        roles: ['chairman', 'manager'] // Cashier cannot see
    },
    {
        type: 'parent', // This is a dropdown
        label: 'Employee',
        icon: 'ph-users-three',
        id: 'employee-menu', // Unique ID for toggle
        roles: ['chairman', 'manager'], // Parent permission
        children: [
            {
                label: 'List Employees',
                action: "loadPage('employees','Employee Management')",
                roles: ['chairman', 'manager']
            },
            {
                label: 'Payment & Salary',
                action: "loadPage('employee_payment','Employee Advance Payment & Salary')",
                roles: ['chairman']
            }
        ]
    },
    {
        type: 'link',
        label: 'Customers',
        icon: 'ph-users',
        action: "loadPage('customers','Customer Database')",
        roles: ['chairman', 'manager',]
    }
];
// --- SIDEBAR SUBMENU TOGGLE ---

function renderSidebar(currentUserRole='manager') {
    const navContainer = document.getElementById('sidebar-nav');
    navContainer.innerHTML = ''; // Clear current menu

    menuConfig.forEach(item => {
        // 1. Check if user has permission for this item
        if (item.roles && !item.roles.includes(currentUserRole)) {
            return; // Skip if no permission
        }

        // 2. Handle Section Headers (e.g., "Main Menu")
        if (item.type === 'header') {
            navContainer.innerHTML += `
                <p class="px-3 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">
                    ${item.label}
                </p>`;
            return;
        }

        // 3. Handle Normal Links
        if (item.type === 'link') {
            const html = `
                <button onclick="${item.action}; toggleSidebarOnMobile()"
                    class="nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
                    <i class="ph ${item.icon} text-lg"></i> 
                    <span>${item.label}</span>
                </button>`;
            navContainer.innerHTML += html;
            return;
        }

        // 4. Handle Parent (Dropdown) Items
        if (item.type === 'parent') {
            // Filter children: Only show children the user is allowed to see
            const visibleChildren = item.children.filter(child => 
                !child.roles || child.roles.includes(currentUserRole)
            );

            // If user has no access to any children, hide the parent too
            if (visibleChildren.length === 0) return;

            // Generate Children HTML
            let childrenHtml = '';
            visibleChildren.forEach(child => {
                childrenHtml += `
                    <button onclick="${child.action}; toggleSidebarOnMobile()"
                        class="group w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white hover:bg-slate-800/50 rounded-r-lg border-l-2 border-transparent hover:border-brand-500 transition-all">
                        <div class="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-brand-500 transition-colors"></div>
                        <span>${child.label}</span>
                    </button>`;
            });

            // Generate Parent Wrapper HTML
            const parentHtml = `
                <div class="space-y-1 pt-1">
                    <button onclick="toggleSubmenu('${item.id}', this)"
                        class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all group select-none">
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
            
            navContainer.innerHTML += parentHtml;
        }
    });
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