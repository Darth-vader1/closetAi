# Connect Security Hardening - Product Requirements Document

## Overview
- **Summary**: Harden the ClosetAI Connect messaging feature against data leakage, unauthorized mutations, spam, and abuse. Fixes span the database schema/RPC layer, the server action layer, and the new-conversation dialog UI.
- **Purpose**: Eliminate PII leakage (email fallback), prevent closet_id tampering, enforce consent before messaging, block abusive users, rate-limit search and messaging, guarantee 1:1 conversation uniqueness under concurrency, and lock down function execute privileges.
- **Target Users**: All authenticated ClosetAI users who use the Connect messaging feature.

## Goals
- Remove all email/PII leakage from the user-search path.
- Make user search exact-match on closet_id (case-insensitive); name search is opt-in only via `profiles.discoverable`.
- Rate-limit searches and messages at the database boundary.
- Prevent any user (anon or authenticated) from changing their own closet_id.
- Implement a consent model: requester sends at most 1 message; recipient must accept via an auth.uid()-bound RPC before more messages flow.
- Add blocks and reports with RLS; blocked users cannot start conversations or send messages.
- Make 1:1 conversation creation atomic (no duplicate conversations under concurrency).
- Column-protect connect_members so only last_read_at is user-writable.
- Revoke public execute on closet_id generator/assigner functions.
- Harden the new-conversation dialog (out-of-order responses, try/finally, plain ul, focus trap/return, closet_id display).

## Non-Goals
- No changes to wardrobe, outfits, laundry, WhatsApp, or AI modules.
- No redesign of the conversation list or message thread UI.
- No end-to-end UI tests for the dialog changes (verified by manual review + lint/tsc/build).
- No changes to the conversation-list component (out of scope; only new-conversation-dialog).

## Background & Context
- `searchUsersAction` in `src/app/(app)/connect/actions.ts` falls back to `admin.auth.admin.listUsers()` when the profile view returns nothing, leaking emails.
- The current `.or(display_name.ilike.%term%,closet_id.ilike.%term%)` query uses string interpolation and allows substring matching on display_name for every user.
- `profiles.closet_id` has no BEFORE UPDATE guard; an authenticated user could UPDATE their own row's closet_id (the `profiles_update_own` policy permits self-updates).
- `connect_conversations` has no status or requester columns; any member can send unlimited messages immediately.
- `start_direct_conversation` does check-then-insert without a unique constraint or advisory lock, so concurrent calls can create duplicate 1:1 conversations.
- `connect_members` update policy allows changing any column (joined_at, user_id, conversation_id) as long as `user_id = auth.uid()`.
- `generate_closet_id` and `assign_closet_id` are SECURITY DEFINER functions with default execute privileges (grantable to anon/authenticated via Supabase default privileges).

## Functional Requirements

- **FR-1**: `searchUsersAction` must never call `admin.auth.admin.listUsers()` and must never return email data.
- **FR-2**: User search must match `closet_id` exactly (case-insensitive). Display-name substring search is allowed only for profiles where `discoverable = true`.
- **FR-3**: The `.or()` string interpolation in search must be replaced with separate, parameterized queries.
- **FR-4**: Search is rate-limited to 20 requests per minute per authenticated user (enforced in the DB via a SECURITY DEFINER RPC or trigger).
- **FR-5**: `profiles.closet_id` cannot be changed by anon or authenticated users (BEFORE UPDATE trigger raises an exception).
- **FR-6**: `connect_conversations` gains a `status` column ('pending' | 'active', default 'pending') and a `requester` column (uuid referencing profiles).
- **FR-7**: In a 'pending' conversation, the requester may send at most 1 message (DB trigger). The recipient must call an accept RPC (bound to auth.uid()) to set status='active' before the requester can send more.
- **FR-8**: `connect_blocks` table (blocker uuid, blocked uuid) with RLS: a blocked user cannot start a conversation with or send messages to the blocker.
- **FR-9**: `connect_reports` table for reporting users/conversations.
- **FR-10**: Messages are rate-limited to 30 per minute per user; new conversations limited to 20 per day per user.
- **FR-11**: `start_direct_conversation` is atomic: concurrent calls for the same pair return the same conversation id (unique direct_key or pg_advisory_xact_lock).
- **FR-12**: `connect_members` columns except `last_read_at` are protected from user UPDATEs (trigger resets/rejects changes).
- **FR-13**: Execute on `generate_closet_id` and `assign_closet_id` is revoked from public, anon, authenticated.
- **FR-14**: `new-conversation-dialog.tsx` ignores out-of-order search responses (request counter), wraps the search call in try/finally, uses a plain `<ul>` (no listbox roles), implements focus trap + focus return, and shows the closet_id next to every name.
- **FR-15**: All schema changes live in a single NEW migration file; no applied migration is edited in place.

