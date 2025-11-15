-- Chess games core tables
BEGIN;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'games_status_enum') THEN
		CREATE TYPE games_status_enum AS ENUM ('CREATED', 'ACTIVE', 'PAUSED', 'FINISHED');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'games_result_enum') THEN
		CREATE TYPE games_result_enum AS ENUM ('1-0', '0-1', '1/2-1/2');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'games_termination_enum') THEN
		CREATE TYPE games_termination_enum AS ENUM ('CHECKMATE', 'RESIGNATION', 'TIMEOUT');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'games_side_to_move_enum') THEN
		CREATE TYPE games_side_to_move_enum AS ENUM ('w', 'b');
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS games (
	id UUID PRIMARY KEY,
	white_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
	black_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
	initial_pos TEXT NOT NULL DEFAULT 'startpos',
	current_pos TEXT NOT NULL,
	next_turn games_side_to_move_enum NOT NULL DEFAULT 'w',
	time_control JSONB NULL,
	move_count INTEGER NOT NULL DEFAULT 0,
	status games_status_enum NOT NULL DEFAULT 'CREATED',
	white_clock_ms BIGINT NOT NULL DEFAULT 0 CHECK (white_clock_ms >= 0),
	black_clock_ms BIGINT NOT NULL DEFAULT 0 CHECK (black_clock_ms >= 0),
	result games_result_enum NULL,
	termination_reason games_termination_enum NULL,
	ended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
	pgn TEXT NULL,
	metadata JSONB NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	started_at TIMESTAMPTZ NULL,
	finished_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_games_status_created_at ON games (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_games_white_id ON games (white_id);
CREATE INDEX IF NOT EXISTS ix_games_black_id ON games (black_id);

CREATE TABLE IF NOT EXISTS moves (
	id BIGSERIAL PRIMARY KEY,
	game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
	move_index INTEGER NOT NULL,
	uci VARCHAR(12) NOT NULL,
	san VARCHAR(32),
	fen_after TEXT NOT NULL,
	player_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
	clocks_after JSONB,
	is_capture BOOLEAN NOT NULL DEFAULT FALSE,
	promotion CHAR(1),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moves_game_move_index ON moves (game_id, move_index);
CREATE INDEX IF NOT EXISTS ix_moves_game_created_at ON moves (game_id, created_at);
CREATE INDEX IF NOT EXISTS ix_moves_player_id ON moves (player_id);

CREATE TABLE IF NOT EXISTS game_snapshots (
	id BIGSERIAL PRIMARY KEY,
	game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
	snapshot_move_index INTEGER NOT NULL,
	fen TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_snapshots_game_move_index
	ON game_snapshots (game_id, snapshot_move_index);

COMMIT;

