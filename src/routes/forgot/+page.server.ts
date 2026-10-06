import { allowAttempt, issueToken, normalizeEmail, userByEmail } from '$lib/server/auth';
import { sendResetEmail, siteOrigin } from '$lib/server/mail';
import { fail, type Actions } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		if (!allowAttempt(`forgot:${getClientAddress()}`, 5) || !allowAttempt(`forgot:${email}`, 3)) {
			return fail(429, { email, error: 'Too many requests. Try again later.' });
		}
		const user = userByEmail(email);
		if (user) {
			const token = issueToken(user.id, 'reset');
			try {
				await sendResetEmail(email, `${siteOrigin()}/reset?token=${token}`);
			} catch (err) {
				console.error('[ethnoguessr] reset email failed:', (err as Error).message);
			}
		}
		// Same answer either way, so this can't be used to find out who has an account.
		return { sent: true, email };
	}
};
