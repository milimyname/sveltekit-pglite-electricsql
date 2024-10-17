import { browser } from '$app/environment';
import { QueryClient } from '@tanstack/svelte-query';
import { PGlite } from '@electric-sql/pglite';

export async function load() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser
			}
		}
	});

	const pglite = browser ? new PGlite('idb://my-pgdata') : undefined;

	return { queryClient, pglite };
}
