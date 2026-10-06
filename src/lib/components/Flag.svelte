<script lang="ts">
	// Every flag as its own hashed asset URL. `?no-inline` keeps Vite from
	// base64-inlining the small SVGs into this module; only the flags actually
	// shown are fetched. Emoji flags don't render on Windows, hence SVGs.
	const flags = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
		query: '?no-inline',
		import: 'default',
		eager: true
	});

	let { code, class: klass = '' }: { code: string; class?: string } = $props();

	const src = $derived(flags[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`]);
</script>

{#if src}
	<img
		{src}
		alt=""
		class="inline-block h-[0.8em] w-auto rounded-[2px] align-baseline shadow-[0_0_0_1px_rgb(0_0_0/0.08)] {klass}"
	/>
{/if}
