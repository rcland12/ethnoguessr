<script lang="ts">
	import { MAX_SCORE, TIER_EMOJI, formatKm, tierFor } from '$lib/geo';
	import Flag from './Flag.svelte';
	import type { PlayedRound } from '$lib/progress';

	let {
		day,
		played,
		signedIn = false,
		syncState = 'idle'
	}: {
		day: string;
		played: PlayedRound[];
		signedIn?: boolean;
		syncState?: 'idle' | 'saving' | 'saved' | 'failed';
	} = $props();

	const total = $derived(played.reduce((sum, r) => sum + r.score, 0));
	const max = $derived(played.length * MAX_SCORE);

	let copied = $state(false);

	function shareText(): string {
		const squares = played.map((r) => TIER_EMOJI[tierFor(r.score)]).join('');
		return `Ethnoguessr 2.0 · ${day}\n${squares} ${total.toLocaleString()} / ${max.toLocaleString()}\n${location.origin}`;
	}

	async function share() {
		const text = shareText();
		try {
			if (navigator.share && matchMedia('(pointer: coarse)').matches) {
				await navigator.share({ text });
				return;
			}
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* share sheet dismissed */
		}
	}

	const TIER_BG = {
		great: 'bg-tier-great',
		good: 'bg-tier-good',
		meh: 'bg-tier-meh',
		bad: 'bg-tier-bad'
	};
</script>

<section class="mx-auto w-full max-w-2xl px-4 py-12">
	<p class="text-sm tracking-widest text-brass uppercase">Daily · {day}</p>
	<h1 class="mt-2 font-serif text-5xl font-semibold tabular-nums">
		{total.toLocaleString()}
		<span class="text-2xl text-muted">/ {max.toLocaleString()}</span>
	</h1>

	<ol class="mt-8 divide-y divide-line rounded-2xl border border-line bg-white/50">
		{#each played as r, i (r.pid)}
			{@const tier = tierFor(r.score)}
			<li class="flex items-center gap-4 p-4">
				<img
					src="/api/face/{r.pid}"
					alt=""
					class="h-14 w-14 shrink-0 rounded-lg border border-line object-cover"
				/>
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium">{i + 1}. <Flag code={r.country} class="mx-1" />{r.label}</p>
					<p class="text-sm text-muted">{formatKm(r.distanceKm)} away</p>
				</div>
				<div class="flex items-center gap-2">
					<span class="h-3 w-3 rounded-sm {TIER_BG[tier]}"></span>
					<span class="w-14 text-right font-semibold tabular-nums">{r.score.toLocaleString()}</span>
				</div>
			</li>
		{/each}
	</ol>

	<div class="mt-8 flex flex-wrap gap-3">
		<button
			onclick={share}
			class="rounded-xl bg-ink px-5 py-3 font-medium text-paper transition hover:bg-ink-soft"
		>
			{copied ? 'Copied!' : 'Share result'}
		</button>
		<a
			href="/play?mode=endless"
			class="rounded-xl border border-line px-5 py-3 font-medium transition hover:bg-paper-2"
			>Keep playing (endless)</a
		>
	</div>
	<p class="mt-4 text-sm text-muted">
		A new daily arrives at midnight Eastern.
		{#if signedIn}
			{#if syncState === 'saved'}Saved to your account.{:else if syncState === 'saving'}Saving…{:else if syncState === 'failed'}Couldn’t save to your account.{/if}
		{/if}
	</p>

	{#if !signedIn}
		<div class="mt-8 rounded-2xl border border-line bg-white/50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
			<div>
				<p class="font-serif text-lg font-semibold">Keep your streak</p>
				<p class="text-sm text-ink-soft">
					Make a free account to save scores on any device, and get the daily game by email each morning.
				</p>
			</div>
			<a href="/signup" class="mt-4 inline-block shrink-0 rounded-xl bg-pin px-5 py-3 font-medium text-white hover:brightness-110 sm:mt-0">
				Sign up
			</a>
		</div>
	{/if}
</section>
