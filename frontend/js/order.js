// js/order.js

// CONFIG
const API_BASE_ORDER = 'http://localhost:8080/api/v1'; 

// STATE (Specific to this page)
let orderState = {
    cart: [],
    products: []
};

// --- INITIALIZATION ---
// This function will be called automatically by script.js when the page loads
window.initOrderPage = async function() {
    console.log("Order Page Initializing...");
    
    // 1. Get User Branch (Assumed from global state or storage)
    const branchId = 1; // Replace with state.user.branch_id in real app

    try {
        // Parallel Fetch
        const [productsRes, customersRes, employeesRes, accountsRes] = await Promise.all([
            fetch(`${API_BASE_ORDER}/products?branch_id=${branchId}`),
            fetch(`${API_BASE_ORDER}/customers?branch_id=${branchId}`),
            fetch(`${API_BASE_ORDER}/employees?branch_id=${branchId}`),
            fetch(`${API_BASE_ORDER}/accounts?branch_id=${branchId}`)
        ]);

        const products = await productsRes.json();
        const customers = await customersRes.json();
        const employees = await employeesRes.json();
        const accounts = await accountsRes.json();

        // Store products for price lookup
        orderState.products = products;

        // Populate Dropdowns
        populateSelect('productSelect', products, (p) => `${p.product_name} (Stock: ${p.quantity})`, 'id');
        populateSelect('customerSelect', customers, (c) => `${c.name} - ${c.mobile}`, 'id');
        populateSelect('employeeSelect', employees, (e) => `${e.name} (${e.role})`, 'id');
        populateSelect('accountSelect', accounts, (a) => `${a.name} (${a.type})`, 'id');

        // Add Listener for Advance Input
        const advInput = document.getElementById('advanceInput');
        if(advInput) advInput.addEventListener('input', calculateDue);

    } catch (error) {
        console.error("Error loading order data:", error);
    }
}

// --- HELPER: Populate Select ---
function populateSelect(elementId, data, labelFn, valueKey) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = `<option value="" disabled selected>Select...</option>`;
    data.forEach(item => {
        select.innerHTML += `<option value="${item[valueKey]}">${labelFn(item)}</option>`;
    });
}

// --- CART LOGIC ---
window.handleAddToCart = function(e) {
    e.preventDefault();
    const pid = document.getElementById('productSelect').value;
    const qty = parseInt(document.getElementById('qtyInput').value);
    const price = parseFloat(document.getElementById('priceInput').value);

    if (!pid || !qty || !price) return alert("Fill all fields");

    // Find product name for display
    const product = orderState.products.find(p => p.id == pid);
    const pName = product ? product.product_name : "Unknown Item";

    orderState.cart.push({
        product_id: pid,
        name: pName,
        qty: qty,
        price: price,
        total: qty * price
    });

    renderCart();
    e.target.reset(); // Clear form
}

window.renderCart = function() {
    const tbody = document.getElementById('cartTableBody');
    tbody.innerHTML = '';
    let grandTotal = 0;
    
    orderState.cart.forEach((item, index) => {
        grandTotal += item.total;
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="px-4 py-2">${item.name}</td>
                <td class="px-4 py-2 text-center">${item.qty}</td>
                <td class="px-4 py-2 text-right">${item.price}</td>
                <td class="px-4 py-2 text-right">${item.total}</td>
                <td class="px-4 py-2 text-center">
                    <button onclick="removeCartItem(${index})" class="text-red-500">Del</button>
                </td>
            </tr>`;
    });

    document.getElementById('cartTotalDisplay').textContent = grandTotal.toFixed(2);
    calculateDue();
}

window.removeCartItem = function(index) {
    orderState.cart.splice(index, 1);
    renderCart();
}

window.calculateDue = function() {
    const total = orderState.cart.reduce((a, b) => a + b.total, 0);
    const advance = parseFloat(document.getElementById('advanceInput').value) || 0;
    document.getElementById('dueAmountDisplay').textContent = (total - advance).toFixed(2);
}

// --- SUBMIT LOGIC ---
window.submitOrderToDB = async function() {
    if (orderState.cart.length === 0) return alert("Cart empty");

    const payload = {
        branch_id: 1, // Dynamic in real app
        memo_no: "MEMO-" + Date.now(),
        customer_id: document.getElementById('customerSelect').value,
        salesperson_id: document.getElementById('employeeSelect').value,
        payment_account_id: document.getElementById('accountSelect').value,
        items: orderState.cart,
        // ... add other fields as per previous step
    };

    console.log("Sending to DB:", payload);
    // Add your fetch('/api/orders') here...
    alert("Check console for payload");
}