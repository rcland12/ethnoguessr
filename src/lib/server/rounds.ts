import { env } from '$env/dynamic/private';
import { haversineKm, scoreFor } from '$lib/geo';
import { hashString, mulberry32, shuffled } from '$lib/seed';
import type { Credit, Manifest, ManifestRound, Reveal, RoundStub } from '$lib/types';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { sessionSecret } from './secret';

export const DAILY_ROUNDS = 5;

/** The calendar day the daily puzzle follows. Everyone rolls over together. */
export const DAILY_TZ = env.DAILY_TZ || 'America/New_York';

/**
 * The published data directory, or the bundled demo when the pipeline has not
 * published anything yet. Both are resolved per call so a pipeline publish is
 * picked up without restarting the app.
 */
function dataDir(): string {
	const configured = resolve(env.DATA_DIR || 'data/public');
	if (existsSync(resolve(configured, 'rounds.json'))) return configured;
	return resolve('demo');
}

interface Loaded {
	dir: string;
	mtimeMs: number;
	manifest: Manifest;
	byPid: Map<string, ManifestRound>;
	pidById: Map<string, string>;
}

let loaded: Loaded | null = null;

function publicId(id: string): string {
	return createHmac('sha256', sessionSecret()).update(`round:${id}`).digest('base64url').slice(0, 16);
}

function load(): Loaded {
	const dir = dataDir();
	const file = resolve(dir, 'rounds.json');
	const { mtimeMs } = statSync(file);
	if (loaded && loaded.dir === dir && loaded.mtimeMs === mtimeMs) return loaded;

	const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
	const byPid = new Map<string, ManifestRound>();
	const pidById = new Map<string, string>();
	for (const round of manifest.rounds) {
		const pid = publicId(round.id);
		byPid.set(pid, round);
		pidById.set(round.id, pid);
	}
	loaded = { dir, mtimeMs, manifest, byPid, pidById };
	console.log(`[ethnoguessr] loaded ${manifest.rounds.length} rounds from ${dir}`);
	return loaded;
}

function stub(l: Loaded, round: ManifestRound): RoundStub {
	return { pid: l.pidById.get(round.id)!, sex: round.sex, n: round.n };
}

export function isDemo(): boolean {
	return !!load().manifest.demo;
}

export function roundCount(): number {
	return load().manifest.rounds.length;
}

export function todayKey(now = new Date()): string {
	// en-CA formats as YYYY-MM-DD.
	return new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TZ }).format(now);
}

/**
 * Same rounds for everyone on a given day. At most one round per place, so a
 * day never shows both the male and female composite of one country.
 */
export function dailyRounds(day: string): RoundStub[] {
	const l = load();
	const picked: ManifestRound[] = [];
	const places = new Set<string>();
	for (const round of shuffled(l.manifest.rounds, mulberry32(hashString(`daily:${day}`)))) {
		const place = round.region ?? round.country;
		if (places.has(place)) continue;
		places.add(place);
		picked.push(round);
		if (picked.length === DAILY_ROUNDS) break;
	}
	return picked.map((r) => stub(l, r));
}

/** A few random faces for the home page. Stubs only, so no answers leak. */
export function sampleFaces(count: number): RoundStub[] {
	const l = load();
	return shuffled(l.manifest.rounds)
		.slice(0, count)
		.map((r) => stub(l, r));
}

export function endlessRounds(): RoundStub[] {
	const l = load();
	return shuffled(l.manifest.rounds).map((r) => stub(l, r));
}

export function reveal(pid: string, lat: number, lng: number): Reveal | null {
	const l = load();
	const round = l.byPid.get(pid);
	if (!round) return null;
	const distanceKm = haversineKm(lat, lng, round.lat, round.lng);
	return {
		pid,
		label: round.label,
		country: round.country,
		lat: round.lat,
		lng: round.lng,
		n: round.n,
		sex: round.sex,
		radiusKm: round.radiusKm ?? 0,
		distanceKm,
		score: scoreFor(distanceKm, round.radiusKm),
		hasCredits: !!round.credits
	};
}

/** Absolute path of a round's composite, guarded against path traversal. */
export function facePath(pid: string): string | null {
	const l = load();
	const round = l.byPid.get(pid);
	if (!round) return null;
	const facesDir = resolve(l.dir, 'faces');
	const file = resolve(facesDir, round.image);
	return file.startsWith(facesDir + '/') ? file : null;
}

export function credits(pid: string): { label: string; n: number; credits: Credit[] } | null {
	const l = load();
	const round = l.byPid.get(pid);
	if (!round) return null;
	let list: Credit[] = [];
	if (round.credits) {
		const creditsDir = resolve(l.dir, 'credits');
		const file = resolve(creditsDir, round.credits);
		if (file.startsWith(creditsDir + '/') && existsSync(file)) {
			list = JSON.parse(readFileSync(file, 'utf8')) as Credit[];
		}
	}
	return { label: round.label, n: round.n, credits: list };
}
