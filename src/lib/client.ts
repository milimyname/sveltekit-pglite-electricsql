import type { PGlite } from '@electric-sql/pglite';

export async function createItemsTable(pglite: PGlite) {
	await pglite.exec(`
			CREATE TABLE IF NOT EXISTS "items" (
				"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
				"name" text,
				"status" text
			);
	`);
}
