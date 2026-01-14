// js/restock_product.js

// --- STATE MANAGEMENT ---
window.restockState = window.restockState || {
  cart: [],         
  products: [],     
  editingIndex: null
};

window.resetRestockState = () => {
  window.restockState.cart = [];
  window.restockState.products = [];
  window.restockState.editingIndex = null;
};

// --- INITIALIZATION ---
window.initRestockProductsPage = async function () {
  console.log("Restock Page Initializing...");
  resetRestockState();

  try {
    // 1. Load Products
    const productsRes = await fetch(`${window.globalState.apiBase}/products`, {
      headers: window.getAuthHeaders(),
    });

    if (!productsRes.ok) throw new Error("Failed to fetch products");

    const productsData = await productsRes.json();
    restockState.products = productsData.products || [];

    // 2. Set Default Date to Today (Targeting the input in the toolbar now)
    const stockDateInput = document.getElementById("stockDate");
    if (stockDateInput) {
      stockDateInput.value = new Date().toISOString().split("T")[0];
    }

    // 3. Render Dropdown
    renderRestockProductOptions();

  } catch (error) {
    console.error("Error loading restock data:", error);
    if(window.showNotification) showNotification("error", "Error loading product data.");
  }
};

// --- RENDER PRODUCT DROPDOWN ---
window.renderRestockProductOptions = function () {
  const select = document.getElementById("productSelect");
  if (!select) return;

  const currentSelection = select.value; 

  let editingProductId = null;
  if (restockState.editingIndex !== null && restockState.cart[restockState.editingIndex]) {
    editingProductId = restockState.cart[restockState.editingIndex].product_id;
  }

  const availableProducts = restockState.products.filter((p) => {
    const isInCart = restockState.cart.some((item) => item.product_id == p.id);
    if (p.id == editingProductId) return true;
    return !isInCart;
  });

  select.innerHTML = `<option value="" disabled selected>Select Product</option>`;

  if (availableProducts.length === 0) {
    select.innerHTML += `<option value="" disabled>All items added</option>`;
  } else {
    availableProducts.forEach((p) => {
      const isSelected = p.id == currentSelection ? "selected" : "";
      select.innerHTML += `<option value="${p.id}" ${isSelected}>${p.product_name} [${p.current_stock_level}]</option>`;
    });
  }
};

// --- ADD/UPDATE ITEM ---
window.handleAddToStockList = function (e) {
  e.preventDefault();

  const pid = document.getElementById("productSelect").value;
  const qtyInput = document.getElementById("qtyInput");
  const qty = parseInt(qtyInput.value);

  if (!pid || !qty || isNaN(qty) || qty < 1) {
    alert("Please select a product and enter a valid quantity.");
    return;
  }

  const product = restockState.products.find((p) => p.id == pid);
  const pName = product ? product.product_name : "Unknown Item";

  if (restockState.editingIndex !== null) {
    restockState.cart[restockState.editingIndex] = {
      product_id: pid,
      name: pName,
      qty: qty
    };
    resetRestockFormState();
  } else {
    restockState.cart.push({
      product_id: pid,
      name: pName,
      qty: qty
    });
    // Reset inputs but KEEP the date
    document.getElementById("productSelect").value = "";
    document.getElementById("qtyInput").value = "";
  }

  renderStockList();
  renderRestockProductOptions();
};

// --- RENDER TABLE ---
window.renderStockList = function () {
  const tbody = document.getElementById("stockTableBody");
  tbody.innerHTML = "";

  restockState.cart.forEach((item, index) => {
    const isEditing = restockState.editingIndex === index;
    const rowClass = isEditing ? "bg-brand-50 border-brand-200" : "border-slate-100 hover:bg-slate-50";

    tbody.innerHTML += `
    <tr class="border-b transition-colors ${rowClass}">
      <td class="px-6 py-3 font-medium text-slate-700 w-full">${item.name}</td>
      <td class="px-6 py-3 text-center text-slate-900 font-bold bg-slate-50/50">${item.qty}</td>
      <td class="px-6 py-3 text-center">
        <div class="flex justify-center items-center gap-2">
          <button onclick="editStockItem(${index})" type="button"
            class="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-100 transition-colors">
            <i class="ph ph-pencil-simple text-lg"></i>
          </button>
          <button onclick="removeStockItem(${index})" type="button"
            class="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <i class="ph ph-trash text-lg"></i>
          </button>
        </div>
      </td>
    </tr>`;
  });

  const badge = document.getElementById("totalItemsBadge");
  if (badge) badge.innerText = `${restockState.cart.length} Items`;
};

