// js/order.js

// CONFIG
const API_BASE_ORDER = "http://localhost:8080/api/v1";

// STATE
let orderState = {
  cart: [],
  products: [],
  editingIndex: null, // Track which item is being edited (null = adding new)
};

// --- INITIALIZATION ---
window.initOrderPage = async function () {
  console.log("Order Page Initializing...");
  const branchId = 1;

  try {
    const [productsRes, customersRes, employeesRes, accountsRes] =
      await Promise.all([
        fetch(`${API_BASE_ORDER}/products`, {
          headers: window.getAuthHeaders(),
        }),
        fetch(`${API_BASE_ORDER}/customers`, {
          headers: window.getAuthHeaders(),
        }),
        fetch(`${API_BASE_ORDER}/hr/employees?role=salesperson`, {
          headers: window.getAuthHeaders(),
        }),
        fetch(`${API_BASE_ORDER}/accounts`, {
          headers: window.getAuthHeaders(),
        }),
      ]);

    const productsData = await productsRes.json();
    orderState.products = productsData.products || [];

    // Populate Dropdowns
    renderProductOptions();

    populateSelect(
      "customerSelect",
      "Customer",
      (await customersRes.json()).customers || [],
      (c) => `${c.name} - ${c.mobile}`,
      "id"
    );

    populateSelect(
      "employeeSelect",
      "Employee",
      (await employeesRes.json()).employees || [],
      (e) => `${e.name} (${e.role})`,
      "id"
    );

    populateSelect(
      "accountSelect",
      "Account",
      (await accountsRes.json()).accounts || [],
      (a) => `${a.name} (${a.type})`,
      "id"
    );

    // Add Listener for Advance Input
    const advInput = document.getElementById("advanceInput");
    if (advInput) advInput.addEventListener("input", calculateDue);

    // Add Listener for Product Select to auto-fill price (Optional UX improvement)
    document.getElementById("productSelect").addEventListener("change", (e) => {
      const product = orderState.products.find((p) => p.id == e.target.value);
      if (product && orderState.editingIndex === null) {
        // Only auto-fill price if we are NOT in edit mode (or you can decide logic here)
        document.getElementById("priceInput").value = product.sell_price || 0;
      }
    });
  } catch (error) {
    console.error("Error loading order data:", error);
  }
};

// --- HELPER: Populate Select ---
function populateSelect(elementId, labelName, data, labelFn, valueKey) {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML = `<option value="" disabled selected>Select ${labelName}</option>`;
  if (!data || data.length === 0) {
    select.innerHTML = `<option value="" disabled selected>No ${labelName} Found</option>`;
  } else {
    data.forEach((item) => {
      select.innerHTML += `<option value="${item[valueKey]}">${labelFn(
        item
      )}</option>`;
    });
  }
}

window.renderProductOptions = function () {
    const select = document.getElementById("productSelect");
    const currentSelection = select.value; // Remember what was selected (if any)

    // 1. Identify which Product ID is currently being edited (if any)
    let editingProductId = null;
    if (orderState.editingIndex !== null && orderState.cart[orderState.editingIndex]) {
        editingProductId = orderState.cart[orderState.editingIndex].product_id;
    }

    // 2. Filter Products
    // Show product IF: (It is NOT in the cart) OR (It is the item currently being edited)
    const availableProducts = orderState.products.filter(p => {
        const isInCart = orderState.cart.some(item => item.product_id == p.id);
        
        // If it's the item we are editing, allow it to show so we can see the name/price
        if (p.id == editingProductId) return true;

        return !isInCart;
    });

    // 3. Generate HTML
    select.innerHTML = `<option value="" disabled selected>Select Product</option>`;
    
    if (availableProducts.length === 0) {
        select.innerHTML += `<option value="" disabled>All items in cart</option>`;
    } else {
        availableProducts.forEach((p) => {
            // Re-select the item if it was previously selected (helps when switching edit modes)
            const isSelected = p.id == currentSelection ? "selected" : "";
            select.innerHTML += `<option value="${p.id}" ${isSelected}>${p.product_name} (Stock: ${p.quantity})</option>`;
        });
    }
};

// --- CART LOGIC ---

