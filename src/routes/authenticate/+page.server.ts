import { nowSec, passcodeMatches, setSessionCookie } from '$lib/server/session';
import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;

/** Failed attempts per client IP. In memory: a restart forgives everyone. */
const attempts = new Map<string, { count: number; until: number }>();

/** Only same-site paths, so the login can't be used as an open redirect. */
function safeNext(raw: string | null): string {
	return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

export const load: ServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeNext(url.searchParams.get('next')));
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const ip = getClientAddress();
		const t = nowSec();
		const cur = attempts.get(ip);
		if (cur && cur.until > t && cur.count >= MAX_ATTEMPTS) {
			return fail(429, { error: 'Too many wrong guesses. Try again in a few minutes.' });
		}

		const form = await request.formData();
		const passcode = String(form.get('passcode') ?? '');

		if (!passcodeMatches(passcode)) {
			const next = cur && cur.until > t ? cur : { count: 0, until: t + LOCK_SECONDS };
			next.count += 1;
			attempts.set(ip, next);
			return fail(401, { error: 'That’s not it.' });
		}

		attempts.delete(ip);
		setSessionCookie(cookies);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
