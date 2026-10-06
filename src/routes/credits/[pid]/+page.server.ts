import { credits } from '$lib/server/rounds';
import { error } from '@sveltejs/kit';

export const load = ({ params }) => {
	const c = credits(params.pid);
	if (!c) error(404, 'Unknown round');
	return c;
};
