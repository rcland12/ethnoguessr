import { endSession } from '$lib/server/auth';
import { redirect, type Actions } from '@sveltejs/kit';

export const load = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		endSession(cookies);
		redirect(303, '/');
	}
};
