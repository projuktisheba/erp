/* --- GLOBAL CONFIGURATION --- */
window.globalState = {
  apiBase: "http://localhost:8080/api/v1", // Backend URL
  token: null,
  user: {
    id: null,
    name: "",
    role: "",
    branch_id: 0,
    email: "",
  },
  currentPage: "",
};

// Map Branch IDs to Names (For display purposes)
const BRANCH_NAMES = {
  1: "AL FANAR ABAYAT",
  2: "DIVA ABAYAT",
  3: "EID AL ABAYAT",
};

/* --- 1. INITIALIZATION (Check Session) --- */
document.addEventListener("DOMContentLoaded", () => {
  checkSession();
});

function checkSession() {
  const storedToken = localStorage.getItem("authToken");
  const storedUser = localStorage.getItem("authUser");

  if (storedToken && storedUser) {
    // Restore Session
    window.globalState.token = storedToken;

    // This line restores the branch_id you saved in handleBranchSwitch
    window.globalState.user = JSON.parse(storedUser);

    document.getElementById("loginModal").classList.add("hidden");
    updateUI();
    loadPage("order");
  } else {
    document.getElementById("loginModal").classList.remove("hidden");
  }
}

/* --- 2. LOGIN HANDLING --- */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  // UI Loading State
  const btn = document.getElementById("loginBtn");
  const errorBox = document.getElementById("loginErrorMsg");
  const originalBtnText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> Processing...`;
  errorBox.classList.add("hidden");

  // Get Inputs
  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await fetch(`${window.globalState.apiBase}/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      // SUCCESS: Reset the form here
      e.target.reset();

      handleLoginSuccess(data);
    } else {
      throw new Error(data.message || "Invalid credentials");
    }
  } catch (error) {
    console.error("Login Failed:", error);
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
    btn.disabled = false;
    btn.innerHTML = originalBtnText;
  }
});
/* --- PASSWORD VISIBILITY TOGGLE --- */
window.togglePasswordVisibility = function () {
  const passwordInput = document.getElementById("loginPassword");
  const eyeIcon = document.getElementById("eyeIcon");

  if (passwordInput.type === "password") {
    // Show Password
    passwordInput.type = "text";
    eyeIcon.classList.remove("ph-eye-slash");
    eyeIcon.classList.add("ph-eye");
  } else {
    // Hide Password
    passwordInput.type = "password";
    eyeIcon.classList.remove("ph-eye");
    eyeIcon.classList.add("ph-eye-slash");
  }
};
function handleLoginSuccess(data) {
  const { token, employee } = data;

  // 1. Update State
  window.globalState.token = token;
  window.globalState.user = {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    branch_id: employee.branch_id,
    email: employee.email,
  };

  // 2. Persist to LocalStorage
  localStorage.setItem("authToken", token);
  localStorage.setItem("authUser", JSON.stringify(window.globalState.user));

  // 3. Update UI
  updateUI();

  // 4. Close Modal & Load Page
  document.getElementById("loginModal").classList.add("hidden");

  // Restore button state
  const btn = document.getElementById("loginBtn");
  btn.disabled = false;
  btn.innerHTML = `<span>Sign In</span> <i class="ph ph-arrow-right font-bold"></i>`;

  loadPage("order");
}

/* --- 3. SIGNOUT HANDLING --- */
window.signout = function () {
  showModalConfirm(
    "warning",
    "Logout",
    "Are you sure to logout",
    "Yes",
    () => {
      localStorage.clear();
      window.location.reload();
    },
    cancelText = "Cancel"
  );
};

/* --- 4. UI & RESPONSIVE LOGIC --- */
function updateUI() {
  const user = window.globalState.user;

  // Sidebar Info
  document.getElementById("userInitial").textContent = user.name
    .charAt(0)
    .toUpperCase();
  document.getElementById("displayRoleSide").textContent =
    user.role.toUpperCase();

  // Header Branch Control
  updateHeaderBranchControl();
  //update sidebar
  renderSidebar(user.role || 'manager');
}

