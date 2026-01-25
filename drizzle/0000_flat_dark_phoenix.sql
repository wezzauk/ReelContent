CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"draft_id" uuid,
	"variant_id" uuid,
	"title" text,
	"content" text,
	"platform" text,
	"tags" text[] DEFAULT '{}',
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_purchase_id" text,
	"amount" numeric(10, 2) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "boosts_stripe_purchase_id_unique" UNIQUE("stripe_purchase_id")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text,
	"prompt" text NOT NULL,
	"platform" text NOT NULL,
	"settings" text DEFAULT '{}',
	"selected_variant_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"idempotency_key" text,
	"is_regen" boolean DEFAULT false NOT NULL,
	"parent_generation_id" uuid,
	"regen_type" text,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "generations_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" text DEFAULT 'basic' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"generation_id" uuid,
	"month" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate" numeric(10, 6),
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_ledger_tokens_check" CHECK ("usage_ledger"."total_tokens" = "usage_ledger"."prompt_tokens" + "usage_ledger"."completion_tokens")
);
--> statement-breakpoint
CREATE TABLE "usage_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"period_type" text NOT NULL,
	"generation_count" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_rollups_tokens_check" CHECK ("usage_rollups"."total_tokens" = "usage_rollups"."prompt_tokens" + "usage_rollups"."completion_tokens")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"hashed_password" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"variant_index" integer NOT NULL,
	"content" text NOT NULL,
	"video_url" text,
	"thumbnail_url" text,
	"duration" integer,
	"metadata" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_id_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "assets_owner_created_idx" ON "assets" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_status_idx" ON "assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "assets_platform_idx" ON "assets" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "assets_tags_idx" ON "assets" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "assets_draft_id_idx" ON "assets" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "assets_variant_id_idx" ON "assets" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "boosts_user_id_idx" ON "boosts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "boosts_expires_at_idx" ON "boosts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "boosts_active_idx" ON "boosts" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX "drafts_owner_id_idx" ON "drafts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "drafts_owner_created_idx" ON "drafts" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "drafts_platform_idx" ON "drafts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "drafts_archived_idx" ON "drafts" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "generations_draft_id_idx" ON "generations" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "generations_owner_id_idx" ON "generations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "generations_owner_created_idx" ON "generations" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "generations_status_idx" ON "generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generations_idempotency_idx" ON "generations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_ledger_user_id_idx" ON "usage_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_ledger_month_idx" ON "usage_ledger" USING btree ("month");--> statement-breakpoint
CREATE INDEX "usage_ledger_user_month_idx" ON "usage_ledger" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "usage_ledger_generation_idx" ON "usage_ledger" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "usage_rollups_user_period_idx" ON "usage_rollups" USING btree ("user_id","period","period_type");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "variants_generation_id_idx" ON "variants" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "variants_draft_id_idx" ON "variants" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "variants_owner_id_idx" ON "variants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "variants_owner_created_idx" ON "variants" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "variants_gen_index_idx" ON "variants" USING btree ("generation_id","variant_index");