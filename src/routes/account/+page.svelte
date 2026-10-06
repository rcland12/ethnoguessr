<script lang="ts">
	import { enhance } from '$app/forms';
	import { input, label } from '$lib/components/form';

	let { data, form } = $props();
	let confirmDelete = $state(false);

	const button =
		'rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft';
	const card = 'rounded-2xl border border-line bg-white/60 p-6';
</script>

<svelte:head><title>Account · Ethnoguessr 2.0</title></svelte:head>

<section class="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-sm tracking-widest text-brass uppercase">Your account</p>
			<h1 class="mt-1 font-serif text-3xl font-semibold break-all">{data.email}</h1>
		</div>
		<form method="POST" action="/logout">
			<button class="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-paper-2">Log out</button>
		</form>
	</div>

	{#if data.welcome}
		<p class="rounded-xl bg-answer-soft p-4 text-sm">
			Welcome! Your daily scores will now be saved to your account.
			{#if !data.emailVerified}We sent a confirmation link to your email.{/if}
		</p>
	{:else if data.reset}
		<p class="rounded-xl bg-answer-soft p-4 text-sm">Password updated.</p>
	{/if}

	<dl class="grid grid-cols-3 gap-3">
		{#each [['Streak', `${data.stats.streak} day${data.stats.streak === 1 ? '' : 's'}`], ['Dailies played', data.stats.played.toLocaleString()], ['Best daily', data.stats.best?.toLocaleString() ?? '–']] as [k, v] (k)}
			<div class="rounded-2xl border border-line bg-white/60 p-4">
				<dt class="text-xs text-muted">{k}</dt>
				<dd class="mt-1 font-serif text-2xl font-semibold">{v}</dd>
			</div>
		{/each}
	</dl>

	<div class={card}>
		<h2 class="font-serif text-xl font-semibold">Daily email</h2>
		<form method="POST" action="?/daily" use:enhance={() => async ({ update }) => update({ reset: false })} class="mt-4">
			<label class="flex cursor-pointer items-start gap-3">
				<input
					type="checkbox"
					name="daily"
					checked={data.emailDaily}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-pin)]"
				/>
				<span class="text-sm">
					<span class="font-medium">Email me the daily game each morning</span>
					<span class="block text-muted">Around 7am Eastern, with the first face of the day.</span>
				</span>
			</label>
			<noscript><button class="{button} mt-3">Save</button></noscript>
		</form>
		{#if form?.saved === 'daily'}<p class="mt-2 text-sm text-answer">Saved.</p>{/if}

		{#if !data.emailVerified}
			<div class="mt-4 rounded-lg border border-brass/40 bg-brass/10 p-3 text-sm">
				<p>
					<strong>Confirm your email</strong> to receive it. Check your inbox for the link{#if !data.emailDaily}, then tick the box above{/if}.
				</p>
				<form method="POST" action="?/resend" use:enhance class="mt-2">
					<button class="text-sm font-medium underline">Send the link again</button>
				</form>
				{#if form?.saved === 'resent'}<p class="mt-1 text-answer">Sent. Check your inbox.</p>{/if}
				{#if form?.error}<p class="mt-1 text-pin">{form.error}</p>{/if}
			</div>
		{/if}
	</div>

	<div class={card}>
		<h2 class="font-serif text-xl font-semibold">Change password</h2>
		<form method="POST" action="?/password" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
			<div>
				<label for="current" class={label}>Current password</label>
				<input id="current" name="current" type="password" autocomplete="current-password" required class={input} />
			</div>
			<div>
				<label for="next" class={label}>New password</label>
				<input id="next" name="next" type="password" autocomplete="new-password" minlength="8" required class={input} />
			</div>
			<div class="flex items-center gap-3 sm:col-span-2">
				<button class={button}>Update password</button>
				{#if form?.saved === 'password'}<span class="text-sm text-answer">Password updated. Other devices were signed out.</span>{/if}
				{#if form?.pwError}<span class="text-sm text-pin">{form.pwError}</span>{/if}
			</div>
		</form>
	</div>

	<div class="rounded-2xl border border-tier-bad/30 p-6">
		<h2 class="font-serif text-xl font-semibold">Delete account</h2>
		<p class="mt-1 text-sm text-ink-soft">Removes your email, password and saved scores. This can’t be undone.</p>
		{#if confirmDelete || form?.delError}
			<form method="POST" action="?/delete" class="mt-4 flex flex-wrap items-end gap-3">
				<div class="min-w-48 flex-1">
					<label for="delpw" class={label}>Password to confirm</label>
					<input id="delpw" name="password" type="password" autocomplete="current-password" required class={input} />
				</div>
				<button class="rounded-lg bg-tier-bad px-4 py-3 text-sm font-medium text-white hover:brightness-110">Delete forever</button>
			</form>
			{#if form?.delError}<p class="mt-2 text-sm text-pin">{form.delError}</p>{/if}
		{:else}
			<button onclick={() => (confirmDelete = true)} class="mt-4 text-sm font-medium text-tier-bad underline">
				Delete my account…
			</button>
		{/if}
	</div>
</section>
