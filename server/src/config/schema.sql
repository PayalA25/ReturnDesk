
CREATE TABLE IF NOT EXISTS return_requests (
    id BIGSERIAL PRIMARY KEY,
    reference VARCHAR(50) UNIQUE NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30),
    item_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),

    reason VARCHAR(30) NOT NULL CHECK (
        reason IN (
            'Damaged',
            'Wrong Item',
            'Size Issue',
            'Not As Described',
            'Changed Mind'
        )
    ),

    status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (
        status IN (
            'Open',
            'In Review',
            'Approved',
            'Rejected',
            'Completed'
        )
    ),

    resolution VARCHAR(20) CHECK (
        resolution IN ('Refund', 'Replacement', 'Store Credit')
    ),

    refund_amount NUMERIC(10, 2) CHECK (
        refund_amount IS NULL OR refund_amount > 0
    ),

    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_resolution_refund CHECK (
        (
            resolution = 'Refund'
            AND refund_amount IS NOT NULL
        )
        OR (
            resolution IN ('Replacement', 'Store Credit')
            AND refund_amount IS NULL
        )
        OR (
            resolution IS NULL
            AND refund_amount IS NULL
        )
    )
);

CREATE TABLE IF NOT EXISTS return_notes (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL
        REFERENCES return_requests(id),
    note TEXT NOT NULL CHECK (LENGTH(TRIM(note)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_status
    ON return_requests(status);

CREATE INDEX IF NOT EXISTS idx_return_requests_reason
    ON return_requests(reason);

CREATE INDEX IF NOT EXISTS idx_return_requests_order
    ON return_requests(order_number);

CREATE INDEX IF NOT EXISTS idx_return_notes_request
    ON return_notes(request_id);

CREATE INDEX IF NOT EXISTS idx_return_notes_chronological
    ON return_notes(request_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_live_return_order_item
    ON return_requests (
        LOWER(order_number),
        LOWER(item_name)
    )
    WHERE is_deleted = FALSE
      AND status NOT IN ('Rejected', 'Completed');
