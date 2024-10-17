import { browser } from '$app/environment';
import { PGlite } from '@electric-sql/pglite';

export function createPGlite() {
	if (!browser) return;

	const pglite = new PGlite('idb://my-pgdata');

	return {
		pglite
	};
}