/* --- UPDATE HEADER BRANCH CONTROL --- */
function updateHeaderBranchControl() {
  const headerBranch = document.getElementById("branchControlContainer");
  const { role, branch_id } = window.globalState.user;
  const branchName = BRANCH_NAMES[branch_id] || `Branch #${branch_id}`;

  // Super Admin gets a dropdown with 'onchange' event
  if (role === "chairman" || role === "super_admin") {
    headerBranch.innerHTML = `
            <div class="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1 md:px-3 md:py-1.5 border border-slate-200">
                <span class="hidden md:inline text-xs font-bold text-slate-500 uppercase">Branch</span>
                <select onchange="handleBranchSwitch(this.value)" class="bg-transparent text-xs md:text-sm font-semibold text-slate-800 outline-none cursor-pointer max-w-[100px] md:max-w-none">
                    <option value="1" ${
                      branch_id == 1 ? "selected" : ""
                    }>AL FANAR</option>
                    <option value="2" ${
                      branch_id == 2 ? "selected" : ""
                    }>DIVA</option>
                    <option value="3" ${
                      branch_id == 3 ? "selected" : ""
                    }>EID AL</option>
                </select>
            </div>`;
  } else {
    headerBranch.innerHTML = `
            <div class="flex flex-col items-end">
                <span class="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:block">Branch</span>
                <span class="text-xs md:text-sm font-bold text-brand-700 truncate max-w-[100px] md:max-w-none text-right">
                    ${branchName}
                </span>
            </div>`;
  }
}

/* --- HANDLE BRANCH SWITCHING --- */
window.handleBranchSwitch = function (newBranchId) {
  // 1. Update Global State in Memory
  window.globalState.user.branch_id = parseInt(newBranchId);
  console.log(`Branch switched to ID: ${newBranchId}`);

  // 2. PERSIST CHANGE TO LOCAL STORAGE (The Fix)
  // We get the current saved user, update the branch, and save it back.
  const savedUser = JSON.parse(localStorage.getItem("authUser"));
  if (savedUser) {
    savedUser.branch_id = parseInt(newBranchId);
    localStorage.setItem("authUser", JSON.stringify(savedUser));
  }

  // 3. Identify Current Page
  const pageName = window.globalState.currentPage;
  if (!pageName) return;

  // 4. Re-run the Init Function for the current page
  const initFunctionName =
    "init" + pageName.charAt(0).toUpperCase() + pageName.slice(1) + "Page";

  if (typeof window[initFunctionName] === "function") {
    window[initFunctionName]();
  } else {
    loadPage(pageName);
  }
};

