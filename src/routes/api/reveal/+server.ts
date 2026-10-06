import { reveal } from '$lib/server/rounds';
import { error, json } from '@sveltejs/kit';

/** Answers stay on the server until a guess is made. */
export const POST = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		pid?: unknown;
		lat?: unknown;
		lng?: unknown;
	} | null;
	const { pid, lat, lng } = body ?? {};
	if (
		typeof pid !== 'string' ||
		typeof lat !== 'number' ||
		typeof lng !== 'number' ||
		Math.abs(lat) > 90 ||
		Math.abs(lng) > 180
	) {
		error(400, 'Bad guess');
	}

	const result = reveal(pid, lat, lng);
	if (!result) error(404, 'Unknown round');
	return json(result);
};
