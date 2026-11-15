CREATE TABLE "account_credentials" (
	"account_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"envelope" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"color" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"sync_interval_seconds" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"runner_location" text NOT NULL,
	"runner" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_results" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"kind" text NOT NULL,
	"runner" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_attachments" (
	"draft_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "draft_attachments_draft_id_attachment_id_pk" PRIMARY KEY("draft_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"to_addresses" jsonb NOT NULL,
	"cc_addresses" jsonb NOT NULL,
	"bcc_addresses" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"in_reply_to_thread_id" text,
	"in_reply_to_message_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "message_labels" (
	"message_id" text NOT NULL,
	"label_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "message_labels_message_id_label_id_pk" PRIMARY KEY("message_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"delimiter" text,
	"role" text NOT NULL,
	"unread_count" integer NOT NULL,
	"total_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"mailbox_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"uid_validity" bigint NOT NULL,
	"last_uid" bigint NOT NULL,
	"highest_modseq" text,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"mailbox_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"uid" bigint NOT NULL,
	"message_id_header" text,
	"in_reply_to" text,
	"references" text[] NOT NULL,
	"from_address" jsonb,
	"to_addresses" jsonb NOT NULL,
	"cc_addresses" jsonb NOT NULL,
	"bcc_addresses" jsonb NOT NULL,
	"reply_to_addresses" jsonb NOT NULL,
	"subject" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"snippet" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"seen" boolean NOT NULL,
	"flagged" boolean NOT NULL,
	"answered" boolean NOT NULL,
	"attachments" jsonb NOT NULL,
	"headers" jsonb NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', relay_search_text(coalesce(subject, ''))), 'A') ||
  setweight(to_tsvector('simple', relay_search_text(
    coalesce(from_address->>'name', '') || ' ' || coalesce(from_address->>'email', '') || ' ' ||
    jsonb_path_query_array(to_addresses, '$[*].name')::text || ' ' ||
    jsonb_path_query_array(to_addresses, '$[*].email')::text || ' ' ||
    jsonb_path_query_array(cc_addresses, '$[*].name')::text || ' ' ||
    jsonb_path_query_array(cc_addresses, '$[*].email')::text
  )), 'B') ||
  setweight(to_tsvector('simple', relay_search_text(left(coalesce(text_body, snippet), 200000))), 'D')) STORED
);
--> statement-breakpoint
CREATE TABLE "scheduled_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"exclusive" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"jira_key" text,
	"title" text NOT NULL,
	"ai_what" text,
	"state" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_splits" (
	"thread_id" text NOT NULL,
	"split_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "thread_splits_thread_id_split_id_pk" PRIMARY KEY("thread_id","split_id")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"subject" text NOT NULL,
	"participants" jsonb NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"message_count" integer NOT NULL,
	"unread" boolean NOT NULL,
	"snippet" text NOT NULL,
	"ai_one_liner" text,
	"jira_key" text,
	"state" text NOT NULL,
	"remind_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"family_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_credentials" ADD CONSTRAINT "account_credentials_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credentials" ADD CONSTRAINT "account_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_accounts" ADD CONSTRAINT "mail_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_attachments" ADD CONSTRAINT "draft_attachments_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_attachments" ADD CONSTRAINT "draft_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_attachments" ADD CONSTRAINT "draft_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_in_reply_to_thread_id_threads_id_fk" FOREIGN KEY ("in_reply_to_thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_in_reply_to_message_id_messages_id_fk" FOREIGN KEY ("in_reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sends" ADD CONSTRAINT "scheduled_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sends" ADD CONSTRAINT "scheduled_sends_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sends" ADD CONSTRAINT "scheduled_sends_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_splits" ADD CONSTRAINT "thread_splits_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_splits" ADD CONSTRAINT "thread_splits_split_id_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_splits" ADD CONSTRAINT "thread_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_accounts_user_idx" ON "mail_accounts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_accounts_user_email_unique" ON "mail_accounts" USING btree ("user_id",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "mail_accounts_primary_unique" ON "mail_accounts" USING btree ("user_id") WHERE "mail_accounts"."is_primary";--> statement-breakpoint
CREATE INDEX "ai_jobs_user_idx" ON "ai_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_results_lookup_idx" ON "ai_results" USING btree ("user_id","thread_id","kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "draft_attachments_attachment_idx" ON "draft_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "drafts_user_idx" ON "drafts" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "drafts_thread_idx" ON "drafts" USING btree ("in_reply_to_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_account_name_unique" ON "labels" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "labels_user_idx" ON "labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_labels_label_idx" ON "message_labels" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mailboxes_account_path_unique" ON "mailboxes" USING btree ("account_id","path");--> statement-breakpoint
CREATE INDEX "mailboxes_account_role_idx" ON "mailboxes" USING btree ("account_id","role");--> statement-breakpoint
CREATE INDEX "mailboxes_user_idx" ON "mailboxes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_mailbox_uid_unique" ON "messages" USING btree ("mailbox_id","uid");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","date");--> statement-breakpoint
CREATE INDEX "messages_account_header_idx" ON "messages" USING btree ("account_id","message_id_header");--> statement-breakpoint
CREATE INDEX "messages_user_idx" ON "messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_search_idx" ON "messages" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "scheduled_sends_user_idx" ON "scheduled_sends" USING btree ("user_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "scheduled_sends_due_idx" ON "scheduled_sends" USING btree ("scheduled_at") WHERE "scheduled_sends"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "scheduled_sends_draft_idx" ON "scheduled_sends" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "splits_user_idx" ON "splits" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_active_thread_unique" ON "reminders" USING btree ("thread_id") WHERE "reminders"."fired_at" is null;--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("remind_at") WHERE "reminders"."fired_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_user_list_idx" ON "tasks" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tasks_thread_idx" ON "tasks" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_user_jira_unique" ON "tasks" USING btree ("user_id","jira_key") WHERE "tasks"."jira_key" is not null;--> statement-breakpoint
CREATE INDEX "thread_splits_split_idx" ON "thread_splits" USING btree ("split_id");--> statement-breakpoint
CREATE INDEX "threads_user_folder_idx" ON "threads" USING btree ("user_id","state","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "threads_account_folder_idx" ON "threads" USING btree ("account_id","state","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "threads_jira_key_idx" ON "threads" USING btree ("user_id","jira_key") WHERE "threads"."jira_key" is not null;--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_device_idx" ON "refresh_tokens" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));