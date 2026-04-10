ALTER TABLE "pages" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;