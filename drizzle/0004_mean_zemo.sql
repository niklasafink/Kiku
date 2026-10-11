CREATE TABLE "study_plans" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan" jsonb NOT NULL,
	"done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);
