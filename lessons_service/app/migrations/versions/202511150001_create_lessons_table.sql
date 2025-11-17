CREATE TABLE IF NOT EXISTS lessons (
	id SERIAL PRIMARY KEY,
	course_id INTEGER NOT NULL,
	title VARCHAR(255) NOT NULL,
	content TEXT NOT NULL DEFAULT '',
	pgn_content TEXT,
	order_index INTEGER NOT NULL DEFAULT 1,
	duration_sec INTEGER NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_lessons_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_lessons_course_id ON lessons (course_id);
CREATE INDEX IF NOT EXISTS ix_lessons_order ON lessons (course_id, order_index, id);

