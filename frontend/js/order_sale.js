// js/order.js

// STATE
let orderState = {
  cart: [],
  products: [],
  editingIndex: null, // Track which item is being edited (null = adding new)
  isOrderState: true, // NEW: true = Order (default), false = Sale
  orderId: null, // NEW: Tracks the ID of the order/sale being edited. null = New Entry
};

// --- INITIALIZATION (UPDATED) ---
window.initOrderSalePage = async function () {
  console.log("Order Page Initializing...");

  try {
    // Load ALL necessary static data (products, customers, employees, accounts)
    const [productsRes, customersRes, employeesRes, accountsRes] =
      await Promise.all([
        fetch(`${window.globalState.apiBase}/products`, {
          headers: window.getAuthHeaders(),
        }),
        fetch(`${window.globalState.apiBase}/customers`, {
          headers: window.getAuthHeaders(),
        }),
        fetch(`${window.globalState.apiBase}/hr/employees?role=salesperson`, {
          headers: window.getAuthHeaders(),
        }),
        fetch(`${window.globalState.apiBase}/accounts`, {
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
        document.getElementById("priceInput").value = product.sell_price || 0;
      }
    });

    // ----------------------------------------------------
    // --- NEW EDITING/CREATION LOGIC ---
    // 1. Check for an order ID in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const existingOrderId = urlParams.get("orderId");

    if (existingOrderId) {
      orderState.orderId = existingOrderId;
      await loadOrderForEdit(existingOrderId); // Load data if ID exists
      // Update the page title (assuming you have one)
      const pageTitle = document.getElementById("pageTitle");
      if (pageTitle) pageTitle.textContent = "Edit Transaction";
    } else {
      // Default behavior for new entry
      orderState.orderId = null;
      setTodayDates();
    }
    // ----------------------------------------------------

    // --- Toggle Listener and Initialization ---
    const stateToggle = document.getElementById("stateToggle");
    if (stateToggle) {
      stateToggle.checked = orderState.isOrderState; // Set initial state (or loaded state)
      stateToggle.addEventListener("change", updateOrderState);
      updateOrderState(); // Call initially to set correct UI
      // Disable toggle if editing
      if (orderState.orderId) stateToggle.disabled = true;
    }
  } catch (error) {
    console.error("Error loading order data:", error);
    showNotification("error", "Error loading initial data.");
  }
};

// --- NEW: Load Existing Order/Sale Data ---
window.loadOrderForEdit = async function (orderId) {
  try {
    const res = await fetch(
      `${window.globalState.apiBase}/products/orders/${orderId}`,
      {
        headers: window.getAuthHeaders(),
      }
    );

    if (!res.ok) {
      if (res.status === 401) return signout();
      throw new Error("Failed to fetch order details");
    }

    const orderData = await res.json();

    // 1. Map API data to orderState.cart
    orderState.cart = (orderData.items || []).map((item) => {
      // Find product name using the previously loaded list
      const product = orderState.products.find((p) => p.id == item.product_id);

      return {
        product_id: item.product_id,
        name: product ? product.product_name : `ID: ${item.product_id}`,
        qty: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
      };
    });

    // 2. Determine Transaction Type (Sale or Order) and Update State
    const isOrder = orderData.type === "ORDER";
    orderState.isOrderState = isOrder;

    // Set the toggle switch state
    const stateToggle = document.getElementById("stateToggle");
    if (stateToggle) {
      stateToggle.checked = isOrder;
      stateToggle.disabled = true;
    }

    // 3. Populate Main Form Fields
    document.getElementById("customerSelect").value =
      orderData.customer_id || "";
    document.getElementById("employeeSelect").value =
      orderData.salesperson_id || "";
    document.getElementById("memoNo").value = orderData.memo_no || "";
    document.getElementById("accountSelect").value =
      orderData.payment_account_id || "";
    document.getElementById("advanceInput").value =
      orderData.advance_amount || 0;
    document.getElementById("orderNotes").value = orderData.notes || "";

    // 4. Populate Dates (ensure dates are in YYYY-MM-DD format, hence split)
    if (isOrder) {
      document.getElementById("orderDate").value = orderData.order_date
        ? orderData.order_date.split("T")[0]
        : "";
      document.getElementById("deliveryDate").value = orderData.delivery_date
        ? orderData.delivery_date.split("T")[0]
        : "";
    } else {
      document.getElementById("saleDate").value = orderData.sale_date
        ? orderData.sale_date.split("T")[0]
        : "";
    }

    // 5. Update UI
    renderCart();
    updateOrderState(); // Refresh UI labels and button text
    showNotification(
      "info",
      `${orderData.type} #${orderId} loaded for editing.`
    );
  } catch (error) {
    console.error("Error loading order for edit:", error);
    showNotification(
      "error",
      "Could not load transaction data. Starting new entry mode."
    );
    orderState.orderId = null; // Revert to create mode if load fails
    const stateToggle = document.getElementById("stateToggle");
    if (stateToggle) stateToggle.disabled = false;
    setTodayDates();
  }
};

// --- Toggle Logic (UPDATED Button Text Logic) ---
window.updateOrderState = function () {
  const stateToggle = document.getElementById("stateToggle");
  const saleDateGroup = document.getElementById("saleDateGroup");
  const orderDateGroup = document.getElementById("orderDateGroup");
  const paymentLabel = document.getElementById("paymentLabel");
  const stateSaleLabel = document.getElementById("stateSaleLabel");
  const stateOrderLabel = document.getElementById("stateOrderLabel");
  const confirmButton = document.querySelector(".bg-emerald-600");

  // Toggle logic: checked=Order, unchecked=Sale
  orderState.isOrderState = stateToggle.checked;

  // Determine the base action text
  const actionText = orderState.orderId ? "Update" : "Confirm";

  if (orderState.isOrderState) {
    // --- Order State (Toggle is CHECKED) ---
    orderDateGroup.classList.remove("hidden");
    saleDateGroup.classList.add("hidden");
    paymentLabel.innerHTML =
      'Advance Payment <span class="text-red-500">*</span>';
    stateSaleLabel.classList.remove("font-bold", "text-slate-900");
    stateSaleLabel.classList.add("text-slate-500");
    stateOrderLabel.classList.add("font-bold", "text-slate-900");
    stateOrderLabel.classList.remove("text-slate-500");
    confirmButton.querySelector("span").textContent = `${actionText} Order`;
    document.getElementById("pageTitle").textContent = "New Order Entry";
  } else {
    // --- Sale State (Toggle is UNCHECKED) ---
    saleDateGroup.classList.remove("hidden");
    orderDateGroup.classList.add("hidden");
    paymentLabel.innerHTML = 'Paid Amount <span class="text-red-500">*</span>';
    stateSaleLabel.classList.add("font-bold", "text-slate-900");
    stateSaleLabel.classList.remove("text-slate-500");
    stateOrderLabel.classList.remove("font-bold", "text-slate-900");
    stateOrderLabel.classList.add("text-slate-500");
    confirmButton.querySelector("span").textContent = `${actionText} Sale`;
    // Don't call setTodayDates if editing, as loadOrderForEdit already set the date.
    if (!orderState.orderId) setTodayDates();
    document.getElementById("pageTitle").textContent = "Sale Products";
  }

  // Recalculate due amount whenever the state changes
  calculateDue();
};

// Helper function to set today's date on all date inputs (No Change)
function setTodayDates() {
  const today = new Date();
  const dateString = today.toISOString().split("T")[0];

  const saleDateInput = document.getElementById("saleDate");
  const orderDateInput = document.getElementById("orderDate");
  const deliveryDateInput = document.getElementById("deliveryDate");

  if (saleDateInput) saleDateInput.value = dateString;
  if (orderDateInput) orderDateInput.value = dateString;
  // Optionally set delivery date to a future date or leave blank/set today
  if (deliveryDateInput) deliveryDateInput.value = dateString;
}

// --- HELPER: Populate Select (No Change) ---
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

// --- Render Product Options (No Change) ---
window.renderProductOptions = function () {
  const select = document.getElementById("productSelect");
  const currentSelection = select.value; // Remember what was selected (if any)

  // 1. Identify which Product ID is currently being edited (if any)
  let editingProductId = null;
  if (
    orderState.editingIndex !== null &&
    orderState.cart[orderState.editingIndex]
  ) {
    editingProductId = orderState.cart[orderState.editingIndex].product_id;
  }

  // 2. Filter Products
  // Show product IF: (It is NOT in the cart) OR (It is the item currently being edited)
  const availableProducts = orderState.products.filter((p) => {
    const isInCart = orderState.cart.some((item) => item.product_id == p.id);

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

// --- CART LOGIC (No Change) ---
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
      () => {}
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
      () => {}
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

// Start Editing an Item (No Change)
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

// Helper to reset form back to "Add" mode (No Change)
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

// Render Cart (No Change)
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
    <td class="px-4 py-3 font-medium text-slate-700">${item.name}</td>
    <td class="px-4 py-3 text-center text-slate-600">${item.qty}</td>
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

// Remove Cart Item (No Change)
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

// Calculate Due (No Change)
window.calculateDue = function () {
  const total = orderState.cart.reduce((a, b) => a + b.total, 0);
  const advance =
    parseFloat(document.getElementById("advanceInput").value) || 0;

  const due = total - advance;
  const dueDisplay = document.getElementById("dueAmountDisplay");

  dueDisplay.textContent = due.toFixed(2);

  // Visual cue if negative
  if (due == 0) {
    dueDisplay.classList.remove("text-red-600");
    dueDisplay.classList.add("text-emerald-600"); // full payment
    dueDisplay.classList.remove("text-purple-600");
  } else if (due < 0) {
    dueDisplay.classList.remove("text-red-600");
    dueDisplay.classList.remove("text-emerald-600");
    dueDisplay.classList.add("text-purple-600"); // Surplus
  } else {
    dueDisplay.classList.add("text-red-600"); // partial payment
    dueDisplay.classList.remove("text-emerald-600");
    dueDisplay.classList.remove("text-purple-600");
  }
};

window.submitData = async function () {
  try {
    if (orderState.isOrderState) {
      await submitOrderToDB();
    } else {
      await submitSaleToDB();
    }
  } catch (err) {
    console.error("Error submitting data:", err);
    showNotification("error", "Failed to submit data");
  }
};

// --- SUBMIT LOGIC (UPDATED FOR EDIT/PUT, ORDER vs SALE) ---
window.submitOrderToDB = async function () {
  console.log("submitting the order");
  if (orderState.cart.length === 0) return showNotification("error", "No product selected");

  const customerId = document.getElementById("customerSelect").value;
  const salespersonId = document.getElementById("employeeSelect").value;
  const paymentAccountId = document.getElementById("accountSelect").value;
  const memoNo = document.getElementById("memoNo").value;
  const advanceAmount =
    parseFloat(document.getElementById("advanceInput").value) || 0;
  const isEditing = orderState.orderId !== null;

  if (!customerId) return showNotification("error", "Please select a customer");
  if (!salespersonId)
    return showNotification("error", "Please select a salesperson");
  if (!paymentAccountId)
    return showNotification("error", "Please select a payment account");
  if (!memoNo) return showNotification("error", "Please enter a Memo No.");

  // --- Dates ---
  const rawOrderDate = document.getElementById("orderDate").value;
  const rawDeliveryDate = document.getElementById("deliveryDate").value;
  if (!rawOrderDate)
    return showNotification("error", "Please select an Order Date");
  if (!rawDeliveryDate)
    return showNotification("error", "Please select a Delivery Date");

  const orderDate = new Date(rawOrderDate);
  const deliveryDate = new Date(rawDeliveryDate);

  // --- Calculate totals ---
  let totalAmount = 0;
  orderState.cart.forEach((item) => {
    totalAmount += parseFloat(item.price) * parseInt(item.qty);
  });
  const receivedAmount = advanceAmount;

  // --- Prepare payload matching OrderDB & OrderItemDB ---
  const payload = {
    ...(isEditing && { id: orderState.orderId }),
    branch_id: window.globalState.user.branch_id,
    memo_no: memoNo,
    order_date: orderDate,
    delivery_date: deliveryDate,
    salesperson_id: parseInt(salespersonId),
    customer_id: parseInt(customerId),
    total_amount: totalAmount,
    payment_account_id: parseInt(paymentAccountId),
    received_amount: receivedAmount,
    status: "pending",
    notes: document.getElementById("orderNotes").value || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: orderState.cart.map((item) => ({
      product_id: parseInt(item.product_id),
      quantity: parseInt(item.qty),
      subtotal: parseFloat(item.price) * parseInt(item.qty),
    })),
  };

  const url = isEditing
    ? `${window.globalState.apiBase}/products/orders/${orderState.orderId}`
    : `${window.globalState.apiBase}/products/orders/new`;
  const method = isEditing ? "PUT" : "POST";
  const action = isEditing ? "Updated" : "Confirmed";

  console.log(`${method} ORDER Payload:`, payload);

 try {
    const res = await fetch(url, {
      method: method,
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    // This is the OUTER 'data' variable
    const data = await res.json(); 

    if (res.ok) {
      showModalConfirm(
        "success",
        "Order Recorded",
        `Order ${action} successfully!`,
        "Print Invoice",
        async () => {
          // Use outer 'data' here safely
          const response = await fetch(
            `${window.globalState.apiBase}/products/orders/${data.order_id}`
          );
          
          // FIX: Rename this to 'orderData' to avoid conflict
          const orderData = await response.json(); 
          
          if (orderData.error) throw new Error(orderData.error);
          
          const order = orderData.order;
          // Ensure your printInvoice function matches the one we created earlier
          // If you named it printOrderInvoice in previous steps, change this to printOrderInvoice(order)
          // or ensure you have: window.printInvoice = window.printOrderInvoice;
          await printOrderInvoice(order.id, order); 
        },
        "Cancel" // Fixed syntax here (removed 'cancelText =')
      );
      
      if (!isEditing) {
        orderState.cart = [];
        renderCart();
        document.getElementById("orderForm").reset();
        document.getElementById("advanceInput").value = 0;
        setTodayDates();
        calculateDue();
      }
    } else if (res.status === 401) {
      signout();
    } else {
      showNotification(
        "error",
        "Error: " + (data.message || "Could not save Order")
      );
    }
  } catch (e) {
    console.error(e);
    showNotification("error", "Network Error");
  }
};

window.submitSaleToDB = async function () {
  console.log("submitting the sale");
  if (orderState.cart.length === 0) return showNotification("error", "No product selected");

  const customerId = document.getElementById("customerSelect").value;
  const salespersonId = document.getElementById("employeeSelect").value;
  const paymentAccountId = document.getElementById("accountSelect").value;
  const memoNo = document.getElementById("memoNo").value;
  const advanceAmount =
    parseFloat(document.getElementById("advanceInput").value) || 0;
  const isEditing = orderState.saleId !== null; // separate state for editing sales

  if (!customerId) return showNotification("error", "Please select a customer");
  if (!salespersonId)
    return showNotification("error", "Please select a salesperson");
  if (!paymentAccountId)
    return showNotification("error", "Please select a payment account");
  if (!memoNo) return showNotification("error", "Please enter a Memo No.");

  // --- Sale Date ---
  const rawSaleDate = document.getElementById("saleDate").value;
  if (!rawSaleDate)
    return showNotification("error", "Please select a Sale Date");
  const saleDate = new Date(rawSaleDate);

  // --- Calculate totals ---
  let totalAmount = 0;
  orderState.cart.forEach((item) => {
    totalAmount += parseFloat(item.price) * parseInt(item.qty);
  });
  const receivedAmount = advanceAmount;

  // --- Prepare payload matching SaleDB & OrderItemDB ---
  const payload = {
    ...(isEditing && { id: orderState.saleId }),
    branch_id: window.globalState.user.branch_id,
    memo_no: memoNo,
    sale_date: saleDate.toISOString(),
    salesperson_id: parseInt(salespersonId),
    customer_id: parseInt(customerId),
    total_amount: totalAmount,
    payment_account_id: parseInt(paymentAccountId),
    received_amount: receivedAmount,
    status: "completed", // or pending if you prefer
    notes: document.getElementById("orderNotes").value || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: orderState.cart.map((item) => ({
      product_id: parseInt(item.product_id),
      quantity: parseInt(item.qty),
      subtotal: parseFloat(item.price) * parseInt(item.qty),
    })),
  };

  const url = isEditing
    ? `${window.globalState.apiBase}/products/sales/${orderState.saleId}`
    : `${window.globalState.apiBase}/products/sales/new`;
  const method = isEditing ? "PUT" : "POST";
  const action = isEditing ? "Updated" : "Confirmed";

  console.log(`${method} SALE Payload:`, payload);

  try {
    const res = await fetch(url, {
      method: method,
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      showNotification("success", `Sale ${action} successfully!`);
      if (!isEditing) {
        orderState.cart = [];
        renderCart();
        document.getElementById("orderForm").reset();
        document.getElementById("advanceInput").value = 0;
        setTodayDates();
        calculateDue();
      }
    } else if (res.status === 401) {
      signout();
    } else {
      showNotification(
        "error",
        "Error: " + (data.message || "Could not save Sale")
      );
    }
  } catch (e) {
    console.error(e);
    showNotification("error", "Network Error");
  }
};
