import { isDemo } from '$lib/server/rounds';

export const load = ({ locals }) => ({
	authed: locals.authed,
	user: locals.user ? { email: locals.user.email } : null,
	demo: locals.authed ? isDemo() : false
});
