<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Confirm email · Ethnoguessr 2.0</title></svelte:head>

{#if data.ok}
	<AuthCard title="You’re confirmed" subtitle="If you asked for the daily game, it’ll arrive tomorrow morning.">
		<a href="/play" class="block w-full rounded-lg bg-ink px-4 py-3 text-center font-medium text-paper hover:bg-ink-soft"
			>Play today’s game</a
		>
	</AuthCard>
{:else}
	<AuthCard title="Link expired" subtitle="That confirmation link has expired or was already used.">
		<a href="/account" class="block w-full rounded-lg border border-line px-4 py-3 text-center font-medium hover:bg-paper-2"
			>Send a new one from your account</a
		>
	</AuthCard>
{/if}
