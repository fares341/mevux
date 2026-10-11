ALTER TABLE "project_roles" ADD COLUMN "done_definition" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "checklist" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "checklist_done" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "grace_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "ext_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "ext_reason" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "ext_status" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "review_status" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "project_roles" ADD COLUMN "rework_due_at" timestamp with time zone;