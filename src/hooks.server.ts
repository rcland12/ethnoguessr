import { building } from '$app/environment';
import { sessionUser } from '$lib/server/auth';
import { startScheduler } from '$lib/server/scheduler';
import { COOKIE_NAME, SESSION_SECONDS, gateMode, nowSec, readToken, setSessionCookie } from '$lib/server/session';
import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';

export const init: ServerInit = () => {
	if (!building) startScheduler();
};

/**
 * With PASSCODE set, everything is behind it except these. Protected by default,
 * so a route added later can't be exposed by forgetting a check. Faces are
 * served through /api/face rather than static/ for the same reason: adapter-node
 * serves static/ before this hook runs.
 */
// /unsubscribe is reached from an email and must work for anyone holding the link.
const PUBLIC_PREFIXES = ['/authenticate', '/api/health', '/unsubscribe'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export const handle: Handle = async ({ event, resolve }) => {
	const mode = gateMode();
	event.locals.authed = mode === 'off';

	if (mode === 'on') {
		const exp = readToken(event.cookies.get(COOKIE_NAME));
		if (exp !== null) {
			event.locals.authed = true;
			if (exp - nowSec() < SESSION_SECONDS / 2) setSessionCookie(event.cookies);
		} else if (event.cookies.get(COOKIE_NAME)) {
			event.cookies.delete(COOKIE_NAME, { path: '/' });
		}
	}

	event.locals.user = sessionUser(event.cookies);

	const { pathname } = event.url;
	if (!event.locals.authed && !isPublic(pathname)) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + event.url.search)}`;
		redirect(303, `/authenticate${next}`);
	}

	return resolve(event);
};
