import { facePath } from '$lib/server/rounds';
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const TYPES: Record<string, string> = {
	'.webp': 'image/webp',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.svg': 'image/svg+xml'
};

export const GET = async ({ params }) => {
	const file = facePath(params.pid);
	const type = file && TYPES[extname(file).toLowerCase()];
	if (!file || !type) error(404, 'Not found');

	const body = await readFile(file).catch(() => null);
	if (!body) error(404, 'Not found');

	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': type,
			// pids are stable while SESSION_SECRET is. private: shared caches mustn't
			// store faces when the passcode gate is on.
			'cache-control': 'private, max-age=86400'
		}
	});
};
