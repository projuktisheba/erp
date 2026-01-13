/**
 * Renders a professional, sliding-window pagination.
 * * @param {string} containerId - DOM ID for the buttons container (e.g., 'paginationContainer')
 * @param {string} infoId - DOM ID for the text info (e.g., 'paginationInfo')
 * @param {object} params - { currentPage, totalRecords, pageLength }
 * @param {function} onPageChange - Callback function receiving the new page number
 */
window.renderPagination = function (containerId, infoId, params, onPageChange) {
    const { currentPage, totalRecords, pageLength } = params;
    const container = document.getElementById(containerId);
    const infoContainer = document.getElementById(infoId);
    
    // Safety check
    if (!container) return;

    const totalPages = Math.ceil(totalRecords / pageLength) || 1;
    
    // 1. Update Text Info (Showing X-Y of Z)
    if (infoContainer) {
        if (totalRecords === 0) {
            infoContainer.textContent = "No results found";
        } else {
            const start = (currentPage - 1) * pageLength + 1;
            const end = Math.min(currentPage * pageLength, totalRecords);
            infoContainer.textContent = `Showing ${start}-${end} of ${totalRecords} results`;
        }
    }

    // 2. Generate Logic for Sliding Window (e.g., 1 ... 4 5 6 ... 10)
    const delta = 2; // Number of pages to show around current page
    const range = [];
    const rangeWithDots = [];

    for (let i = 1; i <= totalPages; i++) {
        // Always show first, last, or pages within range
        if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
            range.push(i);
        }
    }

    let l;
    for (let i of range) {
        if (l) {
            if (i - l === 2) rangeWithDots.push(l + 1);
            else if (i - l !== 1) rangeWithDots.push('...');
        }
        rangeWithDots.push(i);
        l = i;
    }

    // 3. Generate HTML
    // Styles
    const btnBase = "px-3 py-2 text-sm font-medium border rounded-lg transition-colors shadow-sm focus:outline-none";
    const btnActive = "bg-slate-800 text-white border-slate-800 hover:bg-slate-700";
    const btnInactive = "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-brand-600";
    const btnDisabled = "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed opacity-60";

    let html = '';

    // Prev Button
    html += `<button data-page="${currentPage - 1}" class="${btnBase} ${currentPage <= 1 ? btnDisabled : btnInactive}" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>`;

    // Page Numbers
    rangeWithDots.forEach(page => {
        if (page === '...') {
            html += `<span class="px-2 py-2 text-slate-400 font-medium">...</span>`;
        } else {
            const isActive = page === currentPage;
            html += `<button data-page="${page}" class="${btnBase} ${isActive ? btnActive : btnInactive}">${page}</button>`;
        }
    });

    // Next Button
    html += `<button data-page="${currentPage + 1}" class="${btnBase} ${currentPage >= totalPages ? btnDisabled : btnInactive}" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>`;

    // Inject HTML
    container.innerHTML = html;

    // 4. Attach Event Listener (Event Delegation)
    // We remove old listeners by cloning (simple trick) or just overwriting innerHTML removes internal listeners attached via JS, 
    // but since we are re-rendering, we need to re-attach the delegated listener to the container.
    
    // Ideally, clear previous listeners if possible, but for this simpler implementation:
    // We will assign a direct onclick to the container to catch bubbling events
    container.onclick = function(e) {
        const btn = e.target.closest('button');
        if (!btn || btn.disabled) return;
        
        const newPage = parseInt(btn.dataset.page);
        if (newPage && newPage !== currentPage) {
            onPageChange(newPage);
        }
    };
};