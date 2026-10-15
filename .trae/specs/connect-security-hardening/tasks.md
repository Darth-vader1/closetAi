# Connect Security Hardening - Implementation Plan

## Task 1: Create new migration with all schema changes
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Create a new migration file `20261015000003_connect_security_v2.sql` (unique version — `20261015000002` was already taken by `20261015000002_connect_search_rpc.sql`).
  - Add `profiles.discoverable boolean not null default false`.
  - Extend `connect_user_profiles` view to include `discoverable`.
  - Add `connect_conversations.status text not null default 'active' check (status in ('pending','active'))` and `requester uuid references profiles(id)`.
  - Backfill existing conversations: status='active', requester = oldest member.
  - Create `connect_blocks(blocker uuid, blocked uuid, created_at)` with unique on (blocker, blocked), RLS.
  - Create `connect_reports(reporter uuid, reported_user uuid, conversation_id uuid, reason text, created_at)` with RLS.
  - Create rate-limit counter tables or reuse a generic approach for search (20/min), messages (30/min), new conversations (20/day).
  - Add trigger `profiles_guard_closet_id` (BEFORE UPDATE) that raises when `new.closet_id is distinct from old.closet_id` and `current_user in ('anon','authenticated')`.
  - Add trigger to enforce requester 1-message limit in pending conversations.
  - Add trigger to column-protect connect_members (reset user_id/conversation_id/joined_at to old; only last_read_at passes).
  - Replace the check-then-insert in `start_direct_conversation` with `pg_advisory_xact_lock(hashtext(least(a,b)||greatest(a,b)))` or a unique `direct_key` column.
  - Update `start_direct_conversation` to set status='pending', requester=caller, enforce blocks, enforce 20/day limit.
  - Create `accept_conversation(p_conv_id uuid)` SECURITY DEFINER RPC bound to auth.uid() that only the non-requester member can call.
  - Create a SECURITY DEFINER `connect_search_users(p_term text)` RPC that does exact case-insensitive closet_id match + discoverable name match, with 20/min rate limit.
  - Revoke execute on `generate_closet_id` and `assign_closet_id` from public, anon, authenticated.
  - Add message rate-limit trigger (30/min/user) on connect_messages insert.
  - Update `connect_messages_insert_member` policy to also block blocked users and enforce consent (requester 1-message limit).
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15
- **Test Requirements**:
  - `rule` TR-1.1: New migration applies cleanly from scratch via the test harness. Evidence: `vitest run tests/db/connect.test.ts` passes setup.
  - `rule` TR-1.2: Existing migrations are unmodified. Evidence: `git diff --name-only supabase/migrations/` lists only the new file.
- **Notes**: Use `set search_path = ''` for all new functions; use `security definer` for functions that must bypass RLS.

## Task 2: Update server actions (search + send + start)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - In `searchUsersAction`: remove the entire `admin.auth.admin.listUsers()` fallback block. Call the new `connect_search_users` RPC instead of the `.or()` query. Return `{ id, displayName, closetId }` (no tag fallback).
  - In `sendMessageAction`: keep the insert; the DB trigger handles consent + rate limits. Map errors to friendly messages.
  - In `startConversationAction`: keep calling `start_direct_conversation`; map block/rate-limit errors.
  - Update `searchUsers` in `queries.ts` to use the new RPC (or remove if unused).
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**:
  - `rule` TR-2.1: `grep "listUsers\|createAdminClient" src/app/\(app\)/connect/actions.ts` returns nothing. Evidence: grep output.
  - `rule` TR-2.2: No `.or(` string interpolation in the connect search path. Evidence: grep on actions.ts and queries.ts.
- **Notes**: The `userTag` fallback is removed from search results since closet_id is now always available.

## Task 3: Update new-conversation-dialog.tsx
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Add a `requestId` ref counter; increment on each search; after the async call, only apply results if the counter still matches.
  - Wrap the search call in try/finally so `setSearching(false)` always runs.
  - Remove `role="listbox"` from `<ul>` and `role="option"`/`aria-selected` from `<li>`; use a plain `<ul role="list">`.
  - Implement a focus trap: on Tab, cycle focus within the dialog; on Shift+Tab, cycle backwards. Save the previously focused element (the trigger button) on mount and restore it on close.
  - Show the closet_id next to every name (it already shows in the subtitle; ensure it is the DB closet_id, not the tag fallback).
- **Acceptance Criteria Addressed**: AC-16, AC-17
- **Test Requirements**:
  - `rule` TR-3.1: No `role="listbox"` or `role="option"` in the component. Evidence: grep.
  - `rule` TR-3.2: Request counter logic present and try/finally wraps the search. Evidence: source review + typecheck.
  - `rule` TR-3.3: Focus trap and focus return implemented. Evidence: source review + typecheck.
  - `rule` TR-3.4: closet_id (not tag) is rendered for every result. Evidence: source review.
- **Notes**: Keep existing styling and accessible labels.

## Task 4: Write attack tests in tests/db/connect.test.ts
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Add tests for: exact closet_id match (case-insensitive), no substring match on non-discoverable names, discoverable name search works, search rate limit (21st fails).
  - closet_id immutability: authenticated user UPDATE throws.
  - Consent: requester 1-message limit in pending; recipient accept unlocks.
  - Blocks: blocked user cannot start conversation or send messages.
  - connect_reports table exists with RLS.
  - Message rate limit (31st fails).
  - New conversation rate limit (21st fails).
  - Atomic pair uniqueness under concurrent Promise.all.
  - connect_members column protection (only last_read_at writable).
  - closet_id functions not executable by anon/authenticated.
- **Acceptance Criteria Addressed**: AC-2 through AC-15
- **Test Requirements**:
  - `rule` TR-4.1: All new tests pass under `vitest run tests/db/connect.test.ts`. Evidence: test output.
- **Notes**: Use the existing `asUser`, `asAnon`, `createUser` helpers. For concurrency, use `Promise.all` with `asUser` (note: asUser is sequential per db connection; use two separate queries or simulate with direct advisory lock test).

## Task 5: Run lint, typecheck, tests, build
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, 2, 3, 4
- **Description**:
  - Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
  - Fix any issues found.
- **Acceptance Criteria Addressed**: NFR-4
- **Test Requirements**:
  - `rule` TR-5.1: `npm run lint` exits 0. Evidence: command output.
  - `rule` TR-5.2: `npm run typecheck` exits 0. Evidence: command output.
  - `rule` TR-5.3: `npm run test` exits 0. Evidence: command output.
  - `rule` TR-5.4: `npm run build` exits 0. Evidence: command output.
