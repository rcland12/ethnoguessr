<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Credits · {data.label} · Ethnoguessr 2.0</title>
</svelte:head>

<section class="mx-auto w-full max-w-3xl px-4 py-12">
	<p class="text-sm tracking-widest text-brass uppercase">Photo credits</p>
	<h1 class="mt-2 font-serif text-3xl font-semibold">{data.label}</h1>
	<p class="mt-2 text-ink-soft">
		This composite averages {data.n} photos. Each one is used under the license listed. The
		composite itself is a derivative work under the same terms.
	</p>

	{#if data.credits.length}
		<ul class="mt-8 divide-y divide-line rounded-2xl border border-line bg-white/50 text-sm">
			{#each data.credits as c, i (i)}
				<li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
					<span>
						<a href={c.sourceUrl} target="_blank" rel="noopener" class="underline">
							{c.name ?? 'Photo'}
						</a>
						<span class="text-muted">by {c.author}</span>
					</span>
					{#if c.licenseUrl}
						<a href={c.licenseUrl} target="_blank" rel="noopener" class="text-muted underline"
							>{c.license}</a
						>
					{:else}
						<span class="text-muted">{c.license}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-8 text-muted">No credits recorded for this round.</p>
	{/if}
</section>
