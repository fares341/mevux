CREATE TABLE "complaint_files" (
	"id" text PRIMARY KEY NOT NULL,
	"complaint_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"original_name" text NOT NULL,
	"stored_name" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"is_voice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_files_stored_name_unique" UNIQUE("stored_name")
);
--> statement-breakpoint
ALTER TABLE "complaint_files" ADD CONSTRAINT "complaint_files_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_files" ADD CONSTRAINT "complaint_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;