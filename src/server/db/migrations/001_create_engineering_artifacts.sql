-- Migration: 001_create_engineering_artifacts.sql
-- Description: G-INFRA-STORAGE-01 Binary Engineering Artifacts Metadata Table
-- Note: File binaries are stored in Google Cloud Storage. PostgreSQL / Supabase only stores metadata and object paths.

create table if not exists engineering_artifacts (
  id uuid primary key default gen_random_uuid(),

  project_id text not null,
  sku_code text,
  component_id text,

  kind text not null,
  provider text,
  format text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,

  storage_provider text not null default 'gcs',
  storage_bucket text not null,
  storage_object_path text not null,

  source_artifact_id uuid references engineering_artifacts(id),
  revision integer default 1,

  coordinate_system jsonb default '{}'::jsonb,
  production_truth boolean not null default false,
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Unique index to prevent duplicate storage mapping
create unique index if not exists engineering_artifacts_storage_key
on engineering_artifacts(storage_bucket, storage_object_path);

-- Efficient indexing for project & SKU queries
create index if not exists idx_engineering_artifacts_project_sku
on engineering_artifacts(project_id, sku_code);

create index if not exists idx_engineering_artifacts_kind
on engineering_artifacts(kind);

create index if not exists idx_engineering_artifacts_source
on engineering_artifacts(source_artifact_id);
