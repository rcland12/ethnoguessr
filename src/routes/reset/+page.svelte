<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary } from '$lib/components/form';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>New password · Ethnoguessr 2.0</title></svelte:head>

<AuthCard title="Choose a new password">
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
		<input type="hidden" name="token" value={data.token} />
		<div>
			<label for="password" class={label}>New password</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required class={input} />
		</div>
		{#if form?.error}
			<p class="text-sm text-pin">
				{form.error}
				{#if 'expired' in form}<a href="/forgot" class="underline">Send a new link</a>{/if}
			</p>
		{/if}
		<button disabled={submitting} class={primary}>{submitting ? 'Saving…' : 'Save password'}</button>
	</form>
</AuthCard>
