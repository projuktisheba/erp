// js/order.js

// STATE
window.orderState = window.orderState || {
  cart: [],
  products: [],
  editingIndex: null, // Track which item is being edited (null = adding new)
  isOrderState: true, // true = Order (default), false = Sale
  orderId: null, // Tracks the ID of the order/sale being edited. null = New Entry
  saleId: null, // Track sale ID separately if needed
};

window.resetOrderState = () => {
  window.orderState.cart = [];
  window.orderState.products = [];
  window.orderState.editingIndex = null;
  window.orderState.isOrderState = true;
  window.orderState.orderId = null;
  window.orderState.saleId = null;
};

// --- INITIALIZATION ---
window.initOrderSalePage = async function () {
    //Reset order state
  resetOrderState();
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
    // const urlParams = new URLSearchParams(window.location.search);
    // const existingOrderId = urlParams.get("orderId");
    const existingOrderId = localStorage.getItem("orderID");
    localStorage.removeItem("orderID");

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

    // --- SALE EDIT DETECTION ---
    const existingSaleId = localStorage.getItem("saleID");
    localStorage.removeItem("saleID");

    if (existingSaleId) {
      orderState.saleId = existingSaleId;
      orderState.isOrderState = false;

      await loadSaleForEdit(existingSaleId);

      const pageTitle = document.getElementById("pageTitle");
      if (pageTitle) pageTitle.textContent = "Edit Sale";
    }

    // --- Toggle Listener and Initialization ---
    const stateToggleContainer = document.getElementById("stateToggleContainer");
    const stateToggle = document.getElementById("stateToggle");
    if (stateToggle) {
      stateToggle.checked = orderState.isOrderState; // Set initial state (or loaded state)
      stateToggle.addEventListener("change", () => {
        updateOrderState();
        renderProductOptions();
      });
      updateOrderState(); // Call initially to set correct UI
      // Disable toggle if editing
      if (orderState.orderId || orderState.saleId) stateToggle.disabled = true;
      if (orderState.orderId || orderState.saleId) {
        stateToggleContainer.classList.add("bg-slate-100")
      } else {
        stateToggleContainer.classList.remove("bg-slate-100")

      }
    }

    renderProductOptions();
  } catch (error) {
    console.error("Error loading order data:", error);
    showNotification("error", "Error loading initial data.");
  }
};

