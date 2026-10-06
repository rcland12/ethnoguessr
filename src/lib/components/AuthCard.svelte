<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle = '',
		children,
		footer
	}: { title: string; subtitle?: string; children?: Snippet; footer?: Snippet } = $props();
</script>

<div class="flex flex-1 items-start justify-center px-4 py-12 sm:items-center sm:py-16">
	<div class="w-full max-w-sm">
		<div class="rounded-2xl border border-line bg-white/60 p-7 shadow-sm sm:p-8">
			<h1 class="font-serif text-3xl font-semibold">{title}</h1>
			{#if subtitle}<p class="mt-2 text-sm text-ink-soft">{subtitle}</p>{/if}
			{#if children}<div class="mt-6">{@render children()}</div>{/if}
		</div>
		{#if footer}
			<div class="mt-4 text-center text-sm text-ink-soft">{@render footer()}</div>
		{/if}
	</div>
</div>
