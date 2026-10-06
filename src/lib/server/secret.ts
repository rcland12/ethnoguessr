import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { randomBytes } from 'node:crypto';

let cached: string | null = null;

/**
 * SESSION_SECRET signs session cookies and derives the opaque round ids.
 * Without one, a random secret is made per process: everyone is signed out
 * and in-flight games break on restart, which is survivable but worth a warning.
 */
export function sessionSecret(): string {
	if (cached) return cached;
	const configured = env.SESSION_SECRET?.trim();
	if (!configured && !dev) {
		console.warn('[ethnoguessr] SESSION_SECRET is unset; using a per-process random secret');
	}
	const secret = configured || randomBytes(32).toString('base64url');
	cached = secret;
	return secret;
}
