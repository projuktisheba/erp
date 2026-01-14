-- =========================================================
-- 1. CLEANUP: Ensure tables are dropped before creation 
-- =========================================================
-- Note: This section assumes the existence of the dependent tables (branches, employees, customers, accounts, products)
-- and drops the related tables defined in your updated_db.sql
DROP TABLE IF EXISTS sale_transactions CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;


-- =========================================================
-- 2. SALES TABLE (Transaction Header)
-- =========================================================
CREATE TABLE sales (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL,
    
    -- Identification
    memo_no VARCHAR(100) NOT NULL, -- The Human Readable ID (e.g. INV-2023-001)
    
    -- Dates
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Actors
    salesperson_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,

    -- Products
    Total_products BIGINT NOT NULL DEFAULT 0,
    
    -- Financial
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00, 
    received_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    
    -- Status & Metadata
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT sales_status_check 
    CHECK (status IN ('pending', 'delivered', 'cancelled')),

    -- Foreign Key Constraints referencing your existing tables
    CONSTRAINT fk_sales_branch_id 
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_salesperson_id 
        FOREIGN KEY (salesperson_id) REFERENCES employees(id),
    CONSTRAINT fk_sales_customer_id 
        FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX idx_sales_memo_branch_unique ON sales(memo_no, branch_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_branch_id ON sales(branch_id);


-- =========================================================
-- 3. SALE ITEMS (The Contents)
-- =========================================================
CREATE TABLE sale_items (
    id BIGSERIAL PRIMARY KEY,
    
    -- LINKING 
    sale_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    
    -- QUANTITIES 
    quantity INT NOT NULL CHECK (quantity > 0),       -- How many customer bought
    -- FINANCIAL
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,     -- Calculated as quantity * unit_price
    
    -- Foreign Key Constraints
    CONSTRAINT fk_sale_items_sale_id 
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_items_product_id 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        
    -- Ensure product uniqueness within an sale
    UNIQUE (sale_id, product_id)
);

CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);

-- =========================================================
-- 4.SALE PAYMENT TRANSACTIONS (Financial Audit)
-- =========================================================
CREATE TABLE sale_transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    
    -- LINKING (Hybrid Approach)
    sale_id BIGINT REFERENCES sales(id) ON DELETE CASCADE, -- Link for code logic
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    memo_no VARCHAR(50) DEFAULT '', -- Snapshot for audit logs
    --products
    delivered_by BIGINT REFERENCES employees(id), -- Driver or Employee Name
    quantity_delivered BIGINT NOT NULL DEFAULT 0,
    -- MONEY
    amount NUMERIC(12,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL 
        CHECK (transaction_type IN ('Payment', 'Refund', 'Adjustment')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sale_transactions_sale_id ON sale_transactions(sale_id);
CREATE INDEX idx_sale_transactions_payment_account_id ON sale_transactions(payment_account_id);
CREATE INDEX idx_sale_transactions_memo_no ON sale_transactions(memo_no);
CREATE INDEX idx_sale_transactions_transaction_type ON sale_transactions(transaction_type);

