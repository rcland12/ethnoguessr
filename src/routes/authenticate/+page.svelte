<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Ethnoguessr 2.0</title>
</svelte:head>

<div class="flex flex-1 items-center justify-center px-4 py-16">
	<div class="w-full max-w-sm rounded-2xl border border-line bg-white/60 p-8 shadow-sm">
		<h1 class="font-serif text-3xl font-semibold">Family &amp; friends only</h1>
		<p class="mt-2 text-sm text-muted">Enter the passcode you were given.</p>

		<form
			method="POST"
			class="mt-6 space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input
				name="passcode"
				type="password"
				autocomplete="current-password"
				required
				class="w-full rounded-lg border border-line bg-paper px-4 py-3 outline-none focus:border-ink-soft"
				placeholder="Passcode"
			/>
			{#if form?.error}
				<p class="text-sm text-pin">{form.error}</p>
			{/if}
			<button
				disabled={submitting}
				class="w-full rounded-lg bg-ink px-4 py-3 font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
			>
				{submitting ? 'Checking…' : 'Enter'}
			</button>
		</form>
	</div>
</div>
