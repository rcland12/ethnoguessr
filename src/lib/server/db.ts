import { env } from '$env/dynamic/private';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Accounts, sessions and saved daily results, in one SQLite file under
 * STATE_DIR. Node's built-in driver: no native module to build, and the
 * whole site is one small process, so a synchronous API is fine.
 */

const SCHEMA = `
create table if not exists users (
	id                integer primary key,
	email             text not null unique,
	password_hash     text not null,
	created_at        integer not null,
	email_verified_at integer,
	email_daily       integer not null default 0,
	unsubscribe_token text not null unique
);

create table if not exists sessions (
	token_hash text primary key,
	user_id    integer not null references users(id) on delete cascade,
	expires_at integer not null
);
create index if not exists sessions_user on sessions(user_id);

-- One-time email links: 'verify' (confirm address) and 'reset' (password).
create table if not exists tokens (
	token_hash text primary key,
	user_id    integer not null references users(id) on delete cascade,
	kind       text not null,
	expires_at integer not null
);

create table if not exists results (
	user_id    integer not null references users(id) on delete cascade,
	day        text not null,
	total      integer not null,
	rounds     text not null,
	created_at integer not null,
	primary key (user_id, day)
);

-- Claims a day's morning email so restarts never send it twice.
create table if not exists email_runs (
	day         text primary key,
	started_at  integer not null,
	finished_at integer,
	sent        integer not null default 0,
	failed      integer not null default 0
);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
	if (db) return db;
	const file = resolve(env.STATE_DIR || 'data/state', 'ethnoguessr.db');
	mkdirSync(dirname(file), { recursive: true });
	db = new DatabaseSync(file);
	db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');
	db.exec(SCHEMA);
	return db;
}

export const now = () => Math.floor(Date.now() / 1000);
