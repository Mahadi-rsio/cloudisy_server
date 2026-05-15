CREATE TYPE "public"."managed_database_status" AS ENUM('creating', 'running', 'updating', 'failed', 'deleting', 'deleted');--> statement-breakpoint
CREATE TABLE "managed_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_name" text NOT NULL,
	"db_name" text NOT NULL,
	"db_user" text NOT NULL,
	"db_password" text NOT NULL,
	"ram_mb" integer NOT NULL,
	"storage_mb" integer NOT NULL,
	"container_name" text NOT NULL,
	"container_id" text,
	"volume_name" text NOT NULL,
	"network_name" text NOT NULL,
	"external_host" text NOT NULL,
	"external_port" integer NOT NULL,
	"external_url" text NOT NULL,
	"ssl_enabled" boolean DEFAULT false NOT NULL,
	"status" "managed_database_status" DEFAULT 'creating' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"domain" text NOT NULL,
	"project_name" text NOT NULL,
	"request" bigint DEFAULT 0 NOT NULL,
	"request_limit" bigint DEFAULT 100000 NOT NULL,
	"bandwidth_usage" bigint DEFAULT 0 NOT NULL,
	"bandwidth_limit" bigint DEFAULT 2147483648 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
