import { browser } from '$app/environment';
import { createItemsTable } from '$lib/client';
import { QueryClient } from '@tanstack/svelte-query';
import { IdbFs, PGlite } from '@electric-sql/pglite';
import { electricSync, type SyncShapeToTableOptions } from '@electric-sql/pglite-sync';
import { live, type LiveNamespace } from '@electric-sql/pglite/live';

export const ssr = false; // spa only
let pgliteInstance: PGlite & {
	live: LiveNamespace;
	electric: {
		syncShapeToTable: (options: SyncShapeToTableOptions) => Promise<{
			unsubscribe: () => void;
			readonly isUpToDate: boolean;
			readonly shapeId: string;
			subscribeOnceToUpToDate: (cb: () => void, error: (err: Error) => void) => () => void;
			unsubscribeAllUpToDateSubscribers: () => void;
		}>;
	};
};

export async function load() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser
			}
		}
	});

	if (browser && !pgliteInstance) {
		pgliteInstance = await PGlite.create({
			// debug: 1,
			fs: new IdbFs('my-database'),
			extensions: {
				live,
				electric: electricSync({
					debug: true
				})
			},
			relaxedDurability: true
		});

		// Create the items table if it doesn't exist
		await createItemsTable(pgliteInstance);
	}

	return { queryClient, pglite: pgliteInstance };
}
