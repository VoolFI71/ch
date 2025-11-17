CREATE TABLE IF NOT EXISTS orders (
	id SERIAL PRIMARY KEY,
	user_id INTEGER,
	course_id INTEGER,
	amount_cents INTEGER NOT NULL,
	currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
	provider VARCHAR(32) NOT NULL DEFAULT 'manual',
	provider_payment_id VARCHAR(128),
	status VARCHAR(16) NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
	CONSTRAINT fk_orders_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS ix_orders_course_id ON orders (course_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS ix_orders_provider_payment_id ON orders (provider_payment_id);

