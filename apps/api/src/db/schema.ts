import { sql } from 'drizzle-orm'
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import type { z } from 'zod'

// Enums
export const itemStatus = pgEnum('item_status', ['active', 'inactive'])

// Tables
export const itemsTable = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text(),
  status: itemStatus('status').default('active'),
})

// Schemas
export const insertItemSchema = createInsertSchema(itemsTable)
export const selectItemSchema = createSelectSchema(itemsTable)

export const dictionaryEntries = pgTable('dictionary_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  kanji: text('kanji'),
  reading: text('reading'),
  pos: text('pos').array(),
  jlptLevel: text('jlpt_level'),
  isCommon: boolean('is_common').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
})

export const insertDictionaryEntrySchema = createInsertSchema(dictionaryEntries)
export const selectDictionaryEntrySchema = createSelectSchema(dictionaryEntries)

export type DictionaryEntry = z.infer<typeof selectDictionaryEntrySchema>

export const meanings = pgTable('meanings', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryId: uuid('entry_id')
    .notNull()
    .references(() => dictionaryEntries.id, { onDelete: 'cascade' }),
  meaning: text('meaning').notNull(),
  priority: integer('priority').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
})

export const examples = pgTable(
  'examples',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: 'cascade' }),
    japanese: text('japanese').notNull(),
    english: text('english').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (table) => {
    return {
      // Add unique constraint on the combination of japanese and english
      uniqueExample: uniqueIndex('unique_example_idx').on(table.japanese, table.english),
    }
  }
)

export const kanjiEntries = pgTable('kanji_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  kanji: text('kanji').notNull().unique(),
  grade: integer('grade'),
  jlptLevel: text('jlpt_level'),
  strokeCount: integer('stroke_count'),
  meanings: text('meanings').array(),
  onReadings: text('on_readings').array(),
  kunReadings: text('kun_readings').array(),
  radicals: text('radicals').array(),
  frequency: integer('frequency'),
  isJoyo: boolean('is_joyo').default(false),
  // Add stroke data fields here
  strokeOrder: text('stroke_order').array(),
  strokeGroups: jsonb('stroke_groups'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
})

export const radicals = pgTable('radicals', {
  id: uuid('id').defaultRandom().primaryKey(),
  radical: text('radical').notNull().unique(),
  meaning: text('meaning'),
  strokeCount: integer('stroke_count'),
  reading: text('reading'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
})
