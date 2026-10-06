import { markVerified, useToken } from '$lib/server/auth';

export const load = ({ url }) => {
	const userId = useToken(url.searchParams.get('token') ?? '', 'verify');
	if (userId) markVerified(userId);
	return { ok: userId !== null };
};
