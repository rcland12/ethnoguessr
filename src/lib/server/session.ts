import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from './secret';

export const COOKIE_NAME = 'eg_session';

/** Passcode-gate sessions last a month, renewed on use. */
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export const nowSec = () => Math.floor(Date.now() / 1000);

function sign(exp: number): string {
	return createHmac('sha256', sessionSecret()).update(`session:${exp}`).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Returns the expiry of a valid token, or null. */
export function readToken(value: string | undefined): number | null {
	if (!value) return null;
	const [expStr, sig] = value.split('.');
	const exp = Number(expStr);
	if (!Number.isInteger(exp) || !sig || exp <= nowSec()) return null;
	return safeEqual(sig, sign(exp)) ? exp : null;
}

export function setSessionCookie(cookies: Cookies) {
	const exp = nowSec() + SESSION_SECONDS;
	cookies.set(COOKIE_NAME, `${exp}.${sign(exp)}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_SECONDS
	});
}

/**
 * The passcode gate is optional: set PASSCODE to turn it on, leave it unset
 * and anyone with the URL can play.
 */
export function gateMode(): 'off' | 'on' {
	return env.PASSCODE?.trim() ? 'on' : 'off';
}

export function passcodeMatches(attempt: string): boolean {
	const configured = env.PASSCODE?.trim();
	if (!configured) return false;
	// Hash both sides so the comparison is constant-time whatever the lengths.
	const h = (s: string) => createHash('sha256').update(s).digest();
	return timingSafeEqual(h(attempt.trim()), h(configured));
}