// --- LOAD EXISTING DATA (UPDATED MAPPING) ---
window.loadOrderForEdit = async function (orderId) {
  try {
    const res = await fetch(
      `${window.globalState.apiBase}/products/orders/${orderId}`,
      {
        headers: window.getAuthHeaders(),
      }
    );

    if (!res.ok) throw new Error("Failed to fetch order details");

    const data = await res.json();
    const order = data.order; // Access the 'order' object from response

    // 1. Map Items to Cart
    window.orderState.cart = (order.items || []).map((item) => {
      // API returns item.product_name, so we can use that directly
      // OR find it in our products list to be safe
      const product = window.orderState.products.find(
        (p) => p.id == item.product_id
      );

      return {
        product_id: item.product_id,
        name:
          item.product_name ||
          (product ? product.product_name : `Item #${item.product_id}`),
        qty: item.quantity,
        price: item.subtotal / item.quantity, // Derived unit price
        total: item.subtotal,
      };
    });

    // 2. Set State Type
    // Assuming your API distinguishes types, or we infer it.
    // If this endpoint only returns "orders", we force order state.
    const isOrder = true; // Since we fetched from /products/orders/
    window.orderState.isOrderState = isOrder;

    const stateToggle = document.getElementById("stateToggle");
    if (stateToggle) {
      stateToggle.checked = isOrder;
      stateToggle.disabled = true;
    }

    // 3. Populate Form Fields
    // Use IDs from the response objects
    if (document.getElementById("customerSelect")) {
      document.getElementById("customerSelect").value =
        order.customer_id || (order.customer ? order.customer.id : "");
    }
    if (document.getElementById("employeeSelect")) {
      document.getElementById("employeeSelect").value =
        order.salesperson_id || (order.salesperson ? order.salesperson.id : "");
    }
    if (document.getElementById("accountSelect")) {
      document.getElementById("accountSelect").value = String(
        order.order_transactions?.[0]?.payment_account_id || ""
      );
    }

    document.getElementById("memoNo").value = order.memo_no || "";
    document.getElementById("advanceInput").value = order.received_amount || 0;
    document.getElementById("orderNotes").value = order.notes || "";

    // 4. Populate Dates
    const formatDate = (dateStr) => (dateStr ? dateStr.split("T")[0] : "");

    document.getElementById("orderDate").value = formatDate(order.order_date);
    document.getElementById("deliveryDate").value = formatDate(
      order.delivery_date
    );

    // 5. Update UI
    renderCart();
    updateOrderState();
    showNotification("info", `Order #${order.memo_no} loaded.`);
  } catch (error) {
    console.error("Error loading order:", error);
    showNotification("error", "Could not load data.");
  }
};
window.loadSaleForEdit = async function (saleId) {
  try {
    const res = await fetch(
      `${window.globalState.apiBase}/products/sales/details/${saleId}`,
      { headers: window.getAuthHeaders() }
    );

    if (!res.ok) throw new Error("Failed to fetch sale");

    const data = await res.json();
    const sale = data.sale;

    // --- CART MAPPING ---
    orderState.cart = (sale.items || []).map((item) => {
      const product = orderState.products.find(
        (p) => p.id == item.product_id
      );

      return {
        product_id: item.product_id,
        name:
          item.product_name ||
          (product ? product.product_name : `Item #${item.product_id}`),
        qty: item.quantity,
        price: item.subtotal / item.quantity,
        total: item.subtotal,
      };
    });

    // --- FORCE SALE MODE ---
    orderState.isOrderState = false;

    const stateToggle = document.getElementById("stateToggle");
    if (stateToggle) {
      stateToggle.checked = false;
      stateToggle.disabled = true;
    }

    // --- FORM FIELDS ---
    document.getElementById("customerSelect").value = sale.customer_id;
    document.getElementById("employeeSelect").value = sale.salesperson_id;
    if (document.getElementById("accountSelect")) {
      document.getElementById("accountSelect").value = String(
        sale.sale_transactions?.[0]?.payment_account_id || ""
      );
    }

    document.getElementById("memoNo").value = sale.memo_no;
    document.getElementById("advanceInput").value = sale.received_amount || 0;
    document.getElementById("orderNotes").value = sale.notes || "";

    // --- SALE DATE ---
    document.getElementById("saleDate").value =
      sale.sale_date?.split("T")[0] || "";

    // --- UI UPDATE ---
    renderCart();
    updateOrderState();

    showNotification("info", `Sale #${sale.memo_no} loaded`);
  } catch (error) {
    console.error(error);
    showNotification("error", "Failed to load sale");
  }
};

// --- TOGGLE UI STATE ---
window.updateOrderState = function () {
  const stateToggle = document.getElementById("stateToggle");
  const saleDateGroup = document.getElementById("saleDateGroup");
  const orderDateGroup = document.getElementById("orderDateGroup");
  const paymentLabel = document.getElementById("paymentLabel");
  const stateSaleLabel = document.getElementById("stateSaleLabel");
  const stateOrderLabel = document.getElementById("stateOrderLabel");
  const stateRightColTitle = document.getElementById("rightColTitle");
  const statePageTitle = document.getElementById("pageTitle");
  const confirmButton = document.querySelector(
    "button[onclick='submitData()']"
  );

  window.orderState.isOrderState = stateToggle.checked;

  const actionText = orderState.orderId || orderState.saleId ? "Update" : "Confirm";

  if (window.orderState.isOrderState) {
    // ORDER MODE
    orderDateGroup.classList.remove("hidden");
    saleDateGroup.classList.add("hidden");
    paymentLabel.innerHTML =
      'Advance Payment <span class="text-red-500">*</span>';

    stateSaleLabel.classList.replace("text-slate-900", "text-slate-500");
    stateSaleLabel.classList.remove("font-bold");

    stateOrderLabel.classList.replace("text-slate-500", "text-slate-900");
    stateOrderLabel.classList.add("font-bold");

    if (confirmButton)
      confirmButton.querySelector("span").textContent = `${actionText} Order`;

    stateRightColTitle.innerText = "Order";
    statePageTitle.innerText = "New Order Entry";
  } else {
    // SALE MODE
    saleDateGroup.classList.remove("hidden");
    orderDateGroup.classList.add("hidden");
    paymentLabel.innerHTML = 'Paid Amount <span class="text-red-500">*</span>';

    stateSaleLabel.classList.replace("text-slate-500", "text-slate-900");
    stateSaleLabel.classList.add("font-bold");

    stateOrderLabel.classList.replace("text-slate-900", "text-slate-500");
    stateOrderLabel.classList.remove("font-bold");

    if (confirmButton)
      confirmButton.querySelector("span").textContent = `${actionText} Sale`;

    if (!window.orderState.orderId) setTodayDates();
    stateRightColTitle.innerText = "Sale";
    statePageTitle.innerText = "New Sale Entry";
  }
  calculateDue();
};

