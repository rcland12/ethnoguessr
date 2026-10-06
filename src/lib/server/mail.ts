import { env } from '$env/dynamic/private';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Mail goes to an SMTP relay (SMTP_HOST), unauthenticated: the relay is
 * expected to trust the app's network. With no SMTP_HOST, emails are printed
 * to the console instead, which is how links are followed in development.
 */
let transport: Transporter | null = null;

export const mailEnabled = () => !!env.SMTP_HOST;

/** Absolute base URL for links in emails. */
export function siteOrigin(): string {
	return (env.ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function getTransport(): Transporter {
	transport ??= nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT || 25),
		secure: false,
		// A local relay usually offers STARTTLS with a self-signed cert.
		tls: { rejectUnauthorized: false },
		pool: true,
		maxConnections: 2
	});
	return transport;
}

interface Message {
	to: string;
	subject: string;
	text: string;
	html: string;
	headers?: Record<string, string>;
}

async function send(m: Message) {
	if (!mailEnabled()) {
		console.log(`[ethnoguessr] email (SMTP_HOST unset, not sent)\n  to: ${m.to}\n  subject: ${m.subject}\n${m.text.replace(/^/gm, '  | ')}`);
		return;
	}
	await getTransport().sendMail({
		from: env.EMAIL_FROM || `Ethnoguessr 2.0 <no-reply@${new URL(siteOrigin()).hostname}>`,
		...m
	});
}

export function escapeHtml(s: string): string {
	return s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);
}

// Same palette as the site: parchment, sea-green ink, terracotta pin.
function layout(body: string, footer: string): string {
	return `<!doctype html><html><body style="margin:0;background:#ece4d2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2b2a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ece4d2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#f6f1e6;border-radius:14px;overflow:hidden;border:1px solid #ddd2bb">
<tr><td style="padding:18px 24px;border-bottom:1px solid #ddd2bb">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#1d2b2a">Ethnoguessr</span>
<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#c4552d"> 2.0</span>
</td></tr>
<tr><td style="padding:24px">${body}</td></tr>
</table>
<div style="max-width:520px;padding:14px 8px;font-size:12px;color:#6f7d79;line-height:1.5">${footer}</div>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
	return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#1d2b2a;color:#f6f1e6;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${escapeHtml(label)}</a>`;
}

function linkFallback(link: string): string {
	return `<p style="margin:16px 0 0;font-size:12px;color:#6f7d79;word-break:break-all">Or paste this into your browser:<br>${escapeHtml(link)}</p>`;
}

export async function sendVerifyEmail(to: string, link: string) {
	await send({
		to,
		subject: 'Confirm your email for Ethnoguessr 2.0',
		text: `Confirm your email to get the daily Ethnoguessr in your inbox each morning:\n\n${link}\n\nThe link expires in 7 days. If you didn't sign up, ignore this email.`,
		html: layout(
			`<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px">Confirm your email</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55">One click and the daily game starts landing in your inbox each morning.</p>
<p style="margin:0">${button(link, 'Confirm email')}</p>${linkFallback(link)}`,
			`Someone signed up at ${escapeHtml(siteOrigin())} with this address. If it wasn't you, ignore this email and nothing will be sent.`
		)
	});
}

export async function sendResetEmail(to: string, link: string) {
	await send({
		to,
		subject: 'Reset your Ethnoguessr 2.0 password',
		text: `Reset your password:\n\n${link}\n\nThe link works once and expires in 1 hour. If you didn't ask for it, ignore this email.`,
		html: layout(
			`<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px">Reset your password</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55">The link works once and expires in an hour.</p>
<p style="margin:0">${button(link, 'Choose a new password')}</p>${linkFallback(link)}`,
			`Someone asked to reset the password for this address at ${escapeHtml(siteOrigin())}. If it wasn't you, ignore this email; your password hasn't changed.`
		)
	});
}

export interface DailyEmail {
	to: string;
	dateLabel: string;
	faceUrl: string | null;
	faceCaption: string;
	playUrl: string;
	unsubscribeUrl: string;
	streak: number;
}

export async function sendDailyEmail(m: DailyEmail) {
	const face = m.faceUrl
		? `<a href="${escapeHtml(m.playUrl)}"><img src="${escapeHtml(m.faceUrl)}" alt="Today's first face" width="280" style="display:block;width:280px;max-width:100%;height:auto;border-radius:12px;margin:0 auto 10px;border:1px solid #ddd2bb"></a>
<p style="margin:0 0 20px;text-align:center;font-size:13px;color:#6f7d79">${escapeHtml(m.faceCaption)}</p>`
		: '';
	const streak =
		m.streak > 0
			? `<p style="margin:0 0 16px;font-size:14px;color:#3d4f4d">You're on a ${m.streak}-day streak. Keep it going.</p>`
			: '';
	await send({
		to: m.to,
		subject: `Today's Ethnoguessr: ${m.dateLabel}`,
		text: `Today's Ethnoguessr is ready: five faces, five pins.\n\nPlay: ${m.playUrl}\n\nUnsubscribe: ${m.unsubscribeUrl}`,
		html: layout(
			`<p style="margin:0 0 4px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8892f">${escapeHtml(m.dateLabel)}</p>
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:24px">Where were they born?</h1>
${face}
<p style="margin:0 0 16px;font-size:15px;line-height:1.55">Five composite faces, five pins on the map. Same rounds for everyone today.</p>
${streak}
<p style="margin:0">${button(m.playUrl, 'Play today’s game')}</p>`,
			`You get this because you asked for the daily game at ${escapeHtml(siteOrigin())}. <a href="${escapeHtml(m.unsubscribeUrl)}" style="color:#6f7d79">Unsubscribe</a>.`
		),
		// No List-Unsubscribe-Post (RFC 8058 one-click): SvelteKit's CSRF check
		// rejects the mail provider's origin-less POST. The link leads to a
		// one-button page instead.
		headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>` }
	});
}
