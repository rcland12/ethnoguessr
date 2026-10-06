<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary } from '$lib/components/form';

	let { form } = $props();
	let submitting = $state(false);
	let show = $state(false);
</script>

<svelte:head><title>Sign up · Ethnoguessr 2.0</title></svelte:head>

<AuthCard title="Create an account" subtitle="Keep your streak across devices, and get the daily game by email if you like.">
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
			<label for="password" class={label}>Password</label>
			<div class="relative">
				<input
					id="password"
					name="password"
					type={show ? 'text' : 'password'}
					autocomplete="new-password"
					minlength="8"
					required
					class="{input} pr-16"
				/>
				<button
					type="button"
					onclick={() => (show = !show)}
					class="absolute inset-y-0 right-0 px-4 text-xs font-medium text-muted hover:text-ink"
					>{show ? 'Hide' : 'Show'}</button
				>
			</div>
			<p class="mt-1 text-xs text-muted">At least 8 characters.</p>
		</div>
		<label class="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-paper/60 p-3">
			<input
				type="checkbox"
				name="daily"
				checked={form?.emailDaily ?? false}
				class="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-pin)]"
			/>
			<span class="text-sm">
				<span class="font-medium">Email me the daily game each morning</span>
				<span class="block text-muted">One email around 7am Eastern. Unsubscribe anytime.</span>
			</span>
		</label>
		{#if form?.error}
			<p class="text-sm text-pin">
				{form.error}
				{#if 'exists' in form}<a href="/login" class="underline">Log in</a> instead?{/if}
			</p>
		{/if}
		<button disabled={submitting} class={primary}>{submitting ? 'Creating…' : 'Create account'}</button>
	</form>
	{#snippet footer()}
		Already have an account? <a href="/login" class="font-medium text-ink underline">Log in</a>
	{/snippet}
</AuthCard>
