CREATE TABLE IF NOT EXISTS games (
	id UUID PRIMARY KEY,
	white_id INTEGER,
	black_id INTEGER,
	initial_pos TEXT NOT NULL DEFAULT 'startpos',
	current_pos TEXT NOT NULL,
	next_turn TEXT NOT NULL DEFAULT 'w',
	time_control JSONB,
	move_count INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'CREATED',
	white_clock_ms BIGINT NOT NULL DEFAULT 0,
	black_clock_ms BIGINT NOT NULL DEFAULT 0,
	result TEXT,
	termination_reason TEXT,
	ended_by INTEGER,
	pgn TEXT,
	metadata JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	started_at TIMESTAMPTZ,
	finished_at TIMESTAMPTZ,
	CONSTRAINT chk_games_next_turn CHECK (next_turn IN ('w', 'b')),
	CONSTRAINT chk_games_status CHECK (status IN ('CREATED', 'ACTIVE', 'PAUSED', 'FINISHED')),
	CONSTRAINT chk_games_has_creator CHECK (white_id IS NOT NULL OR black_id IS NOT NULL),
	CONSTRAINT chk_games_result CHECK (result IS NULL OR result IN ('1-0', '0-1', '1/2-1/2')),
	CONSTRAINT chk_games_termination CHECK (termination_reason IS NULL OR termination_reason IN ('CHECKMATE', 'RESIGNATION', 'TIMEOUT'))
);

CREATE INDEX IF NOT EXISTS ix_games_status_created_at ON games (status, created_at);

CREATE TABLE IF NOT EXISTS moves (
	id SERIAL PRIMARY KEY,
	game_id UUID NOT NULL,
	move_index INTEGER NOT NULL,
	uci VARCHAR(12) NOT NULL,
	san VARCHAR(32),
	fen_after TEXT NOT NULL,
	player_id INTEGER,
	clocks_after JSONB,
	is_capture BOOLEAN NOT NULL DEFAULT FALSE,
	promotion VARCHAR(1),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_moves_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moves_game_move_index ON moves (game_id, move_index);
CREATE INDEX IF NOT EXISTS ix_moves_game_created_at ON moves (game_id, created_at);

CREATE TABLE IF NOT EXISTS game_snapshots (
	id SERIAL PRIMARY KEY,
	game_id UUID NOT NULL,
	snapshot_move_index INTEGER NOT NULL,
	fen TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT fk_snapshots_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_snapshots_game_move_index ON game_snapshots (game_id, snapshot_move_index);