// --- EDIT ITEM ---
window.editStockItem = function (index) {
  const item = restockState.cart[index];
  restockState.editingIndex = index;
  
  renderRestockProductOptions();

  document.getElementById("productSelect").value = item.product_id;
  document.getElementById("qtyInput").value = item.qty;

  const submitBtn = document.querySelector("form[onsubmit='handleAddToStockList(event)'] button");
  submitBtn.innerHTML = `<i class="ph ph-check-circle font-bold"></i>`;
  submitBtn.classList.replace("bg-slate-900", "bg-brand-600");
  submitBtn.classList.replace("hover:bg-slate-800", "hover:bg-brand-700");
};

// --- REMOVE ITEM ---
window.removeStockItem = function (index) {
  if (restockState.editingIndex === index) {
    resetRestockFormState();
  } else if (restockState.editingIndex !== null && index < restockState.editingIndex) {
    restockState.editingIndex--;
  }

  restockState.cart.splice(index, 1);
  renderStockList();
  renderRestockProductOptions();
};

// --- RESET FORM ---
function resetRestockFormState() {
  restockState.editingIndex = null;
  document.getElementById("productSelect").value = "";
  document.getElementById("qtyInput").value = "";

  const submitBtn = document.querySelector("form[onsubmit='handleAddToStockList(event)'] button");
  submitBtn.innerHTML = `<i class="ph ph-plus font-bold"></i> <span>Add</span>`;
  submitBtn.classList.replace("bg-brand-600", "bg-slate-900");
  submitBtn.classList.replace("hover:bg-brand-700", "hover:bg-slate-800");

  renderRestockProductOptions();
}

// --- SUBMIT ---
window.submitRestock = async function () {
  
  if (restockState.cart.length === 0) {
    if(window.showNotification) showNotification("error", "Please add at least one product.");
    else alert("Please add at least one product.");
    return;
  }

  const stockDateVal = document.getElementById("stockDate").value; // e.g., "2026-01-14"
  
  if (!stockDateVal) {
    alert("Please select a Stock Date.");
    return;
  }

  // --- FIX START ---
  // We do NOT use new Date() or toISOString() because they shift the timezone.
  // Instead, we take the string exactly as is and append a dummy time.
  // This satisfies Go's time.Time requirement while keeping the date exactly as you picked.
  const fixedDate = `${stockDateVal}T00:00:00Z`; 
  // Result: "2026-01-14T00:00:00Z"
  // --- FIX END ---

  // Generate a generic MemoNo 
  const generatedMemo = `STK-${Date.now()}`; 

  const payload = {
    date: fixedDate,         // Sends "2026-01-14T00:00:00Z"
    memo_no: generatedMemo,
    products: restockState.cart.map(item => ({
      id: parseInt(item.product_id),
      quantity: parseInt(item.qty),
    }))
  };

  const submitBtn = document.querySelector("button[onclick='submitRestock()']");
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Processing...</span>`;

  try {
    const response = await fetch(`${window.globalState.apiBase}/products/stock/add`, {
      method: 'POST',
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to add stock.");
    }

    if(window.showNotification) showNotification("success", "Stock updated successfully!");
    else alert("Stock updated successfully!");

    // Reset Page
    restockState.cart = [];
    renderStockList();
    document.getElementById("qtyInput").value = "";
    document.getElementById("productSelect").value = "";
    
    // Refresh products
    window.initRestockProductsPage(); 

  } catch (error) {
    console.error("Submit Error:", error);
    if(window.showNotification) showNotification("error", error.message);
    else alert(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
};