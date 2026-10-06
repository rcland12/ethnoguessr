<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary } from '$lib/components/form';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Log in · Ethnoguessr 2.0</title></svelte:head>

<AuthCard title="Welcome back">
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
		<div>
			<div class="mb-1 flex items-baseline justify-between">
				<label for="password" class="text-sm font-medium">Password</label>
				<a href="/forgot" class="text-xs text-muted underline hover:text-ink">Forgot it?</a>
			</div>
			<input id="password" name="password" type="password" autocomplete="current-password" required class={input} />
		</div>
		{#if form?.error}<p class="text-sm text-pin">{form.error}</p>{/if}
		<button disabled={submitting} class={primary}>{submitting ? 'Logging in…' : 'Log in'}</button>
	</form>
	{#snippet footer()}
		New here? <a href="/signup" class="font-medium text-ink underline">Create an account</a>
	{/snippet}
</AuthCard>
