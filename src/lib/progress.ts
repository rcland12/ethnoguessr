import { browser } from '$app/environment';
import type { Reveal } from './types';

/** A finished round as the browser remembers it. */
export interface PlayedRound extends Reveal {
	guessLat: number;
	guessLng: number;
}

export interface DailyProgress {
	day: string;
	/** pids of the day's rounds, so a manifest change mid-day starts fresh. */
	pids: string[];
	played: PlayedRound[];
}

const dailyKey = (day: string) => `eg:daily:${day}`;

// localStorage can throw (private windows, blocked storage); progress is a
// convenience, so failures just mean nothing is remembered.
function read<T>(key: string): T | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function write(key: string, value: unknown) {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* ignore */
	}
}

export function loadDaily(day: string, pids: string[]): DailyProgress {
	const saved = read<DailyProgress>(dailyKey(day));
	if (saved && saved.pids.join() === pids.join()) return saved;
	return { day, pids, played: [] };
}

export function saveDaily(progress: DailyProgress) {
	write(dailyKey(progress.day), progress);
}

export function dailyTotal(progress: DailyProgress): number {
	return progress.played.reduce((sum, r) => sum + r.score, 0);
}

/** Days with a finished daily, newest first, for the home page streak. */
export function finishedDays(): { day: string; total: number }[] {
	if (!browser) return [];
	const out: { day: string; total: number }[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key?.startsWith('eg:daily:')) continue;
			const p = read<DailyProgress>(key);
			if (p && p.played.length > 0 && p.played.length === p.pids.length) {
				out.push({ day: p.day, total: dailyTotal(p) });
			}
		}
	} catch {
		return [];
	}
	return out.sort((a, b) => b.day.localeCompare(a.day));
}

/** Consecutive finished days ending today (or yesterday, if today isn't done yet). */
export function streak(days: string[], today: string): number {
	const done = new Set(days);
	const d = new Date(`${today}T12:00:00Z`);
	if (!done.has(today)) d.setUTCDate(d.getUTCDate() - 1);
	let n = 0;
	while (done.has(d.toISOString().slice(0, 10))) {
		n++;
		d.setUTCDate(d.getUTCDate() - 1);
	}
	return n;
}
