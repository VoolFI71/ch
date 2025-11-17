CREATE TABLE IF NOT EXISTS enrollments (
	id SERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL,
	course_id INTEGER NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
	CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
	CONSTRAINT uq_enrollments_user_course UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS ix_enrollments_user_id ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS ix_enrollments_course_id ON enrollments (course_id);

