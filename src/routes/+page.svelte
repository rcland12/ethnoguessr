<script lang="ts">
	import { onMount } from 'svelte';
	import { MAX_SCORE } from '$lib/geo';
	import { finishedDays, streak } from '$lib/progress';

	let { data } = $props();

	let todayTotal = $state<number | null>(null);
	let streakDays = $state(0);
	let best = $state<number | null>(null);

	onMount(() => {
		const days = finishedDays();
		todayTotal = days.find((d) => d.day === data.day)?.total ?? null;
		streakDays = streak(
			days.map((d) => d.day),
			data.day
		);
		best = days.length ? Math.max(...days.map((d) => d.total)) : null;
	});

	const maxDaily = $derived(data.dailyRounds * MAX_SCORE);
</script>

<svelte:head>
	<title>Ethnoguessr 2.0</title>
</svelte:head>

<section class="mx-auto w-full max-w-5xl px-4 py-12 sm:py-20">
	<p class="text-sm font-medium tracking-widest text-brass uppercase">A face. A map. One guess.</p>
	<h1 class="mt-3 max-w-3xl font-serif text-4xl leading-tight font-semibold sm:text-6xl">
		Where were these people born?
	</h1>
	<p class="mt-5 max-w-2xl text-lg text-ink-soft">
		Every round is one composite face, averaged from dozens of people born in the same place. Drop
		a pin where you think they’re from. The closer you are, the more points you get.
	</p>

	{#if data.faces.length}
		<figure class="mt-10">
			<div class="grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
				{#each data.faces as face, i (face.pid)}
					<img
						src="/api/face/{face.pid}"
						alt=""
						class="aspect-square w-full rounded-xl border border-line bg-paper-2 object-cover shadow-sm {i >=
						4
							? 'hidden sm:block'
							: ''}"
					/>
				{/each}
			</div>
			<figcaption class="mt-2 text-xs text-muted">
				None of these people exist. Each face is dozens of real people averaged together.
			</figcaption>
		</figure>
	{/if}

	<div class="mt-10 grid gap-4 sm:grid-cols-2">
		<a
			href="/play"
			class="group rounded-2xl border border-ink bg-ink p-6 text-paper transition hover:-translate-y-0.5 hover:shadow-lg"
		>
			<div class="flex items-baseline justify-between">
				<h2 class="font-serif text-2xl font-semibold">Daily</h2>
				<span class="text-sm text-paper/70">{data.day}</span>
			</div>
			<p class="mt-2 text-paper/80">
				{data.dailyRounds} rounds, the same for everyone. Compare scores at dinner.
			</p>
			<p class="mt-5 font-medium">
				{#if todayTotal !== null}
					Done today: {todayTotal.toLocaleString()} / {maxDaily.toLocaleString()} →
				{:else}
					Play today’s →
				{/if}
			</p>
		</a>
		<a
			href="/play?mode=endless"
			class="group rounded-2xl border border-line bg-white/50 p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
		>
			<h2 class="font-serif text-2xl font-semibold">Endless</h2>
			<p class="mt-2 text-ink-soft">
				Random rounds from all {data.total} composites, as long as you like.
			</p>
			<p class="mt-5 font-medium">Practice →</p>
		</a>
	</div>

	{#if best !== null}
		<dl class="mt-8 flex gap-8 text-sm">
			<div>
				<dt class="text-muted">Streak</dt>
				<dd class="font-serif text-2xl font-semibold">{streakDays} day{streakDays === 1 ? '' : 's'}</dd>
			</div>
			<div>
				<dt class="text-muted">Best daily</dt>
				<dd class="font-serif text-2xl font-semibold">{best.toLocaleString()}</dd>
			</div>
		</dl>
	{/if}

	<ol class="mt-16 grid gap-6 border-t border-line pt-10 sm:grid-cols-3">
		<li>
			<span class="font-serif text-3xl text-brass">1</span>
			<h3 class="mt-1 font-semibold">Study the face</h3>
			<p class="mt-1 text-sm text-ink-soft">
				It isn’t a real person: it’s the average of everyone in the round, so the features they
				share stand out.
			</p>
		</li>
		<li>
			<span class="font-serif text-3xl text-brass">2</span>
			<h3 class="mt-1 font-semibold">Drop a pin</h3>
			<p class="mt-1 text-sm text-ink-soft">
				Click the map. Zoom in for small countries. Move the pin as often as you like.
			</p>
		</li>
		<li>
			<span class="font-serif text-3xl text-brass">3</span>
			<h3 class="mt-1 font-semibold">Score up to 5,000</h3>
			<p class="mt-1 text-sm text-ink-soft">
				Points fall off with distance from where the people were born. Within a few hundred km is
				excellent.
			</p>
		</li>
	</ol>
</section>