/* --- 5. DYNAMIC PAGE ROUTER --- */
async function loadPage(pageName, pageTitle) {
  window.globalState.currentPage = pageName;
  const container = document.getElementById("dynamic-content");

  // 1. Update Sidebar UI
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("bg-brand-600", "text-white", "shadow-lg");
    btn.classList.add(
      "text-slate-400",
      "hover:text-white",
      "hover:bg-slate-800"
    );
  });

  const activeBtn = document.getElementById(`btn-${pageName}`);
  if (activeBtn) {
    activeBtn.classList.remove(
      "text-slate-400",
      "hover:text-white",
      "hover:bg-slate-800"
    );
    activeBtn.classList.add("bg-brand-600", "text-white", "shadow-lg");
  }

  // 2. Load HTML Content
  try {
    const response = await fetch(`pages/${pageName}.html`);
    if (!response.ok) throw new Error("Page file not found");

    const html = await response.text();
    container.innerHTML = html;

    // Update Header Title
    document.getElementById("pageTitle").textContent = pageTitle || "Dashboard";

    // 3. Load the specific JS file for this page
    loadPageScript(pageName);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="p-8 text-center text-red-500 font-bold bg-white rounded-xl shadow-sm">
            Error: Could not load ${pageName}. <br> 
            <span class="text-xs text-slate-400 font-normal">Check console for details. Ensure Live Server is running.</span>
        </div>`;
  }
}

/* --- 6. DYNAMIC SCRIPT LOADER --- */
function loadPageScript(pageName) {
  // A. Remove any previous page-specific script
  const oldScript = document.getElementById("page-specific-script");
  if (oldScript) {
    oldScript.remove();
  }

  // B. Create new script tag
  const script = document.createElement("script");
  script.src = `js/${pageName}.js`;
  script.id = "page-specific-script";

  // C. When loaded, initialize the page logic
  script.onload = () => {
    console.log(`${pageName}.js loaded successfully.`);
    const initFunctionName =
      "init" + pageName.charAt(0).toUpperCase() + pageName.slice(1) + "Page";

    if (typeof window[initFunctionName] === "function") {
      window[initFunctionName]();
    } else {
      console.warn(
        `Function ${initFunctionName} not found in js/${pageName}.js`
      );
    }
  };

  script.onerror = () => {
    console.warn(`No specific script found for js/${pageName}.js`);
  };

  document.body.appendChild(script);
}

/* --- 7. AUTH HEADER HELPER --- */
// Use this in other files: headers: window.getAuthHeaders()
window.getAuthHeaders = function () {
  return {
    "Content-Type": "application/json",
    "X-Branch-ID": window.globalState.user.branch_id,
    Authorization: `Bearer ${window.globalState.token}`,
  };
};

/* --- CUSTOM NOTIFICATION SYSTEM --- */

/**
 * Display a toast notification
 * @param {string} type - 'success', 'error', 'warning'
 * @param {string} message - The text to display
 * @Usage showNotification('success', 'Data saved successfully!');
 */
/* --- CUSTOM NOTIFICATION SYSTEM (With Pausable Timer) --- */

// 1. Inject Custom CSS for the Progress Bar Animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes shrinkWidth {
    from { width: 100%; }
    to { width: 0%; }
  }
  .timer-running {
    animation: shrinkWidth 3s linear forwards;
  }
  .toast-card:hover .timer-running {
    animation-play-state: paused;
  }
`;
document.head.appendChild(styleSheet);

window.showNotification = function (type, message) {
  const container = document.getElementById("notification-container");

  // Configuration
  const config = {
    success: {
      icon: "ph-check-circle",
      bg: "bg-white",
      border: "border-l-4 border-emerald-500",
      text: "text-slate-800",
      iconColor: "text-emerald-500",
      barColor: "bg-emerald-500",
    },
    error: {
      icon: "ph-warning-circle",
      bg: "bg-white",
      border: "border-l-4 border-red-500",
      text: "text-slate-800",
      iconColor: "text-red-500",
      barColor: "bg-red-500",
    },
    warning: {
      icon: "ph-warning",
      bg: "bg-white",
      border: "border-l-4 border-amber-500",
      text: "text-slate-800",
      iconColor: "text-amber-500",
      barColor: "bg-amber-500",
    },
  };

  const style = config[type] || config.success;

  // Create Toast Element
  const toast = document.createElement("div");

  // Added 'toast-card' class for the hover selector
  toast.className = `
        toast-card pointer-events-auto w-80 relative overflow-hidden flex items-center gap-3 p-4 rounded-lg shadow-lg ${style.bg} ${style.border} 
        transform transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] 
        translate-x-[120%] opacity-0 ring-1 ring-black/5 mt-3
    `;

  toast.innerHTML = `
        <i class="ph ${style.icon} ${style.iconColor} text-2xl shrink-0"></i>
        <div class="flex-1 min-w-0 z-10"> <p class="font-semibold text-[10px] ${style.text} truncate">${message}</p>
        </div>
        
        <button onclick="dismissToast(this)" class="text-slate-400 hover:text-slate-600 transition p-1 z-10">
            <i class="ph ph-x text-lg"></i>
        </button>

        <div class="absolute bottom-0 left-0 h-1 ${style.barColor} timer-running"></div>
    `;

  container.appendChild(toast);

  // Animate Entrance
  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-[120%]", "opacity-0");
  });

  // AUTO REMOVAL LOGIC
  // We listen for the CSS animation to finish.
  // Hovering pauses the CSS animation, so this event won't fire while hovered.
  const progressBar = toast.querySelector(".timer-running");
  progressBar.addEventListener("animationend", () => {
    dismissToast(toast.querySelector("button"));
  });
};

// Helper: Smooth Exit
window.dismissToast = function (btn) {
  const toast = btn.closest("div.pointer-events-auto");
  if (!toast) return;

  // Slide Out
  toast.classList.add("translate-x-[120%]", "opacity-0");

  // Remove from DOM
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 1000);
};