## Non-Functional Requirements

- **NFR-1**: All new triggers/functions use `set search_path = ''` (or `public` where needed) and `security definer`/`security invoker` appropriately.
- **NFR-2**: All RPCs that need to bypass RLS are SECURITY DEFINER and revoke execute from public/anon; only authenticated (or service_role) is granted.
- **NFR-3**: Tests in `tests/db/connect.test.ts` cover each attack vector and pass under `vitest run`.
- **NFR-4**: `npm run lint`, `npm run typecheck`, and `npm run build` all pass.

## Constraints
- **Technical**: Use PGlite test harness; migrations must apply cleanly from scratch. Postgres 15+ syntax (pg_advisory_xact_lock available).
- **Business**: No breaking changes to existing conversation data; existing conversations default to status='active'.
- **Dependencies**: Existing `connect_user_profiles` view must be extended to include `discoverable`.

## Assumptions
- The `profiles.discoverable` column defaults to false, so name search is off by default (exact closet_id match always works).
- Existing conversations (created before this migration) are backfilled to status='active' with requester set to the older member.
- Rate limiting uses a rolling window counter table (like `ai_usage_events`) rather than pg_stat_statements.

## Acceptance Criteria

### AC-1: Email fallback removed
- **Type**: `rule`
- **Given**: A search query that matches no profile by closet_id or discoverable name
- **When**: `searchUsersAction` is called
- **Then**: The admin client's `listUsers` is never invoked and no email data appears in the response
- **Pass Condition**: `searchUsersAction` contains no reference to `admin.auth.admin.listUsers` or `createAdminClient`
- **Evidence**: `grep` on actions.ts + typecheck

### AC-2: Exact closet_id match only (case-insensitive)
- **Type**: `rule`
- **Given**: A profile with closet_id 'CLOS-ABC12345' and discoverable=false
- **When**: Searching for 'clos-abc12345'
- **Then**: The profile is returned; searching for 'abc' returns nothing (no substring match)
- **Pass Condition**: DB RPC returns 1 row for exact case-insensitive match, 0 for partial
- **Evidence**: connect.test.ts

### AC-3: Name search opt-in via discoverable
- **Type**: `rule`
- **Given**: Two profiles, one with discoverable=true and display_name 'Alice', another with discoverable=false and display_name 'Bob'
- **When**: Searching for 'Ali' (substring of display_name)
- **Then**: Only Alice's profile is returned; Bob is not
- **Pass Condition**: Search RPC filters by discoverable=true for name matching
- **Evidence**: connect.test.ts

### AC-4: No .or() string interpolation
- **Type**: `rule`
- **Given**: The search implementation
- **When**: Inspecting the query construction
- **Then**: No `.or(` with template-literal interpolation; separate `.eq`/`.ilike` calls are used with parameterized values
- **Pass Condition**: `grep` finds no `.or(` in the search path
- **Evidence**: actions.ts source + typecheck

### AC-5: Search rate limit (20/min/user)
- **Type**: `rule`
- **Given**: An authenticated user
- **When**: The 21st search within 60 seconds is attempted
- **Then**: The DB raises a rate-limit exception and the search is rejected
- **Pass Condition**: 21st call throws; 20th succeeds
- **Evidence**: connect.test.ts

### AC-6: closet_id immutable by users
- **Type**: `rule`
- **Given**: An authenticated user
- **When**: They attempt `update profiles set closet_id = 'CLOS-HACKED00' where id = auth.uid()`
- **Then**: The UPDATE raises an exception and closet_id is unchanged
- **Pass Condition**: UPDATE throws; closet_id remains the original value
- **Evidence**: connect.test.ts

### AC-7: Consent — requester limited to 1 message in pending
- **Type**: `rule`
- **Given**: A new conversation (status='pending') started by Alice with Bob
- **When**: Alice tries to send a 2nd message before Bob accepts
- **Then**: The 2nd insert is rejected by a trigger
- **Pass Condition**: 2nd message insert throws
- **Evidence**: connect.test.ts

