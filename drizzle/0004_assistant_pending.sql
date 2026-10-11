CREATE TABLE "assistant_pending" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tool" text NOT NULL,
	"args_json" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_pending" ADD CONSTRAINT "assistant_pending_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;