/* --- FULL SCREEN MODAL SYSTEM --- */

/**
 * Display a full-screen confirmation/alert modal
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {string} title - Bold header text
 * @param {string} message - Description text
 * @param {string} confirmText - Text for the action button
 * @param {function} onConfirm - Function to run when confirmed
 * @param {string} cancelText - (Optional) Text for cancel button (defaults to "Cancel")
 */
window.showModalConfirm = function (
  type,
  title,
  message,
  confirmText,
  onConfirm,
  cancelText = "Cancel"
) {
  // 1. Define Styles based on Type
  const config = {
    success: {
      icon: "ph-check-circle",
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-100",
      btnBg: "bg-emerald-600 hover:bg-emerald-700",
      ring: "focus:ring-emerald-500",
    },
    error: {
      // Good for "Delete" or "Critical" actions
      icon: "ph-bug", // or ph-warning-octagon
      iconColor: "text-red-600",
      iconBg: "bg-red-100",
      btnBg: "bg-red-600 hover:bg-red-700",
      ring: "focus:ring-red-500",
    },
    warning: {
      icon: "ph-warning",
      iconColor: "text-amber-600",
      iconBg: "bg-amber-100",
      btnBg: "bg-amber-600 hover:bg-amber-700",
      ring: "focus:ring-amber-500",
    },
    info: {
      icon: "ph-info",
      iconColor: "text-brand-600",
      iconBg: "bg-brand-100",
      btnBg: "bg-brand-600 hover:bg-brand-700",
      ring: "focus:ring-brand-500",
    },
    question: {
      icon: "ph-question",
      iconColor: "text-yellow-600",
      iconBg: "bg-yellow-100",
      btnBg: "bg-yellow-600 hover:bg-yellow-700",
      ring: "focus:ring-yellow-500",
    },
  };

  const style = config[type] || config.info;

  // 2. Create the Modal Container
  const modalId = "modal-" + Date.now();
  const overlay = document.createElement("div");

  // Z-Index 9999 ensures it sits above everything, including toasts
  overlay.id = modalId;
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm opacity-0 transition-opacity duration-200";

  // 3. The Modal HTML content
  overlay.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 transform scale-95 transition-all duration-200 border border-slate-100" id="${modalId}-card">
            
            <div class="flex flex-col items-center text-center">
                <div class="w-16 h-16 rounded-full ${style.iconBg} flex items-center justify-center mb-4 shadow-inner">
                    <i class="ph ${style.icon} ${style.iconColor} text-3xl"></i>
                </div>

                <h3 class="text-lg font-bold text-slate-800 mb-2">${title}</h3>
                <p class="text-[12px] text-slate-800 mb-6 leading-relaxed">
                    ${message}
                </p>

                <div class="flex gap-3 w-full">
                    <button id="${modalId}-cancel" class="flex-1 px-2 py-2.5 bg-slate-100 border hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300">
                        ${cancelText}
                    </button>
                    
                    <button id="${modalId}-confirm" class="flex-1 px-2 py-2.5 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.btnBg} ${style.ring}">
                        ${confirmText}
                    </button>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);

  // 4. Animate In (Next Frame)
  requestAnimationFrame(() => {
    overlay.classList.remove("opacity-0");
    const card = document.getElementById(`${modalId}-card`);
    card.classList.remove("scale-95");
    card.classList.add("scale-100");
  });

  // 5. Cleanup Helper
  const closeModal = () => {
    const card = document.getElementById(`${modalId}-card`);
    overlay.classList.add("opacity-0"); // Fade out bg
    card.classList.remove("scale-100"); // Scale down card
    card.classList.add("scale-95");

    // Remove from DOM after transition
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 200);
  };

  // 6. Bind Events
  // Cancel Button
  document.getElementById(`${modalId}-cancel`).onclick = closeModal;

  // Confirm Button
  document.getElementById(`${modalId}-confirm`).onclick = () => {
    if (typeof onConfirm === "function") {
      onConfirm(); // Run the specific function passed
    }
    closeModal();
  };

  // Close on Background Click (Optional - remove if you want to force button choice)
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
};