// Helper function to set today's date on all date inputs
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

// --- HELPER: Populate Select ---
function populateSelect(elementId, labelName, data, labelFn, valueKey) {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML = `<option value="" disabled>Select ${labelName}</option>`;
  if (!data || data.length === 0) {
    select.innerHTML = `<option value="" disabled>No ${labelName} Found</option>`;
  } else {
    data.forEach((item) => {
      select.innerHTML += `<option value="${item[valueKey]}">${labelFn(
        item
      )}</option>`;
    });
  }
}

// --- Render Product Options ---
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

    // Always allow the product being edited
    if (p.id == editingProductId) return true;

    // If NOT order state, stock must be > 0
    if (window.orderState.isOrderState === false) {
      return !isInCart && p.current_stock_level > 0;
    }

    // If order state, do not check stock
    return !isInCart;
  });

  // 3. Generate HTML
  select.innerHTML = `<option value="" disabled selected>Select Product</option>`;

  if (availableProducts.length === 0) {
    select.innerHTML += `<option value="" disabled>No product available</option>`;
  } else {
    availableProducts.forEach((p) => {
      // Re-select the item if it was previously selected (helps when switching edit modes)
      const isSelected = p.id == currentSelection ? "selected" : "";
      select.innerHTML += `<option value="${p.id}" ${isSelected}>${p.product_name} [${p.current_stock_level}]</option>`;
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

  // 0. If Adding new item for sale where  qty > current_stock_level
  if (
    !window.orderState.isOrderState &&
    parseInt(qty) > product.current_stock_level
  ) {
    showModalConfirm(
      "error",
      "Maximum quantity exceed!",
      "Please select item with less quantity",
      "Ok",
      () => {}
    );
    return;
  }

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
  submitBtn.innerHTML = `<i class="ph ph-check font-bold"></i> Update`;
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

// Render Cart
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

// Remove Cart Item
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

// Calculate Due
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
    if (orderState.cart.length === 0)
    return showNotification("error", "No product selected");

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
    ...(isEditing && { id: parseInt(orderState.orderId) }),
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
    ? `${window.globalState.apiBase}/products/orders/update/${orderState.orderId}`
    : `${window.globalState.apiBase}/products/orders/new`;
  const method = isEditing ? "PATCH" : "POST";
  const action = isEditing ? "Updated" : "Confirmed";

  
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
        `Order ${action}`,
        `Order ${action} successfully!`,
        "Print Invoice",
        async () => {
          // Use outer 'data' here safely
          const response = await fetch(
            `${window.globalState.apiBase}/products/orders/${
              isEditing ? orderState.orderId : data.order_id
            }`
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
    if (orderState.cart.length === 0)
    return showNotification("error", "No product selected");

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
    ...(isEditing && { id: parseInt(orderState.saleId) }),
    branch_id: window.globalState.user.branch_id,
    memo_no: memoNo,
    sale_date: saleDate.toISOString(),
    salesperson_id: parseInt(salespersonId),
    customer_id: parseInt(customerId),
    total_amount: totalAmount,
    payment_account_id: parseInt(paymentAccountId),
    received_amount: receivedAmount,
    status: "delivered", // or pending if you prefer
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
    ? `${window.globalState.apiBase}/products/sales/update/${orderState.saleId}`
    : `${window.globalState.apiBase}/products/sales/new`;
  const method = isEditing ? "PATCH" : "POST";
  const action = isEditing ? "Updated" : "Confirmed";

  
  try {
    const res = await fetch(url, {
      method: method,
      headers: window.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      showModalConfirm(
        "success",
        `Sale ${action}`,
        `Sale ${action} successfully!`,
        "Print Invoice",
        async () => {
          // Use outer 'data' here safely
          const response = await fetch(
            `${window.globalState.apiBase}/products/sales/details/${
              isEditing ? orderState.saleId : data.sale_id
            }`
          );

          // FIX: Rename this to 'saleData' to avoid conflict
          const saleData = await response.json();

          if (saleData.error) throw new Error(saleData.error);

          const sale = saleData.sale;
          // Ensure your printInvoice function matches the one we created earlier
          // If you named it printSaleInvoice in previous steps, change this to printSaleInvoice(sale)
          // or ensure you have: window.printInvoice = window.printSaleInvoice;
          await printSaleInvoice(sale.id, sale);
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
        "Error: " + (data.message || "Could not save Sale")
      );
    }
  } catch (e) {
    console.error(e);
    showNotification("error", "Network Error");
  }
};
