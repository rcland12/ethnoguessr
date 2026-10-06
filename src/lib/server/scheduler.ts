import { env } from '$env/dynamic/private';
import { dailySubscribers, purgeExpired } from './auth';
import { getDb, now } from './db';
import { mailEnabled, sendDailyEmail, siteOrigin } from './mail';
import { userStats } from './results';
import { DAILY_TZ, dailyRounds, todayKey } from './rounds';

/** Local hour (DAILY_TZ) the morning email goes out. */
const EMAIL_HOUR = Number(env.EMAIL_HOUR || 7);
/** A late start still sends today's email within this many hours. */
const EMAIL_WINDOW_HOURS = 4;

const SEX_WORD = { m: 'men', f: 'women', mixed: 'people' } as const;

function localHour(): number {
	return Number(
		new Intl.DateTimeFormat('en-US', { timeZone: DAILY_TZ, hour: 'numeric', hourCycle: 'h23' }).format(
			new Date()
		)
	);
}

function longDate(day: string): string {
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${day}T12:00:00Z`));
}

/** Sends today's email to every confirmed subscriber, once per day however often it runs. */
export async function runDailyEmail(force = false) {
	const hour = localHour();
	if (!force && (hour < EMAIL_HOUR || hour >= EMAIL_HOUR + EMAIL_WINDOW_HOURS)) return;

	const day = todayKey();
	const rounds = dailyRounds(day);
	if (rounds.length === 0) return;

	const db = getDb();
	const claim = db
		.prepare('insert into email_runs (day, started_at) values (?, ?) on conflict do nothing returning day')
		.get(day, now());
	if (!claim) return;

	const origin = siteOrigin();
	const first = rounds[0];
	let sent = 0;
	let failed = 0;
	for (const user of dailySubscribers()) {
		try {
			await sendDailyEmail({
				to: user.email,
				dateLabel: longDate(day),
				faceUrl: `${origin}/api/face/${first.pid}`,
				faceCaption: `Round 1: the average of ${first.n} ${SEX_WORD[first.sex]} born in the same place.`,
				playUrl: `${origin}/play`,
				unsubscribeUrl: `${origin}/unsubscribe?token=${user.unsubscribeToken}`,
				streak: userStats(user.id, day).streak
			});
			sent++;
		} catch (err) {
			failed++;
			console.error(`[ethnoguessr] daily email to user ${user.id} failed:`, (err as Error).message);
		}
		// Gentle on the relay (upstream providers rate-limit bursts).
		await new Promise((r) => setTimeout(r, 300));
	}
	db.prepare('update email_runs set finished_at = ?, sent = ?, failed = ? where day = ?').run(
		now(),
		sent,
		failed,
		day
	);
	console.log(`[ethnoguessr] daily email ${day}: ${sent} sent, ${failed} failed`);
}

let started = false;

/** Background jobs in the web process. Started once from hooks.server.ts. */
export function startScheduler() {
	if (started) return;
	started = true;
	const safely = (name: string, fn: () => unknown) => async () => {
		try {
			await fn();
		} catch (err) {
			console.error(`[ethnoguessr] job ${name} failed:`, err);
		}
	};
	if (env.EMAIL_DAILY !== 'off') {
		if (!mailEnabled()) console.log('[ethnoguessr] SMTP_HOST unset: daily emails will be logged, not sent');
		setInterval(safely('daily_email', () => runDailyEmail()), 60_000).unref();
	}
	setInterval(safely('purge', purgeExpired), 60 * 60_000).unref();
}
