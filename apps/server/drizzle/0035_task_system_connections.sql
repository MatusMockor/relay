CREATE TABLE "task_system_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"site_url" text NOT NULL,
	"account_name" text NOT NULL,
	"external_account_id" text NOT NULL,
	"credentials_envelope" text,
	"status" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_system_connections" ADD CONSTRAINT "task_system_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_system_connections_account_unique" ON "task_system_connections" USING btree ("user_id","provider","site_url","external_account_id");