### AC-8: Recipient accept RPC unlocks messaging
- **Type**: `rule`
- **Given**: A pending conversation between Alice (requester) and Bob (recipient)
- **When**: Bob calls `accept_conversation` with the conversation id
- **Then**: status becomes 'active' and Alice can send more messages
- **Pass Condition**: After accept, Alice's 2nd message succeeds
- **Evidence**: connect.test.ts

### AC-9: Blocks prevent conversation start and messaging
- **Type**: `rule`
- **Given**: Bob has blocked Alice
- **When**: Alice calls `start_direct_conversation(bob)` or tries to insert a message
- **Then**: Both are rejected
- **Pass Condition**: start_direct_conversation throws; message insert throws
- **Evidence**: connect.test.ts

### AC-10: connect_reports table exists with RLS
- **Type**: `rule`
- **Given**: The schema
- **When**: Querying `connect_reports`
- **Then**: The table exists, has RLS enabled, and users can only insert their own reports
- **Pass Condition**: Table exists; RLS on; insert policy bound to auth.uid()
- **Evidence**: connect.test.ts + schema query

### AC-11: Message rate limit (30/min/user)
- **Type**: `rule`
- **Given**: An authenticated user in an active conversation
- **When**: The 31st message within 60 seconds is inserted
- **Then**: The insert is rejected
- **Pass Condition**: 31st message throws
- **Evidence**: connect.test.ts

### AC-12: New conversation rate limit (20/day/user)
- **Type**: `rule`
- **Given**: An authenticated user
- **When**: They attempt to start a 21st new conversation in 24 hours
- **Then**: `start_direct_conversation` raises a rate-limit exception
- **Pass Condition**: 21st call throws
- **Evidence**: connect.test.ts

### AC-13: Atomic pair uniqueness
- **Type**: `rule`
- **Given**: Two concurrent `start_direct_conversation(alice, bob)` calls
- **When**: Both execute
- **Then**: Both return the same conversation id and exactly one conversation + two member rows exist
- **Pass Condition**: Concurrent calls return equal ids; member count for the pair = 1 conversation
- **Evidence**: connect.test.ts (Promise.all race)

### AC-14: connect_members column protection
- **Type**: `rule`
- **Given**: An authenticated member of a conversation
- **When**: They try to update `joined_at`, `user_id`, or `conversation_id` on their member row
- **Then**: The trigger rejects/resets the change; only `last_read_at` is writable
- **Pass Condition**: Update of protected columns throws or is reset; last_read_at update succeeds
- **Evidence**: connect.test.ts

### AC-15: closet_id functions not executable by public/anon/authenticated
- **Type**: `rule`
- **Given**: The schema
- **When**: Checking `aclexplode` on `generate_closet_id` and `assign_closet_id`
- **Then**: No grant to public, anon, or authenticated; only the owner/service_role can execute
- **Pass Condition**: aclexplode shows no public/anon/authenticated grants
- **Evidence**: connect.test.ts

### AC-16: Dialog out-of-order response handling
- **Type**: `rule`
- **Given**: The new-conversation dialog
- **When**: A slower search response arrives after a newer one
- **Then**: The stale response is ignored (request counter)
- **Pass Condition**: Code increments a request counter and checks it before applying results
- **Evidence**: Source review + typecheck

### AC-17: Dialog try/finally + plain ul + focus trap + closet_id display
- **Type**: `rule`
- **Given**: The new-conversation dialog
- **When**: Inspecting the component
- **Then**: Search is wrapped in try/finally; `<ul>` has no listbox role; focus is trapped in the dialog and returned to the trigger on close; each result shows closet_id next to the name
- **Pass Condition**: No `role="listbox"`/`role="option"`; try/finally present; focus trap + restore present; closet_id rendered
- **Evidence**: Source review + typecheck + lint

### AC-18: New migration only, no in-place edits
- **Type**: `rule`
- **Given**: The migration directory
- **When**: Comparing git status of existing migrations
- **Then**: No pre-existing migration file is modified; all changes are in one new file
- **Pass Condition**: `git diff --name-only supabase/migrations/` shows only the new file
- **Evidence**: git status

## Open Questions
- None — all requirements are explicit in the user request.
