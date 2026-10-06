import {
	PASSWORD_MAX,
	PASSWORD_MIN,
	allowAttempt,
	checkLogin,
	deleteUser,
	endSession,
	issueToken,
	setEmailDaily,
	setPassword,
	startSession
} from '$lib/server/auth';
import { sendVerifyEmail, siteOrigin } from '$lib/server/mail';
import { userStats } from '$lib/server/results';
import { fail, redirect, type Actions } from '@sveltejs/kit';

export const load = ({ locals, url }) => {
	const user = locals.user;
	if (!user) redirect(303, '/login?next=/account');
	return {
		email: user.email,
		emailVerified: user.emailVerified,
		emailDaily: user.emailDaily,
		stats: userStats(user.id),
		welcome: url.searchParams.has('welcome'),
		reset: url.searchParams.has('reset')
	};
};

export const actions: Actions = {
	daily: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const on = (await request.formData()).get('daily') === 'on';
		setEmailDaily(locals.user.id, on);
		return { saved: 'daily' };
	},

	resend: async ({ locals }) => {
		const user = locals.user;
		if (!user) redirect(303, '/login');
		if (user.emailVerified) return { saved: 'verified' };
		if (!allowAttempt(`resend:${user.id}`, 3)) {
			return fail(429, { error: 'We just sent one. Check your inbox (and spam) first.' });
		}
		const token = issueToken(user.id, 'verify');
		await sendVerifyEmail(user.email, `${siteOrigin()}/verify?token=${token}`);
		return { saved: 'resent' };
	},

	password: async ({ request, locals, cookies }) => {
		const user = locals.user;
		if (!user) redirect(303, '/login');
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');
		if (!allowAttempt(`password:${user.id}`, 8)) {
			return fail(429, { pwError: 'Too many attempts. Try again later.' });
		}
		if (!(await checkLogin(user.email, current))) {
			return fail(400, { pwError: 'Your current password isn’t right.' });
		}
		if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) {
			return fail(400, { pwError: `Use a password of at least ${PASSWORD_MIN} characters.` });
		}
		await setPassword(user.id, next);
		// setPassword signs out every session, this one included; start a fresh one.
		startSession(cookies, user.id);
		return { saved: 'password' };
	},

	delete: async ({ request, locals, cookies }) => {
		const user = locals.user;
		if (!user) redirect(303, '/login');
		const password = String((await request.formData()).get('password') ?? '');
		if (!(await checkLogin(user.email, password))) {
			return fail(400, { delError: 'That password isn’t right.' });
		}
		endSession(cookies);
		deleteUser(user.id);
		redirect(303, '/?deleted=1');
	}
};
