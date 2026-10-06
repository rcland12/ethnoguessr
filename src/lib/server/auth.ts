import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { getDb, now } from './db';

export const USER_COOKIE = 'eg_user';
const SESSION_DAYS = 90;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export interface User {
	id: number;
	email: string;
	emailVerified: boolean;
	emailDaily: boolean;
	unsubscribeToken: string;
}

interface UserRow {
	id: number;
	email: string;
	password_hash: string;
	email_verified_at: number | null;
	email_daily: number;
	unsubscribe_token: string;
}

function toUser(r: UserRow): User {
	return {
		id: r.id,
		email: r.email,
		emailVerified: r.email_verified_at !== null,
		emailDaily: r.email_daily === 1,
		unsubscribeToken: r.unsubscribe_token
	};
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');

export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

/** Deliberately loose: the confirmation email is the real check. */
export function isEmail(s: string): boolean {
	return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Passwords ------------------------------------------------------------------

// scrypt N=2^15, r=8, p=1: ~50 ms and 32 MB per hash.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((res, rej) =>
		scrypt(password.normalize('NFKC'), salt, 64, SCRYPT, (err, key) => (err ? rej(err) : res(key)))
	);
}

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scryptAsync(password, salt);
	return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [alg, , , , salt, key] = stored.split('$');
	if (alg !== 'scrypt' || !salt || !key) return false;
	const actual = await scryptAsync(password, Buffer.from(salt, 'base64'));
	const expected = Buffer.from(key, 'base64');
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash of a throwaway password, so logins for unknown emails take as long as real ones. */
let dummyHash: Promise<string> | null = null;

// Users ----------------------------------------------------------------------

export function userByEmail(email: string): User | null {
	const r = getDb().prepare('select * from users where email = ?').get(email) as UserRow | undefined;
	return r ? toUser(r) : null;
}

export function userById(id: number): User | null {
	const r = getDb().prepare('select * from users where id = ?').get(id) as UserRow | undefined;
	return r ? toUser(r) : null;
}

export async function createUser(email: string, password: string, emailDaily: boolean): Promise<User> {
	const hash = await hashPassword(password);
	const r = getDb()
		.prepare(
			`insert into users (email, password_hash, created_at, email_daily, unsubscribe_token)
			 values (?, ?, ?, ?, ?) returning *`
		)
		.get(email, hash, now(), emailDaily ? 1 : 0, randomToken()) as unknown as UserRow;
	return toUser(r);
}

export async function checkLogin(email: string, password: string): Promise<User | null> {
	const r = getDb().prepare('select * from users where email = ?').get(email) as UserRow | undefined;
	if (!r) {
		dummyHash ??= hashPassword(randomToken());
		await verifyPassword(password, await dummyHash);
		return null;
	}
	return (await verifyPassword(password, r.password_hash)) ? toUser(r) : null;
}

export async function setPassword(userId: number, password: string) {
	const hash = await hashPassword(password);
	const db = getDb();
	db.prepare('update users set password_hash = ? where id = ?').run(hash, userId);
	// A password change signs out every other device.
	db.prepare('delete from sessions where user_id = ?').run(userId);
}

export function setEmailDaily(userId: number, on: boolean) {
	getDb().prepare('update users set email_daily = ? where id = ?').run(on ? 1 : 0, userId);
}

export function deleteUser(userId: number) {
	getDb().prepare('delete from users where id = ?').run(userId);
}

export function unsubscribe(token: string): boolean {
	const res = getDb()
		.prepare('update users set email_daily = 0 where unsubscribe_token = ?')
		.run(token);
	return res.changes > 0;
}

export function dailySubscribers(): User[] {
	return (
		getDb()
			.prepare('select * from users where email_daily = 1 and email_verified_at is not null order by id')
			.all() as unknown as UserRow[]
	).map(toUser);
}

// Sessions -------------------------------------------------------------------

export function startSession(cookies: Cookies, userId: number) {
	const token = randomToken();
	const expires = now() + SESSION_DAYS * 86400;
	getDb()
		.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)')
		.run(sha256(token), userId, expires);
	cookies.set(USER_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_DAYS * 86400
	});
}

export function sessionUser(cookies: Cookies): User | null {
	const token = cookies.get(USER_COOKIE);
	if (!token) return null;
	const r = getDb()
		.prepare(
			`select u.* from sessions s join users u on u.id = s.user_id
			 where s.token_hash = ? and s.expires_at > ?`
		)
		.get(sha256(token), now()) as UserRow | undefined;
	if (!r) {
		cookies.delete(USER_COOKIE, { path: '/' });
		return null;
	}
	return toUser(r);
}

export function endSession(cookies: Cookies) {
	const token = cookies.get(USER_COOKIE);
	if (token) getDb().prepare('delete from sessions where token_hash = ?').run(sha256(token));
	cookies.delete(USER_COOKIE, { path: '/' });
}

// One-time email tokens -------------------------------------------------------

export type TokenKind = 'verify' | 'reset';
const TOKEN_TTL: Record<TokenKind, number> = { verify: 7 * 86400, reset: 3600 };

export function issueToken(userId: number, kind: TokenKind): string {
	const token = randomToken();
	const db = getDb();
	// Only the newest link of each kind works.
	db.prepare('delete from tokens where user_id = ? and kind = ?').run(userId, kind);
	db.prepare('insert into tokens (token_hash, user_id, kind, expires_at) values (?, ?, ?, ?)').run(
		sha256(token),
		userId,
		kind,
		now() + TOKEN_TTL[kind]
	);
	return token;
}

/** Consumes a token; returns its user id if it was valid. */
export function useToken(token: string, kind: TokenKind): number | null {
	const r = getDb()
		.prepare('delete from tokens where token_hash = ? and kind = ? and expires_at > ? returning user_id')
		.get(sha256(token), kind, now()) as { user_id: number } | undefined;
	return r?.user_id ?? null;
}

export function markVerified(userId: number) {
	getDb()
		.prepare('update users set email_verified_at = coalesce(email_verified_at, ?) where id = ?')
		.run(now(), userId);
}

export function purgeExpired() {
	const db = getDb();
	db.prepare('delete from sessions where expires_at <= ?').run(now());
	db.prepare('delete from tokens where expires_at <= ?').run(now());
}

// Rate limiting ----------------------------------------------------------------

const WINDOW = 15 * 60;
const buckets = new Map<string, { count: number; until: number }>();

/** Counts an attempt for `key`; false once `max` attempts land in the window. */
export function allowAttempt(key: string, max: number): boolean {
	const t = now();
	const cur = buckets.get(key);
	if (!cur || cur.until <= t) {
		buckets.set(key, { count: 1, until: t + WINDOW });
		return true;
	}
	cur.count += 1;
	return cur.count <= max;
}

export function clearAttempts(key: string) {
	buckets.delete(key);
}
