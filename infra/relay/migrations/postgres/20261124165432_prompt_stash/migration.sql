CREATE TABLE "relay_prompt_stash" (
	"user_id" varchar(255),
	"id" varchar(36),
	"prompt" text NOT NULL,
	"created_at" varchar(64) NOT NULL,
	CONSTRAINT "relay_prompt_stash_pkey" PRIMARY KEY("user_id","id")
);
