CREATE TABLE IF NOT EXISTS "stroke_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kanji_id" uuid,
	"stroke_order" text[],
	"stroke_groups" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stroke_data" ADD CONSTRAINT "stroke_data_kanji_id_kanji_entries_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
