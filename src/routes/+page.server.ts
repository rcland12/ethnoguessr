import { DAILY_ROUNDS, roundCount, sampleFaces, todayKey } from '$lib/server/rounds';

export const load = () => ({
	day: todayKey(),
	dailyRounds: DAILY_ROUNDS,
	total: roundCount(),
	faces: sampleFaces(7)
});
