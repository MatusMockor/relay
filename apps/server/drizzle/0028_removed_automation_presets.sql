CREATE TABLE "removed_automation_presets" (
	"user_id" text NOT NULL,
	"preset" text NOT NULL,
	CONSTRAINT "removed_automation_presets_user_id_preset_pk" PRIMARY KEY("user_id","preset")
);
--> statement-breakpoint
ALTER TABLE "removed_automation_presets" ADD CONSTRAINT "removed_automation_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;