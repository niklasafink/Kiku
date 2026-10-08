CREATE SEQUENCE "public"."sync_rev" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"rev" bigint NOT NULL,
	"card_id" text NOT NULL,
	"input_mode" text NOT NULL,
	"answer_text" text NOT NULL,
	"solution_snapshot" text NOT NULL,
	"segments" jsonb NOT NULL,
	"score" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"rev" bigint NOT NULL,
	"folder_id" text NOT NULL,
	"question" text NOT NULL,
	"solution" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"rev" bigint NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"emoji" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_tokens_user" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_user_rev" ON "attempts" USING btree ("user_id","rev");--> statement-breakpoint
CREATE INDEX "attempts_card" ON "attempts" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "cards_user_rev" ON "cards" USING btree ("user_id","rev");--> statement-breakpoint
CREATE INDEX "folders_user_rev" ON "folders" USING btree ("user_id","rev");