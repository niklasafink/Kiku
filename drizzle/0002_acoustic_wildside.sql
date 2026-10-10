CREATE TABLE "images" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "exam_date" bigint;--> statement-breakpoint
CREATE INDEX "images_user" ON "images" USING btree ("user_id");