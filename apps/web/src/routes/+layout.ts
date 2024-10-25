import { browser } from '$app/environment';
import { createItemsTable } from '$lib/client';
import { QueryClient } from '@tanstack/svelte-query';
import { IdbFs, PGlite } from '@electric-sql/pglite';
import { electricSync } from '@electric-sql/pglite-sync';
import { live } from '@electric-sql/pglite/live';

export async function load() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser
			}
		}
	});

	const pglite = browser
		? await PGlite.create({
				// debug: 1,
				fs: new IdbFs('my-database'),
				extensions: {
					live,
					electric: electricSync()
				},
				relaxedDurability: true
			})
		: undefined;

	if (browser && pglite) createItemsTable(pglite);

	return { queryClient, pglite };
}
