
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
        <div class="flex-1 min-w-0 z-10"> <p class="font-semibold text-[11px] ${style.text} truncate">${message}</p>
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