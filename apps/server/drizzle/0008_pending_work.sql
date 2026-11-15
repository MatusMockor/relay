CREATE TABLE "pending_work" (
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"payload" jsonb NOT NULL,
	"revision" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_work_account_id_kind_ref_pk" PRIMARY KEY("account_id","kind","ref")
);
--> statement-breakpoint
ALTER TABLE "pending_work" ADD CONSTRAINT "pending_work_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_work_order_idx" ON "pending_work" USING btree ("account_id","kind","created_at");