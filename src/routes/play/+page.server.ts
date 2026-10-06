import { dailyResult } from '$lib/server/results';
import { dailyRounds, endlessRounds, todayKey } from '$lib/server/rounds';

export const load = ({ url, locals }) => {
	const mode = url.searchParams.get('mode') === 'endless' ? 'endless' : 'daily';
	const day = todayKey();
	return {
		mode,
		day,
		rounds: mode === 'daily' ? dailyRounds(day) : endlessRounds(),
		signedIn: !!locals.user,
		// A daily already finished on another device.
		saved: mode === 'daily' && locals.user ? dailyResult(locals.user.id, day) : null
	} as const;
};
