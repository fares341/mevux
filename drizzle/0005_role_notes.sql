CREATE TABLE "role_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"author_id" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"file_name" text,
	"stored_name" text,
	"size" integer,
	"mime" text,
	"is_voice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_notes_stored_name_unique" UNIQUE("stored_name")
);
--> statement-breakpoint
ALTER TABLE "role_notes" ADD CONSTRAINT "role_notes_role_id_project_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."project_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_notes" ADD CONSTRAINT "role_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;