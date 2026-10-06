import { allowAttempt, checkLogin, clearAttempts, normalizeEmail, startSession } from '$lib/server/auth';
import { fail, redirect, type Actions } from '@sveltejs/kit';

function safeNext(raw: string | null): string {
	return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

export const load = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		const password = String(form.get('password') ?? '');

		// Per IP and per account, so neither one address nor one account can be hammered.
		const ipKey = `login:${getClientAddress()}`;
		const acctKey = `login:${email}`;
		if (!allowAttempt(ipKey, 20) || !allowAttempt(acctKey, 8)) {
			return fail(429, { email, error: 'Too many attempts. Try again in 15 minutes.' });
		}

		const user = await checkLogin(email, password);
		if (!user) return fail(401, { email, error: 'Wrong email or password.' });

		clearAttempts(acctKey);
		startSession(cookies, user.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
