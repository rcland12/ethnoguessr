import { saveDailyResult, type Guess } from '$lib/server/results';
import { error, json } from '@sveltejs/kit';

/** Signed-in players' finished dailies. Scores are recomputed server-side. */
export const POST = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to save results');
	const body = (await request.json().catch(() => null)) as { day?: unknown; guesses?: unknown } | null;
	const guesses = body?.guesses;
	if (
		typeof body?.day !== 'string' ||
		!Array.isArray(guesses) ||
		guesses.length > 20 ||
		!guesses.every(
			(g: Guess) =>
				typeof g?.pid === 'string' &&
				typeof g.lat === 'number' &&
				typeof g.lng === 'number' &&
				Math.abs(g.lat) <= 90 &&
				Math.abs(g.lng) <= 180
		)
	) {
		error(400, 'Bad result');
	}
	const played = saveDailyResult(locals.user.id, body.day, guesses as Guess[]);
	if (!played) error(409, 'Not today’s rounds');
	return json({ ok: true, total: played.reduce((s, r) => s + r.score, 0) });
};