window.handleAddToCart = function (e) {
  e.preventDefault();
  const pid = document.getElementById("productSelect").value;
  const qty = parseInt(document.getElementById("qtyInput").value);
  const price = parseFloat(document.getElementById("priceInput").value);

  // Validation
  if (!pid || !qty || isNaN(qty) || isNaN(price)) {
    showModalConfirm(
      "error",
      "Please fill all fields correctly",
      "",
      "Ok",
      () => {
        
      }
    );
    return;
  }

  // Find product details
  const product = orderState.products.find((p) => p.id == pid);
  const pName = product ? product.product_name : "Unknown Item";
  const lineTotal = qty * price; // Correct calculation

  // LOGIC: Check for Duplicates
  // We search if this product ID exists in the cart, BUT we ignore the index currently being edited
  const existingIndex = orderState.cart.findIndex(
    (item) => item.product_id == pid
  );

  // 1. If Adding New Item (editingIndex is null) AND Item exists
  if (orderState.editingIndex === null && existingIndex !== -1) {
    showModalConfirm(
      "error",
      "This product is already in the cart.",
      "",
      "Ok",
      () => {
        
      }
    );
    return;
  }

  // 2. If Updating Item (editingIndex is NOT null)
  if (orderState.editingIndex !== null) {
    // Update the existing row
    orderState.cart[orderState.editingIndex] = {
      product_id: pid,
      name: pName,
      qty: qty,
      price: price,
      total: lineTotal,
    };
    // Reset Edit State
    resetFormState();
  }
  // 3. Add New Item
  else {
    orderState.cart.push({
      product_id: pid,
      name: pName,
      qty: qty,
      price: price,
      total: lineTotal,
    });
    e.target.reset();
  }

  renderCart();
  // NEW: Update the dropdown to remove the used item
  renderProductOptions();
  // Reset form (unless editing, handled by your logic)
  if (orderState.editingIndex === null) {
      e.target.reset();
  }
};

// Start Editing an Item
window.editCartItem = function (index) {
  const item = orderState.cart[index];

  // Set Global State
  orderState.editingIndex = index;
renderProductOptions();
  // Populate Form
  const productSelect = document.getElementById("productSelect");
  productSelect.value = item.product_id;
  productSelect.disabled = true; // Lock product so they can't switch items while editing logic

  document.getElementById("qtyInput").value = item.qty;
  document.getElementById("priceInput").value = item.price;

  // Update Button Text
  const submitBtn = document.querySelector(
    "form[onsubmit='handleAddToCart(event)'] button"
  );
  submitBtn.innerHTML = `<i class="ph ph-check-circle font-bold"></i> Update`;
  submitBtn.classList.remove("bg-slate-900", "hover:bg-slate-800");
  submitBtn.classList.add("bg-brand-600", "hover:bg-brand-700");

  // Add a cancel button if it doesn't exist (Optional, for better UX)
  // For now, we rely on the user finishing the update.
};

// Helper to reset form back to "Add" mode
function resetFormState() {
  orderState.editingIndex = null;

  // Reset Form Fields
  document.getElementById("productSelect").disabled = false;
  document.getElementById("productSelect").value = "";
  document.getElementById("qtyInput").value = "";
  document.getElementById("priceInput").value = "";

  // Reset Button Styles
  const submitBtn = document.querySelector(
    "form[onsubmit='handleAddToCart(event)'] button"
  );
  submitBtn.innerHTML = `<i class="ph ph-plus font-bold"></i> Add`;
  submitBtn.classList.remove("bg-brand-600", "hover:bg-brand-700");
  submitBtn.classList.add("bg-slate-900", "hover:bg-slate-800");
  renderProductOptions();
}

