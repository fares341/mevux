ALTER TABLE "project_messages" ADD COLUMN "is_voice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_messages" ADD COLUMN "reply_to_id" text;--> statement-breakpoint
ALTER TABLE "project_messages" ADD COLUMN "deleted_at" timestamp with time zone;