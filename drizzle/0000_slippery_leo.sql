CREATE TABLE "pages" (
	"tenant_name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"domain" text NOT NULL,
	"project_name" text NOT NULL
);
