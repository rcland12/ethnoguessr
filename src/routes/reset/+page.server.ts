import {
	PASSWORD_MAX,
	PASSWORD_MIN,
	markVerified,
	setPassword,
	startSession,
	useToken
} from '$lib/server/auth';
import { fail, redirect, type Actions } from '@sveltejs/kit';

export const load = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');
		if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
			return fail(400, { error: `Use a password of at least ${PASSWORD_MIN} characters.` });
		}
		const userId = useToken(token, 'reset');
		if (!userId) {
			return fail(400, { error: 'That link has expired or was already used.', expired: true });
		}
		await setPassword(userId, password);
		// The reset link arrived by email, so the address is confirmed too.
		markVerified(userId);
		startSession(cookies, userId);
		redirect(303, '/account?reset=1');
	}
};
