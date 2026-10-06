import { unsubscribe } from '$lib/server/auth';
import type { Actions } from '@sveltejs/kit';

// GET only shows a button: mail scanners prefetch links, and a GET that
// unsubscribed would sign people out of the email without them clicking.
export const load = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions: Actions = {
	default: async ({ request }) => {
		const token = String((await request.formData()).get('token') ?? '');
		return { done: token ? unsubscribe(token) : false };
	}
};
