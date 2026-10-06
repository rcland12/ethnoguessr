<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary } from '$lib/components/form';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Reset password · Ethnoguessr 2.0</title></svelte:head>

<AuthCard title="Forgot your password?" subtitle="We’ll email you a link to choose a new one.">
	{#if form?.sent}
		<p class="rounded-lg bg-answer-soft p-4 text-sm">
			If there’s an account for <strong>{form.email}</strong>, a reset link is on its way. It
			expires in an hour.
		</p>
	{:else}
		<form
			method="POST"
			class="space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<div>
				<label for="email" class={label}>Email</label>
				<input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''} class={input} />
			</div>
			{#if form?.error}<p class="text-sm text-pin">{form.error}</p>{/if}
			<button disabled={submitting} class={primary}>{submitting ? 'Sending…' : 'Send reset link'}</button>
		</form>
	{/if}
	{#snippet footer()}
		<a href="/login" class="underline">Back to log in</a>
	{/snippet}
</AuthCard>
