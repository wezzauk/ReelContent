CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"voice_description" text,
	"do_phrases" text[] DEFAULT '{}',
	"dont_phrases" text[] DEFAULT '{}',
	"content_pillars" text[] DEFAULT '{}',
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personas_user_id_idx" ON "personas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personas_default_idx" ON "personas" USING btree ("user_id","is_default");
