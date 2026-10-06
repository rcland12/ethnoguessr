import { roundCount } from '$lib/server/rounds';
import { json } from '@sveltejs/kit';

export const GET = () => json({ ok: true, rounds: roundCount() });
