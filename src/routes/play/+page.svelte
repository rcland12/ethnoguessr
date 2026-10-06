<script lang="ts">
	import Game from '$lib/components/Game.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.mode === 'daily' ? 'Daily' : 'Endless'} · Ethnoguessr 2.0</title>
</svelte:head>

<!-- Fresh game state whenever the mode or day changes. -->
{#key `${data.mode}:${data.day}`}
	<Game
		mode={data.mode}
		day={data.day}
		rounds={data.rounds}
		signedIn={data.signedIn}
		saved={data.saved}
	/>
{/key}
