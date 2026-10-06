// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Past the optional passcode gate. */
			authed: boolean;
			/** Signed-in account, if any (independent of the passcode gate). */
			user: import('$lib/server/auth').User | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
