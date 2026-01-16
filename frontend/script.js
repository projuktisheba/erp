/* --- GLOBAL CONFIGURATION --- */
window.GetBaseAPI = function (){
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  return isLocal ? "http://localhost:8080/api/v1" : "https://erp-qatar-api.pssoft.xyz/api/v1";
}
window.globalState = {
  apiBase: GetBaseAPI(), // Backend URL
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
window.GetBranchName = function (){
  return BRANCH_NAMES[(window.globalState.user.branch_id) || 0]
}
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
    // This line restores the branch_id
    window.globalState.user = JSON.parse(storedUser);

    document.getElementById("loginModal").classList.add("hidden");
    updateUI();

    // --- NEW LOGIC START ---
    // Retrieve last visited page or default to 'order_sale'
    const lastPage = localStorage.getItem("last_page_name") || "order_sale";
    const lastTitle = localStorage.getItem("last_page_title") || "New Order Entry";
    
    loadPage(lastPage, lastTitle);
    // --- NEW LOGIC END ---

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

  // 4. Close Modal
  document.getElementById("loginModal").classList.add("hidden");

  // Restore button state
  const btn = document.getElementById("loginBtn");
  btn.disabled = false;
  btn.innerHTML = `<span>Sign In</span> <i class="ph ph-arrow-right font-bold"></i>`;

  // --- CHANGED --- 
  // Force default page on fresh login to avoid confusion from previous sessions
  loadPage("order_sale", "New Order Entry");
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

    // 1. UPDATE SIDEBAR UI
    if (typeof setActiveSidebarItem === "function") {
        setActiveSidebarItem(pageName);
    }

    // 2. LOAD HTML CONTENT
    try {
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) {
          container.innerHTML = "";
          container.innerHTML = `
          <div class="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in-up">
            <div class="relative mb-6 group">
                <div class="absolute inset-0 bg-brand-500/20 rounded-full blur-xl"></div>
                <div class="relative w-24 h-24 bg-slate-50 rounded-full border border-slate-400 flex items-center justify-center mx-auto shadow-sm group-hover:border-brand-500 transition-colors">
                    <i class="ph ph-seal-question text-5xl text-slate-400 group-hover:text-brand-500 transition-colors"></i>
                </div>
            </div>

            <h1 class="text-4xl font-black text-slate-800 mb-2 tracking-tight">404</h1>
            <h2 class="text-xl font-bold text-slate-700 mb-3">Page Not Found</h2>
            
            <p class="text-slate-400 max-w-xs mx-auto mb-8 text-sm leading-relaxed">
                We couldn't find the page you're looking for. It might have been removed or you may have typed the URL incorrectly.
            </p>
            
            <a onclick='loadPage("order_sale", "New Order Entry")' 
              class="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-600 text-slate-600 px-6 py-2.5 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md">
                <i class="ph ph-arrow-left"></i>
                <span>Go Back Home</span>
            </a>

          </div>
          `
          return;
        }

        const html = await response.text();
        container.innerHTML = html;

        // Auto-format title if missing
        if (!pageTitle) {
            pageTitle = pageName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        document.getElementById("pageTitle").textContent = pageTitle;

        // --- NEW LOGIC START ---
        // Persist the current location to LocalStorage
        localStorage.setItem("last_page_name", pageName);
        localStorage.setItem("last_page_title", pageTitle);
        // --- NEW LOGIC END ---

        // 3. LOAD SPECIFIC JS
        loadPageScript(pageName);

    } catch (error) {
        console.error(error);
        // container.innerHTML = `<div class="p-8 text-center text-red-500 font-bold bg-white rounded-xl shadow-sm">
        //     Error: Could not load ${pageName}. <br> 
        //     <span class="text-xs text-slate-400 font-normal">Check console for details. Ensure Live Server is running.</span>
        // </div>`;
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
    const initFunctionName = "init" +
    pageName
      .split("_")                       // split by underscore
      .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // capitalize first letter of each word
      .join("")                         // join all words
    + "Page";

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

