/**
 * The contract between the data pipeline and the site. The pipeline writes
 * `rounds.json` in DATA_DIR; everything else the site knows about a round
 * comes from here. See PLAN.md > Data contract.
 */

export type Sex = 'm' | 'f' | 'mixed';

/** One composite as the pipeline publishes it. Never sent to the browser. */
export interface ManifestRound {
	/** Stable, human-readable id, e.g. `NG-m` or `IN-KL-f`. Not shown to players. */
	id: string;
	/** The answer as shown on reveal, e.g. "Nigeria" or "Kerala, India". */
	label: string;
	/** ISO 3166-1 alpha-2 country code. */
	country: string;
	/** ISO 3166-2 subdivision code when the round is sub-national. */
	region?: string;
	/** Answer point: population-weighted centroid of the birthplaces used. */
	lat: number;
	lng: number;
	/** Guesses within this many km of the answer score full points. */
	radiusKm?: number;
	sex: Sex;
	/** Number of faces averaged into the composite. */
	n: number;
	/** Image file, relative to DATA_DIR/faces. */
	image: string;
	/** Attribution list, relative to DATA_DIR/credits. */
	credits?: string;
}

export interface Manifest {
	version: 1;
	generated: string;
	/** Placeholder data: the UI says so. */
	demo?: boolean;
	rounds: ManifestRound[];
}

/** What a player sees before guessing. `pid` is opaque so it can't leak the answer. */
export interface RoundStub {
	pid: string;
	sex: Sex;
	n: number;
}

export interface Reveal {
	pid: string;
	label: string;
	country: string;
	lat: number;
	lng: number;
	n: number;
	sex: Sex;
	/** Full-points radius around the answer (0 if none). */
	radiusKm: number;
	distanceKm: number;
	score: number;
	hasCredits: boolean;
}

/** One credit line for a source photo (CC licenses require attribution). */
export interface Credit {
	name?: string;
	author: string;
	license: string;
	licenseUrl?: string;
	sourceUrl: string;
}
