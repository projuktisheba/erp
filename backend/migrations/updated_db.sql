CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    memo_no VARCHAR(100) NOT NULL,

    order_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    salesperson_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    
    total_payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    advance_payment_amount NUMERIC(12,2) DEFAULT 0,

    payment_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'checkout', 'delivery', 'cancelled')),
    
    delivery_date TIMESTAMPTZ,
    total_items BIGINT NOT NULL DEFAULT 0,
    items_delivered BIGINT NOT NULL DEFAULT 0,
    exit_date TIMESTAMPTZ,
    delivery_info TEXT DEFAULT '',
    
    notes TEXT DEFAULT '',
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(memo_no, branch_id)
);

CREATE TABLE public.products (
    id BIGSERIAL PRIMARY KEY,
    product_name character varying(255) DEFAULT ''::character varying NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ  without time zone DEFAULT CURRENT_TIMESTAMP
);