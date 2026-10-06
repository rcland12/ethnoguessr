import {
	PASSWORD_MAX,
	PASSWORD_MIN,
	allowAttempt,
	createUser,
	isEmail,
	issueToken,
	normalizeEmail,
	startSession,
	userByEmail
} from '$lib/server/auth';
import { sendVerifyEmail, siteOrigin } from '$lib/server/mail';
import { fail, redirect, type Actions } from '@sveltejs/kit';

export const load = ({ locals }) => {
	if (locals.user) redirect(303, '/account');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		const password = String(form.get('password') ?? '');
		const emailDaily = form.get('daily') === 'on';
		const keep = { email, emailDaily };

		if (!allowAttempt(`signup:${getClientAddress()}`, 10)) {
			return fail(429, { ...keep, error: 'Too many sign-ups from here. Try again later.' });
		}
		if (!isEmail(email)) return fail(400, { ...keep, error: 'That doesn’t look like an email address.' });
		if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
			return fail(400, { ...keep, error: `Use a password of at least ${PASSWORD_MIN} characters.` });
		}
		if (userByEmail(email)) {
			return fail(409, { ...keep, error: 'There’s already an account for that email.', exists: true });
		}

		const user = await createUser(email, password, emailDaily);
		startSession(cookies, user.id);
		// The daily email only goes to confirmed addresses, so nobody can sign
		// someone else up for it. Confirmation is offered to everyone, though.
		const token = issueToken(user.id, 'verify');
		try {
			await sendVerifyEmail(email, `${siteOrigin()}/verify?token=${token}`);
		} catch (err) {
			console.error('[ethnoguessr] verification email failed:', (err as Error).message);
		}
		redirect(303, '/account?welcome=1');
	}
};
