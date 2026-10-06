<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children, data } = $props();

	const REPO_URL = 'https://github.com/rcland12/ethnoguessr';

	const links = [
		{ href: '/play', label: 'Daily' },
		{ href: '/play?mode=endless', label: 'Endless' },
		{ href: '/about', label: 'About' }
	];

	function active(href: string): boolean {
		const [path, query = ''] = href.split('?');
		return page.url.pathname === path && page.url.search === (query ? `?${query}` : '');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="border-b border-line bg-paper/90 backdrop-blur">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
			<a href="/" class="flex items-center gap-2">
				<img src={favicon} alt="" class="h-7 w-7 shrink-0" />
				<span class="font-serif text-lg font-semibold tracking-tight whitespace-nowrap sm:text-xl">
					Ethnoguessr <span class="text-pin">2.0</span>
				</span>
			</a>
			{#if data.authed}
				<nav class="flex items-center text-sm sm:gap-1">
					{#each links as link (link.href)}
						<a
							href={link.href}
							class="rounded-md px-2 py-1.5 sm:px-3 transition hover:bg-paper-2 {link.href === '/about'
								? 'hidden sm:block'
								: ''} {active(link.href) ? 'bg-paper-2 font-medium' : 'text-ink-soft'}">{link.label}</a
						>
					{/each}
					<span class="mx-1 hidden h-5 w-px bg-line sm:block"></span>
					{#if data.user}
						<a
							href="/account"
							title={data.user.email}
							class="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper uppercase transition hover:bg-ink-soft"
							>{data.user.email[0]}</a
						>
					{:else}
						<a href="/login" class="hidden rounded-md px-3 py-1.5 text-ink-soft hover:bg-paper-2 sm:block">Log in</a>
						<a href="/signup" class="ml-1 rounded-md bg-ink px-3 py-1.5 whitespace-nowrap font-medium text-paper hover:bg-ink-soft">Sign up</a>
					{/if}
				</nav>
			{/if}
		</div>
		{#if data.demo}
			<div class="bg-brass/15 px-4 py-1.5 text-center text-xs text-ink-soft">
				Demo data: placeholder faces until the pipeline publishes real composites.
			</div>
		{/if}
	</header>

	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>

	{#if page.url.pathname !== '/play'}
		<footer class="border-t border-line">
			<div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted">
				<span>Photos from Wikimedia Commons, used under their licenses. <a href="/about" class="underline hover:text-ink">How it works</a></span>
				<a href={REPO_URL} target="_blank" rel="noopener" class="flex items-center gap-1.5 hover:text-ink">
					<svg viewBox="0 0 16 16" class="h-4 w-4" fill="currentColor" aria-hidden="true"
						><path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
						/></svg
					>
					Source on GitHub
				</a>
			</div>
		</footer>
	{/if}
</div>
