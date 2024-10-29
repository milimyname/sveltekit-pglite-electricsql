CREATE TABLE IF NOT EXISTS "kanji_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kanji" text NOT NULL,
	"grade" integer,
	"jlpt_level" text,
	"stroke_count" integer,
	"meanings" text[],
	"on_readings" text[],
	"kun_readings" text[],
	"radicals" text[],
	"frequency" integer,
	"is_joyo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kanji_entries_kanji_unique" UNIQUE("kanji")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "radicals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"radical" text NOT NULL,
	"meaning" text,
	"stroke_count" integer,
	"reading" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radicals_radical_unique" UNIQUE("radical")
);