window.renderCart = function () {
  const tbody = document.getElementById("cartTableBody");
  tbody.innerHTML = "";
  let grandTotal = 0;

  orderState.cart.forEach((item, index) => {
    grandTotal += item.total;

    // Highlight the row being edited
    const isEditing = orderState.editingIndex === index;
    const rowClass = isEditing
      ? "bg-brand-50 border-brand-200"
      : "border-slate-100 hover:bg-slate-50";

    tbody.innerHTML += `
            <tr class="border-b transition-colors ${rowClass}">
                <td class="px-4 py-3 font-medium text-slate-700">${
                  item.name
                }</td>
                <td class="px-4 py-3 text-center text-slate-600">${
                  item.qty
                }</td>
                <td class="px-4 py-3 text-right text-slate-600">${item.price.toFixed(
                  2
                )}</td>
                <td class="px-4 py-3 text-right font-bold text-slate-800">${item.total.toFixed(
                  2
                )}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex justify-center items-center gap-2">
                        <button onclick="editCartItem(${index})" 
                            class="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-100 transition-colors" title="Edit">
                            <i class="ph ph-pencil-simple text-lg"></i>
                        </button>
                        <button onclick="removeCartItem(${index})" 
                            class="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remove">
                            <i class="ph ph-trash text-lg"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
  });

  document.getElementById("cartTotalDisplay").textContent =
    grandTotal.toFixed(2);

  // Update Badge
  const badge = document.getElementById("totalItemsBadge");
  if (badge) badge.innerText = `${orderState.cart.length} Items`;

  calculateDue();
};

window.removeCartItem = function (index) {
  // If user deletes the item currently being edited, reset form
  if (orderState.editingIndex === index) {
    resetFormState();
  }
  // If user deletes an item BEFORE the one being edited, adjust the index
  else if (
    orderState.editingIndex !== null &&
    index < orderState.editingIndex
  ) {
    orderState.editingIndex--;
  }

  orderState.cart.splice(index, 1);
  renderCart();
  renderProductOptions();
};

window.calculateDue = function () {
  const total = orderState.cart.reduce((a, b) => a + b.total, 0);
  const advance =
    parseFloat(document.getElementById("advanceInput").value) || 0;

  const due = total - advance;
  const dueDisplay = document.getElementById("dueAmountDisplay");

  dueDisplay.textContent = due.toFixed(2);

  // Visual cue if negative
  if (due < 0) {
    dueDisplay.classList.remove("text-red-600");
    dueDisplay.classList.add("text-emerald-600"); // Surplus
  } else {
    dueDisplay.classList.remove("text-emerald-600");
    dueDisplay.classList.add("text-red-600");
  }
};

// --- SUBMIT LOGIC ---
window.submitOrderToDB = async function () {
  if (orderState.cart.length === 0) return alert("Cart empty");

  // Basic validation
  const customerId = document.getElementById("customerSelect").value;
  const salespersonId = document.getElementById("employeeSelect").value;

  // Get Raw Date Strings directly from HTML
  // These will be in "YYYY-MM-DD" format (e.g., "2023-10-25")
  const rawOrderDate = document.getElementById("orderDate").value;
  const rawDeliveryDate = document.getElementById("deliveryDate").value;

  if (!customerId) return showNotification("error", "Please select a customer");
  if (!salespersonId)
    return showNotification("error", "Please select a salesperson");
  if (!rawOrderDate)
    return showNotification("error", "Please select an order Date");
  if (!rawDeliveryDate)
    return showNotification("error", "Please select an delivery Date");

  const payload = {
    branch_id: 1,
    memo_no: "",
    customer_id: customerId,
    salesperson_id: salespersonId,
    payment_account_id: document.getElementById("accountSelect").value,

    // --- THE FIX: Send Plain Strings ---
    // If value exists, send "2023-10-25", otherwise send null
    order_date: rawOrderDate || null,
    delivery_date: rawDeliveryDate || null,

    advance_amount:
      parseFloat(document.getElementById("advanceInput").value) || 0,
    notes: document.getElementById("orderNotes").value,
    items: orderState.cart,
  };

  console.log(
    "Sending Plain Text Dates:",
    payload.order_date,
    payload.delivery_date
  );

  try {
    const res = await fetch(`${window.globalState.apiBase}/orders/new`, {
      method: "POST",
      headers: window.getAuthHeaders(), // Content-Type is usually application/json here
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      showNotification("success", "Order Confirmed!");
      // Reset logic...
      orderState.cart = [];
      renderCart();
      document.getElementById("orderForm").reset();
      document.getElementById("advanceInput").value = 0;
      // Reset Dates to Today (as plain string)
      document.getElementById("orderDate").value = new Date()
        .toISOString()
        .split("T")[0];
      calculateDue();
    } else {
      showNotification(
        "error",
        "Error: " + (data.message || "Could not save order")
      );
    }
  } catch (e) {
    console.error(e);
    showNotification("error", "Network Error");
  }
};
