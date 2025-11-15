BEGIN;

ALTER TABLE users
    ADD COLUMN username VARCHAR(32);

UPDATE users
SET username = LOWER(SPLIT_PART(email, '@', 1)) || '_' || id
WHERE username IS NULL OR username = '';

ALTER TABLE users
    ALTER COLUMN username SET NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT users_username_key UNIQUE (username);

CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

COMMIT;

