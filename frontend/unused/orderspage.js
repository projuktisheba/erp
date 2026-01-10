// order payload
 let orderPayload = {
    "branch_id": 1,
    "type": "ORDER",
    "customer_id": 2,
    "salesperson_id": 5,
    "advance_amount": 0,
    "notes": "Notes",
    "items": [
        {
            "product_id": 1,
            "quantity": 5,
            "price": 100
        },
        {
            "product_id": 3,
            "quantity": 7,
            "price": 70
        }
    ],
    "order_date": "2026-01-08",
    "delivery_date": "2026-01-15",
    "sale_date": null,
    "memo_no": "5555",
    "payment_account_id": 1
}

let salePayload = {
    "branch_id": 1,
    "type": "SALE",
    "customer_id": 2,
    "salesperson_id": 5,
    "advance_amount": 450,
    "notes": "dfsdfasf",
    "items": [
        {
            "product_id": 1,
            "quantity": 5,
            "price": 100
        },
        {
            "product_id": 3,
            "quantity": 7,
            "price": 400
        }
    ],
    "sale_date": "2026-01-09",
    "order_date": null,
    "delivery_date": null
}