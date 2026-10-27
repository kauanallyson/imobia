ALTER TABLE "message" DROP CONSTRAINT "message_wamid_unique";--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "broker_id" text;--> statement-breakpoint
UPDATE "message" SET "broker_id" = "conversation"."broker_id" FROM "conversation" WHERE "conversation"."id" = "message"."conversation_id";--> statement-breakpoint
ALTER TABLE "message" ALTER COLUMN "broker_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_broker_id_user_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_broker_id_wamid_unique" UNIQUE("broker_id","wamid");