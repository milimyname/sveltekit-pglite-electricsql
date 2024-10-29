DROP TABLE "stroke_data";--> statement-breakpoint
ALTER TABLE "kanji_entries" ADD COLUMN "stroke_order" text[];--> statement-breakpoint
ALTER TABLE "kanji_entries" ADD COLUMN "stroke_groups" jsonb;