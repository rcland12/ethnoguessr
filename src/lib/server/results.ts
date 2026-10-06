import { streak } from '$lib/progress';
import type { PlayedRound } from '$lib/progress';
import { getDb, now } from './db';
import { dailyRounds, reveal, todayKey } from './rounds';

export interface Guess {
	pid: string;
	lat: number;
	lng: number;
}

/**
 * Saves a signed-in player's finished daily. Scores are recomputed here from
 * the guesses, never taken from the browser, and only the first finished
 * result for a day counts.
 */
export function saveDailyResult(userId: number, day: string, guesses: Guess[]): PlayedRound[] | null {
	if (day !== todayKey()) return null;
	const pids = dailyRounds(day).map((r) => r.pid);
	if (guesses.length !== pids.length || guesses.some((g, i) => g.pid !== pids[i])) return null;

	const played: PlayedRound[] = [];
	for (const g of guesses) {
		const r = reveal(g.pid, g.lat, g.lng);
		if (!r) return null;
		played.push({ ...r, guessLat: g.lat, guessLng: g.lng });
	}
	const total = played.reduce((s, r) => s + r.score, 0);
	getDb()
		.prepare(
			`insert into results (user_id, day, total, rounds, created_at) values (?, ?, ?, ?, ?)
			 on conflict (user_id, day) do nothing`
		)
		.run(userId, day, total, JSON.stringify(played), now());
	return dailyResult(userId, day);
}

export function dailyResult(userId: number, day: string): PlayedRound[] | null {
	const r = getDb()
		.prepare('select rounds from results where user_id = ? and day = ?')
		.get(userId, day) as { rounds: string } | undefined;
	return r ? (JSON.parse(r.rounds) as PlayedRound[]) : null;
}

export interface UserStats {
	played: number;
	streak: number;
	best: number | null;
	today: number | null;
}

export function userStats(userId: number, today = todayKey()): UserStats {
	const rows = getDb()
		.prepare('select day, total from results where user_id = ? order by day desc')
		.all(userId) as { day: string; total: number }[];
	return {
		played: rows.length,
		streak: streak(
			rows.map((r) => r.day),
			today
		),
		best: rows.length ? Math.max(...rows.map((r) => r.total)) : null,
		today: rows.find((r) => r.day === today)?.total ?? null
	};
}
