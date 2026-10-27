CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "business_number" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone_number" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_number_broker_id_unique" UNIQUE("broker_id"),
	CONSTRAINT "business_number_phone_number_id_unique" UNIQUE("phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broker_id" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"wa_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_broker_id_wa_id_unique" UNIQUE("broker_id","wa_id")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"wamid" text NOT NULL,
	"direction" "message_direction" NOT NULL,
	"type" text NOT NULL,
	"text" text,
	"sent_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_wamid_unique" UNIQUE("wamid")
);
--> statement-breakpoint
ALTER TABLE "business_number" ADD CONSTRAINT "business_number_broker_id_user_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_broker_id_user_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_broker_id_user_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;