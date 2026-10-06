<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { primary } from '$lib/components/form';

	let { data, form } = $props();
</script>

<svelte:head><title>Unsubscribe · Ethnoguessr 2.0</title></svelte:head>

{#if form?.done}
	<AuthCard title="Unsubscribed" subtitle="No more daily emails. You can turn them back on from your account anytime." />
{:else if form && !form.done}
	<AuthCard title="Link not recognized" subtitle="Log in and turn the daily email off from your account instead." />
{:else}
	<AuthCard title="Stop the daily email?" subtitle="You’ll stop getting the morning game. Your account and streak stay.">
		<form method="POST">
			<input type="hidden" name="token" value={data.token} />
			<button class={primary}>Unsubscribe</button>
		</form>
	</AuthCard>
{/if}
