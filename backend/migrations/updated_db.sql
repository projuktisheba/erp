-- =========================================================
-- 1. CLEANUP: Ensure tables are dropped before creation 
-- =========================================================
-- Note: This section assumes the existence of the dependent tables (branches, employees, customers, accounts, products)
-- and drops the related tables defined in your updated_db.sql
DROP TABLE IF EXISTS delivery_challans CASCADE;
DROP TABLE IF EXISTS order_transactions CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;


-- =========================================================
-- 2. ORDERS TABLE (Transaction Header)
-- =========================================================
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL,
    
    -- Identification
    memo_no VARCHAR(100) NOT NULL, -- The Human Readable ID (e.g. INV-2023-001)
    
    -- Dates
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_date DATE, -- Target delivery date
    
    -- Actors
    salesperson_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,

    -- Products
    Total_products BIGINT NOT NULL DEFAULT 0,
    delivered_products BIGINT NOT NULL DEFAULT 0,
    
    -- Financial
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00, 
    received_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    
    -- Status & Metadata
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT orders_status_check 
    CHECK (status IN ('pending', 'partial', 'delivered', 'cancelled', 'returned')),

    -- Foreign Key Constraints referencing your existing tables
    CONSTRAINT fk_orders_branch_id 
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_orders_salesperson_id 
        FOREIGN KEY (salesperson_id) REFERENCES employees(id),
    CONSTRAINT fk_orders_customer_id 
        FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX idx_orders_memo_branch_unique ON orders(memo_no, branch_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_branch_id ON orders(branch_id);


-- =========================================================
-- 3. ORDER ITEMS (The Contents)
-- =========================================================
CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    
    -- LINKING 
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    
    -- QUANTITIES 
    quantity INT NOT NULL CHECK (quantity > 0),       -- How many customer bought
    -- FINANCIALS
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,     -- Calculated as quantity * unit_price
    
    -- Foreign Key Constraints
    CONSTRAINT fk_order_items_order_id 
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product_id 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        
    -- Ensure product uniqueness within an order
    UNIQUE (order_id, product_id)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- =========================================================
-- 4.ORDER PAYMENT TRANSACTIONS (Financial Audit)
-- =========================================================
CREATE TABLE order_transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    
    -- LINKING (Hybrid Approach)
    order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE, -- Link for code logic
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    memo_no VARCHAR(50) DEFAULT '', -- Snapshot for audit logs
    --products
    delivered_by BIGINT REFERENCES employees(id), -- Driver or Employee Name
    quantity_delivered BIGINT NOT NULL DEFAULT 0,
    -- MONEY
    amount NUMERIC(12,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL 
        CHECK (transaction_type IN ('Advance Payment','Payment', 'Refund', 'Adjustment')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_order_transactions_order_id ON order_transactions(order_id);
CREATE INDEX idx_order_transactions_payment_account_id ON order_transactions(payment_account_id);
CREATE INDEX idx_order_transactions_memo_no ON order_transactions(memo_no);
CREATE INDEX idx_order_transactions_transaction_type ON order_transactions(transaction_type);

