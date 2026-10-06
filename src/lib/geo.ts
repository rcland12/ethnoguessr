export const MAX_SCORE = 5000;

/** Distance at which a guess is worth 1/e of full points. */
const SCORE_SCALE_KM = 1500;

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** GeoGuessr-style exponential falloff; anything inside `radiusKm` is perfect. */
export function scoreFor(distanceKm: number, radiusKm = 0): number {
	if (distanceKm <= radiusKm) return MAX_SCORE;
	return Math.round(MAX_SCORE * Math.exp(-(distanceKm - radiusKm) / SCORE_SCALE_KM));
}

export type Tier = 'great' | 'good' | 'meh' | 'bad';

export function tierFor(score: number): Tier {
	if (score >= 4000) return 'great';
	if (score >= 2000) return 'good';
	if (score >= 500) return 'meh';
	return 'bad';
}

export const TIER_EMOJI: Record<Tier, string> = {
	great: '🟩',
	good: '🟨',
	meh: '🟧',
	bad: '🟥'
};

export function formatKm(km: number): string {
	if (km < 1) return '< 1 km';
	if (km < 100) return `${km.toFixed(1)} km`;
	return `${Math.round(km).toLocaleString()} km`;
}
