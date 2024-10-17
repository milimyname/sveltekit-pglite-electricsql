import { pgTable, uuid } from 'drizzle-orm/pg-core';

// Tables
export const itemsTable = pgTable('items', {
	id: uuid('id').defaultRandom().primaryKey()
});
