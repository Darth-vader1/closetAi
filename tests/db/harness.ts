import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Embedded-Postgres harness. Stubs the pieces Supabase provides (auth schema, auth.uid(),
 * storage schema, API roles) and then applies the REAL migrations from supabase/migrations.
 * This verifies the schema recreates from scratch and that RLS isolates users.
 */

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  -- Supabase default privileges: every function created in public is executable by anon and
  -- authenticated until a migration REVOKEs it. Reproducing that lets the tests catch RPCs that
  -- were never locked down (a SECURITY DEFINER function with no REVOKE is callable by anyone).
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  -- Same for tables: Supabase grants table privileges at creation time, so a migration's REVOKE sticks.
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
  $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets (id),
    name text not null
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare parts text[];
  begin
    parts := string_to_array(name, '/');
    return parts[1:array_length(parts, 1) - 1];
  end $$;
  grant usage on schema auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
`;

const POST_MIGRATION_GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema storage to authenticated;
  -- Supabase's service_role bypasses RLS and holds full table privileges.
  grant usage on schema public to service_role;
  grant all on all tables in schema public to service_role;
  alter role service_role bypassrls;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  await db.exec(POST_MIGRATION_GRANTS);
  return db;
}

/** Create an auth user (fires the signup trigger) and return its id. */
export async function createUser(db: PGlite, displayName = "Test"): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into auth.users (raw_user_meta_data) values ($1::jsonb) returning id`,
    [JSON.stringify({ display_name: displayName })],
  );
  return res.rows[0].id;
}

/** Run a callback as an authenticated end user, so RLS applies exactly like the Supabase API. */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Run a callback as the anonymous (not logged in) API role. */
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon`);
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}

/** Run a callback as the service role (what the server's admin client uses). */
export async function asService<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role service_role`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}
