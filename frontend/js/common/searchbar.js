/**
 * Initializes a search mechanism for a specific section.
 * * @param {Object} config - Configuration object
 * @param {string} config.prefix - The HTML ID prefix (e.g., 'salary', 'worker')
 * @param {Array} config.data - The array of objects to search through
 * @param {Function} config.onSelect - CUSTOM FUNCTION: Runs after selection (receives the selected object)
 * @param {Array} config.searchKeys - (Optional) Object keys to search (default: ['name', 'mobile'])
 * @param {string} config.hiddenId - (Optional) ID of hidden input (default: prefix + 'EmpId')
 */
window.initAutocomplete = function({ 
    prefix, 
    data, 
    onSelect, 
    searchKeys = ['name', 'mobile'], 
    hiddenId = null 
}) {
    // 1. Get DOM Elements based on Convention
    const container = document.getElementById(`${prefix}SearchContainer`);
    const input = document.getElementById(`${prefix}SearchInput`);
    const suggestionsBox = document.getElementById(`${prefix}Suggestions`);
    const selectedCard = document.getElementById(`${prefix}SelectedCard`);
    const hiddenInput = document.getElementById(hiddenId || `${prefix}Id`); // Default to existing naming convention

    if (!input || !suggestionsBox) return;

    // 2. Event: Input Typing
    input.addEventListener("input", function() {
        const query = this.value.toLowerCase().trim();
        
        // Hide if empty
        if (query.length === 0) {
            suggestionsBox.classList.add("hidden");
            return;
        }

        // Filter Data
        const matches = data.filter(item => {
            // Check if any of the searchKeys match the query
            return searchKeys.some(key => 
                String(item[key] || '').toLowerCase().includes(query)
            );
        });

        // Render Results
        suggestionsBox.innerHTML = "";
        if (matches.length === 0) {
            suggestionsBox.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">No results found</div>`;
        } else {
            matches.forEach(item => {
                const div = document.createElement("div");
                div.className = "flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 transition-colors";
                
                // Generic rendering of the dropdown item
                div.innerHTML = `
                    <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                        ${(item.name || '?').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-slate-700">${item.name}</div>
                        <div class="text-xs text-slate-400">${item.role || ''} • ${item.mobile || ''}</div>
                    </div>
                `;

                // CLICK HANDLER
                div.onclick = () => {
                    // A. Set Hidden ID
                    if (hiddenInput) hiddenInput.value = item.id;

                    // B. Toggle Standard UI (Hide Search, Show Card)
                    if (container) container.classList.add("hidden");
                    if (suggestionsBox) suggestionsBox.classList.add("hidden");
                    if (selectedCard) selectedCard.classList.remove("hidden");

                    // C. Run Your Custom Function
                    if (onSelect) onSelect(item);
                };

                suggestionsBox.appendChild(div);
            });
        }
        suggestionsBox.classList.remove("hidden");
    });

    // 3. Event: Click Outside (Close Dropdown)
    document.addEventListener("click", function(e) {
        if (!input.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.add("hidden");
        }
    });

    // 4. Attach Reset Logic to the Close Button inside the Selected Card
    // We assume the first <button> inside the card is the close button
    if (selectedCard) {
        const closeBtn = selectedCard.querySelector('button');
        if (closeBtn) {
            closeBtn.onclick = () => {
                // Reset UI
                if (container) container.classList.remove("hidden");
                if (selectedCard) selectedCard.classList.add("hidden");
                input.value = "";
                if (hiddenInput) hiddenInput.value = "";
                
                // Optional: You might want to hide the form here too, 
                // but that can be handled by a global reset or specific logic
                const form = document.getElementById(`${prefix}Form`);
                if(form) form.classList.add("hidden", "opacity-50", "pointer-events-none");
            };
        }
    }
};