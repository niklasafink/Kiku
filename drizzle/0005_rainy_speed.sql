CREATE TABLE "purchase_requests" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"offer" text NOT NULL,
	"created_at" bigint NOT NULL
);
