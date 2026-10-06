<script lang="ts">
	import { onMount } from 'svelte';
	import GuessMap from './GuessMap.svelte';
	import Summary from './Summary.svelte';
	import { MAX_SCORE, formatKm, tierFor } from '$lib/geo';
	import Flag from './Flag.svelte';
	import { loadDaily, saveDaily, type PlayedRound } from '$lib/progress';
	import type { Reveal, RoundStub, Sex } from '$lib/types';

	let {
		mode,
		day,
		rounds,
		signedIn = false,
		saved = null
	}: {
		mode: 'daily' | 'endless';
		day: string;
		rounds: RoundStub[];
		signedIn?: boolean;
		/** Today's daily as saved on the account, if finished on another device. */
		saved?: PlayedRound[] | null;
	} = $props();

	let played = $state<PlayedRound[]>([]);
	let guess = $state<{ lat: number; lng: number } | null>(null);
	let current = $state<Reveal | null>(null);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let ready = $state(false);

	let syncState = $state<'idle' | 'saving' | 'saved' | 'failed'>('idle');

	onMount(() => {
		if (mode === 'daily') {
			const pids = rounds.map((r) => r.pid);
			if (saved && saved.length === rounds.length) {
				played = saved;
				saveDaily({ day, pids, played: saved });
				syncState = 'saved';
			} else {
				played = loadDaily(day, pids).played;
				// Finished here before signing in: put it on the account now.
				if (signedIn && played.length === rounds.length) void syncResult();
			}
		}
		ready = true;
	});

	async function syncResult() {
		if (!signedIn || mode !== 'daily') return;
		syncState = 'saving';
		try {
			const res = await fetch('/api/results', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					day,
					guesses: played.map((r) => ({ pid: r.pid, lat: r.guessLat, lng: r.guessLng }))
				})
			});
			syncState = res.ok ? 'saved' : 'failed';
		} catch {
			syncState = 'failed';
		}
	}

	// While a round is revealed it is still "current", so the index lags by one.
	const index = $derived(current ? played.length - 1 : played.length);
	const round = $derived(rounds.length ? rounds[index % rounds.length] : null);
	const nextRound = $derived(rounds.length ? rounds[(index + 1) % rounds.length] : null);
	const finished = $derived(mode === 'daily' && !current && played.length >= rounds.length);
	const total = $derived(played.reduce((sum, r) => sum + r.score, 0));

	const SEX_WORD: Record<Sex, string> = { m: 'men', f: 'women', mixed: 'people' };

	async function submit() {
		if (!round || !guess || current || submitting) return;
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/reveal', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pid: round.pid, lat: guess.lat, lng: guess.lng })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const reveal = (await res.json()) as Reveal;
			current = reveal;
			played.push({ ...reveal, guessLat: guess.lat, guessLng: guess.lng });
			if (mode === 'daily') {
				saveDaily({ day, pids: rounds.map((r) => r.pid), played: $state.snapshot(played) });
				if (played.length === rounds.length) void syncResult();
			}
		} catch (e) {
			error = 'Couldn’t check that guess. Try again?';
			console.error(e);
		} finally {
			submitting = false;
		}
	}

	function next() {
		current = null;
		guess = null;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		if ((e.target as HTMLElement)?.closest('button, a, input, textarea')) return;
		e.preventDefault();
		if (current) next();
		else submit();
	}

	const TIER_TEXT = {
		great: 'text-tier-great',
		good: 'text-tier-good',
		meh: 'text-tier-meh',
		bad: 'text-tier-bad'
	};
	const TIER_BG = {
		great: 'bg-tier-great',
		good: 'bg-tier-good',
		meh: 'bg-tier-meh',
		bad: 'bg-tier-bad'
	};
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	{#if nextRound && !finished}
		<link rel="preload" as="image" href="/api/face/{nextRound.pid}" />
	{/if}
</svelte:head>

{#if !ready}
	<div class="flex-1"></div>
{:else if rounds.length === 0}
	<div class="mx-auto max-w-md px-4 py-20 text-center">
		<h1 class="font-serif text-2xl font-semibold">No rounds yet</h1>
		<p class="mt-2 text-ink-soft">The data pipeline hasn’t published any composites.</p>
	</div>
{:else if finished}
	<Summary {day} {played} {signedIn} {syncState} />
{:else if round}
	<div
		class="grid flex-1 grid-rows-[auto_minmax(55vh,1fr)] lg:grid-cols-[400px_1fr] lg:grid-rows-1"
	>
		<!-- Face + controls -->
		<aside class="flex flex-col gap-4 border-line p-4 lg:overflow-y-auto lg:border-r">
			<div class="flex items-baseline justify-between text-sm">
				<span class="font-medium">
					{#if mode === 'daily'}
						Round {index + 1} / {rounds.length}
					{:else}
						Round {index + 1}
					{/if}
				</span>
				<span class="text-ink-soft">
					<span class="font-semibold text-ink tabular-nums">{total.toLocaleString()}</span> pts
				</span>
			</div>

			<div class="relative mx-auto w-full max-w-[180px] sm:max-w-[260px] lg:max-w-none">
				<!-- {#key} so the old face never shows under the new round's answer -->
				{#key round.pid}
					<img
						src="/api/face/{round.pid}"
						alt="Composite face for this round"
						class="aspect-square w-full rounded-2xl border border-line bg-paper-2 object-cover shadow-sm"
					/>
				{/key}
			</div>
			<p class="text-center text-sm text-ink-soft">
				The average of <span class="font-semibold text-ink">{round.n}</span>
				{SEX_WORD[round.sex]} born in the same place.
			</p>

			{#if current}
				{@const tier = tierFor(current.score)}
				<div class="rounded-2xl border border-line bg-white/60 p-4">
					<p class="text-xs tracking-widest text-muted uppercase">They were born in</p>
					<p class="mt-1 font-serif text-2xl font-semibold">
						<Flag code={current.country} class="mr-1.5" />{current.label}
					</p>
					<div class="mt-3 flex items-baseline justify-between">
						<span class="text-ink-soft">{formatKm(current.distanceKm)} away</span>
						<span class="font-serif text-2xl font-semibold tabular-nums {TIER_TEXT[tier]}">
							+{current.score.toLocaleString()}
						</span>
					</div>
					<div class="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
						<div
							class="h-full rounded-full transition-[width] duration-700 {TIER_BG[tier]}"
							style:width="{(current.score / MAX_SCORE) * 100}%"
						></div>
					</div>
					{#if current.hasCredits}
						<a
							href="/credits/{current.pid}"
							target="_blank"
							class="mt-3 inline-block text-xs text-muted underline hover:text-ink"
							>Photo credits</a
						>
					{/if}
				</div>
				<button
					onclick={next}
					class="rounded-xl bg-ink px-4 py-3 font-medium text-paper transition hover:bg-ink-soft"
				>
					{mode === 'daily' && played.length >= rounds.length ? 'See results' : 'Next round'}
				</button>
			{:else}
				<button
					onclick={submit}
					disabled={!guess || submitting}
					class="rounded-xl bg-pin px-4 py-3 font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-muted"
				>
					{#if submitting}
						Checking…
					{:else if guess}
						Guess
					{:else}
						Click the map to drop a pin
					{/if}
				</button>
				{#if error}<p class="text-center text-sm text-pin">{error}</p>{/if}
			{/if}
			<p class="hidden text-center text-xs text-muted lg:block">
				Enter / Space to {current ? 'continue' : 'guess'}
			</p>
		</aside>

		<!-- Map -->
		<section class="relative min-h-[55vh]">
			<GuessMap
				bind:guess
				answer={current
					? { lat: current.lat, lng: current.lng, radiusKm: current.radiusKm }
					: null}
				locked={!!current}
			/>
		</section>
	</div>
{/if}
