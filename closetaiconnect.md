PROJECT: CLOSET AI CONNECT
FEATURE: Social Messaging, Wardrobe Sharing, Collaborative Styling,
and Professional Stylist-Client Collaboration.

ROLE
Act as a senior full-stack engineer, product architect, UI/UX designer,
database engineer, and application security specialist.

You are working on an existing application called ClosetAI, a digital
wardrobe and AI-powered personal styling platform.

Your task is to integrate a new feature called "ClosetAI Connect" into
the existing application.

ClosetAI Connect will allow users to communicate with friends, share
clothing items and outfits, request fashion advice, collaborate on
styling decisions, and eventually work with professional stylists.

IMPORTANT:
This is an existing application, not a new project.

Do not rebuild the application from scratch.
Do not replace the existing framework.
Do not remove or break existing features.
Do not overwrite existing configuration without understanding it.
Do not introduce unnecessary dependencies.
Do not implement the entire feature in one uncontrolled change.

First inspect the repository, understand the existing architecture,
create an implementation plan, and then build the feature in stages.

==================================================
1. PRODUCT VISION
==================================================

ClosetAI Connect should make ClosetAI more than a personal wardrobe
management application.

It should become a platform where users can connect with other people
to discuss fashion, share clothing items, receive recommendations,
collaborate on outfits, and access professional styling services.

The feature must support TWO PRIMARY USE CASES.

USE CASE A: FRIENDS AND SOCIAL STYLING

Users should be able to:
- Find and connect with other ClosetAI users.
- Start private conversations.
- Send text messages.
- Share individual clothing items from their wardrobes.
- Share complete outfits.
- Ask friends for outfit recommendations.
- Receive styling suggestions.
- Respond to shared items with messages.
- Collaborate on what to wear for specific occasions.
- Share selected wardrobe items with trusted people.
- Control exactly what another person can access.

Example:
A user is preparing for an event and wants their friend's opinion.

They open ClosetAI Connect, select their friend, share a shirt,
trousers, and shoes, and ask which combination looks best.

The friend views the shared items and responds with a recommendation.

The friend must not automatically receive access to the user's entire
wardrobe.

USE CASE B: PROFESSIONAL STYLISTS AND CLIENTS

ClosetAI should eventually support professional stylists who work
with clients through the platform.

Stylists should be able to:
- Create a stylist profile.
- Describe their specialties.
- Add professional experience and portfolio images.
- Specify the types of styling services they provide.
- Receive styling requests from clients.
- Communicate privately with clients.
- View wardrobe items explicitly shared by a client.
- Create outfit recommendations using available wardrobe items.
- Recommend clothing combinations for specific occasions.
- Explain why an outfit works.
- Suggest missing clothing items where appropriate.
- Submit recommendations for client review.
- Manage active and completed styling engagements.

Clients should be able to:
- Discover available stylists.
- View stylist profiles and portfolios.
- Request styling assistance.
- Share selected wardrobe items.
- Explain their preferences, budget, event, and style goals.
- Receive recommendations.
- Accept, reject, or request changes to recommendations.
- End a styling engagement and revoke access to shared wardrobe data.

Do not build a payment marketplace until the core collaboration
experience is functional.

However, design the architecture so that future features such as
paid consultations, bookings, commissions, and subscriptions can be
added without requiring a complete redesign.

==================================================
2. PHASE ZERO: INSPECT THE EXISTING PROJECT
==================================================

Before writing code, inspect the entire relevant codebase.

Identify:

- Framework and framework version.
- App Router or Pages Router if Next.js is used.
- TypeScript configuration.
- Existing authentication implementation.
- Supabase configuration and client initialization.
- Existing database schema and migrations.
- Existing user profile structure.
- Existing wardrobe tables and relationships.
- Existing clothing item data model.
- Existing outfit generation and outfit storage logic.
- Existing image storage implementation.
- Existing AI integration.
- Existing design system and reusable components.
- Existing navigation and dashboard structure.
- Existing notification infrastructure.
- Existing testing framework.
- Existing environment variables and configuration patterns.

Determine how ClosetAI currently identifies the authenticated user.

Determine which existing tables and components can be reused.

Do not create duplicate user, wardrobe, clothing, or outfit tables
if equivalent structures already exist.

Do not assume that the database schema matches the expected design
in this prompt. Adapt the design to the real schema.

After inspection, produce a concise report containing:

1. Current architecture.
2. Existing components and database structures to reuse.
3. Missing functionality.
4. Proposed database changes.
5. Proposed routes and components.
6. Security and privacy considerations.
7. Implementation stages.
8. Tests required.

Then begin implementation.

Do not stop after producing the report. Continue with the first
implementation stage unless a genuine blocker requires clarification.

==================================================
3. TECHNOLOGY AND ARCHITECTURE
==================================================

Preserve the existing technology stack.

If the current application uses Next.js, TypeScript, Supabase,
PostgreSQL, and Supabase Storage, continue using them.

Preferred architectural direction:

Frontend:
- Existing Next.js application.
- TypeScript.
- Existing styling framework and design system.
- Responsive components.
- Reusable messaging and styling components.

Backend:
- Existing Next.js server-side architecture.
- Server Actions or Route Handlers where appropriate.
- Supabase PostgreSQL.
- Supabase Auth.
- Supabase Realtime for live messaging where appropriate.
- Supabase Storage for private images and attachments.

Security:
- PostgreSQL Row Level Security.
- Server-side authorization.
- Strict validation of all client-supplied identifiers.
- Private wardrobe data by default.

Use the existing AI provider and styling infrastructure where possible.

Do not introduce another AI provider, database, authentication
system, or file-storage service unless there is a documented reason.

Keep privileged server-side credentials out of browser bundles.

Never expose a Supabase service-role key to the client.

==================================================
4. FEATURE ONE: CONNECTIONS AND CONVERSATIONS
==================================================

Build the initial messaging foundation.

Users should be able to:

- View their conversations.
- Start a new conversation with another registered user.
- View the other participant's profile information permitted by
  the existing privacy model.
- Send text messages.
- Receive new messages without manually refreshing the page.
- View message timestamps.
- Identify which messages they sent.
- See unread message counts.
- Open a conversation and read its message history.
- Send messages from mobile and desktop interfaces.

Provide appropriate loading, empty, success, and error states.

Prevent users from creating duplicate direct conversations when
the product's conversation model is intended to allow only one
direct conversation per pair of users.

Use pagination or cursor-based loading for message history.

Do not load every message in a conversation at once.

Realtime events must respect authorization and must not expose
messages to users who are not conversation participants.

If a message fails to send, display a clear error and allow the
user to retry.

Do not silently discard messages.

Avoid duplicate messages caused by optimistic UI updates and
Realtime subscriptions.

==================================================
5. FEATURE TWO: SHARE WARDROBE ITEMS AND OUTFITS
==================================================

Allow users to share clothing items and outfits inside conversations.

A user should be able to:

1. Open a conversation.
2. Click a share button.
3. Select clothing items from their own wardrobe.
4. Select saved outfits where supported by the existing data model.
5. Add an optional message.
6. Send the shared content.
7. Allow the recipient to view the content inside the conversation.

Shared content should appear as rich message cards rather than
plain database identifiers.

A clothing card may display:
- Clothing image.
- Item name.
- Category.
- Color.
- Relevant styling metadata.
- A link to view more details when authorized.

An outfit card may display:
- Outfit preview.
- Clothing items included in the outfit.
- Occasion or style tags when available.
- The sender's message.

Important privacy requirements:

Sharing one clothing item does not grant access to the entire wardrobe.

Do not expose private storage URLs, internal database identifiers
unnecessarily, or sensitive wardrobe metadata.

Use the existing storage authorization model.

If the clothing image is stored in a private Supabase Storage bucket,
provide access through an appropriately authorized server-side
mechanism or short-lived signed URLs.

Validate that the sender owns the item or has permission to share it.

Validate that the recipient belongs to the conversation.

Do not trust a clothing item's owner ID supplied by the browser.

The server must independently verify ownership and permissions.

If an item is deleted, unshared, or becomes inaccessible, handle
the message gracefully without breaking the conversation history.

Do not automatically copy all clothing images into another user's
wardrobe.

==================================================
6. FEATURE THREE: CONTROLLED WARDROBE SHARING
==================================================

Build a permission-based wardrobe-sharing system.

Users should be able to grant access to another user without making
their entire wardrobe public.

Support these permission levels where appropriate:

A. VIEW SELECTED ITEMS
The recipient can view only explicitly shared items.

B. VIEW SHARED WARDROBE
The recipient can view items included in a specific wardrobe-sharing
grant.

C. PROVIDE OUTFIT RECOMMENDATIONS
The recipient can suggest combinations using accessible items.

D. SAVE RECOMMENDATIONS FOR APPROVAL
The recipient can submit outfit recommendations, but the wardrobe
owner must approve them before they become saved outfits.

E. COLLABORATE ON A STYLING REQUEST
The recipient can participate in an explicitly authorized styling
engagement.

Permissions must be separate and independently enforceable.

Use the principle of least privilege.

A user who can view clothing must not automatically be able to
edit it, delete it, change its laundry status, or access account
settings.

A recommendation must not automatically become a saved outfit
without the owner's authorization.

The owner must be able to:

- View active sharing grants.
- See who has access.
- Understand what information is shared.
- Change permissions.
- Revoke access.
- End a sharing relationship.

Revoking access must immediately prevent future authorized reads
through application endpoints and database policies.

Previously delivered content cannot always be erased from a
recipient's memory or screenshots. Do not claim otherwise.

However, prevent further access to the original private resource
after authorization is revoked.

Design access checks so that authorization is not based solely
on the existence of a previous shared message.

==================================================
7. FEATURE FOUR: COLLABORATIVE STYLING REQUESTS
==================================================

Allow users to create styling requests.

A styling request should support fields appropriate to the
existing application, including:

- Request title.
- Description.
- Occasion.
- Event date, if applicable.
- Preferred style.
- Clothing preferences.
- Budget, if relevant.
- Selected wardrobe items.
- Request status.
- Assigned stylist or collaborator.
- Created and updated timestamps.

Possible statuses:

- DRAFT
- OPEN
- IN_PROGRESS
- WAITING_FOR_CLIENT
- COMPLETED
- CANCELLED

Adapt these statuses if the existing application uses a better
workflow.

Users should be able to send a styling request to a friend or
professional stylist.

The recipient should be able to view only the information and
clothing items explicitly shared with them.

The recipient can submit outfit recommendations associated with
the request.

The requester can:
- View recommendations.
- Approve a recommendation.
- Reject a recommendation.
- Request modifications.
- Mark the request completed.

Preserve the distinction between a recommendation and an outfit
saved by the wardrobe owner.

==================================================
8. FEATURE FIVE: PROFESSIONAL STYLIST PROFILES
==================================================

Prepare the application for professional styling services.

Inspect the existing user profile model before designing this
feature.

Do not introduce a separate authentication system for stylists.

Where appropriate, support a stylist profile associated with
an existing authenticated user.

Possible profile fields:

- Display name.
- Profile photo.
- Biography.
- Specialties.
- Experience.
- Portfolio.
- Location or service region, if appropriate.
- Remote or in-person availability.
- Profile verification status.
- Published status.

Potential specialties include:

- Everyday styling.
- Corporate styling.
- Event styling.
- Minimalist wardrobes.
- Streetwear.
- Budget-conscious styling.
- Wardrobe organization.

Users should be able to browse published stylist profiles and
submit styling requests.

Do not treat a self-declared stylist as verified.

Only authorized administrators or a defined verification process
may change verification status.

Do not allow users to modify their verification status directly.

Do not implement a full marketplace payment flow in the initial
stage.

==================================================
9. FEATURE SIX: AI-ASSISTED COLLABORATION
==================================================

Reuse the application's existing AI styling functionality.

AI may help users:
- Generate outfit recommendations from authorized clothing items.
- Explain why a combination works.
- Suggest alternatives for a particular occasion.
- Compare multiple proposed outfits.
- Identify potential gaps in a wardrobe.
- Draft styling advice for a professional stylist.

AI must operate only on clothing information the requesting user
is authorized to access.

Do not allow a client to retrieve another user's private wardrobe
by manipulating a request.

Do not send an entire private wardrobe to an AI provider when only
a small selection of items is required.

Avoid exposing private user information unnecessarily.

Where practical, allow the stylist or user to edit AI-generated
recommendations before sending them.

Clearly distinguish AI-generated suggestions from human-authored
styling advice.

Handle provider failures gracefully.

Use appropriate timeouts, retry logic, and error handling.

Do not make AI functionality a blocker for messaging or manual
styling recommendations.

==================================================
10. DATABASE DESIGN
==================================================

Inspect the existing database before creating tables.

Reuse existing profiles, wardrobe items, outfits, and styling
entities where possible.

If equivalent tables do not exist, design appropriate structures
for the following concepts:

1. Conversations
2. Conversation members
3. Messages
4. Message attachments or shared-content references
5. Wardrobe-sharing grants
6. Styling requests
7. Styling request participants
8. Outfit recommendations
9. Recommendation items
10. Stylist profiles
11. Stylist-client engagements
12. Notification records, if needed

Use normalized relationships where appropriate.

Potential relationships:

- One conversation has multiple members.
- One conversation contains multiple messages.
- A message may contain text, shared clothing references,
  outfit references, or other supported content.
- A styling request belongs to a requester.
- A styling request may have authorized participants.
- An outfit recommendation belongs to a styling request or
  another clearly defined collaboration context.
- A recommendation may reference multiple existing wardrobe items.
- A stylist profile belongs to an existing authenticated user.
- A wardrobe-sharing grant identifies its owner, recipient,
  scope, permissions, and status.

Use foreign keys, indexes, uniqueness constraints, and appropriate
delete behavior.

Avoid storing arrays of unrelated item IDs in a single text field
when normalized relationships are more appropriate.

Store timestamps consistently.

Use migrations to make schema changes reproducible.

Do not manually alter the production database without a migration
or a documented, controlled process.

Before applying migrations, verify that they do not conflict with
the existing schema.

==================================================
11. SECURITY AND ROW LEVEL SECURITY
==================================================

Security is a core product requirement, not a later enhancement.

Inspect existing Row Level Security policies before modifying them.

Enable and configure RLS for new tables.

Define explicit policies for SELECT, INSERT, UPDATE, and DELETE
as appropriate.

At a minimum:

- Only conversation participants may access conversation messages.
- Users cannot add themselves to arbitrary conversations without
  authorization.
- Users cannot read private wardrobe items they do not own or
  have explicit permission to access.
- Users cannot create a sharing grant on behalf of another user.
- Users cannot grant themselves permissions.
- Only authorized participants can access a styling request.
- Only authorized users can create or modify recommendations.
- Only authorized administrators can verify stylists.
- Users cannot modify another user's profile or wardrobe records
  through manipulated API requests.
- Private images must follow the same access rules as the data
  they represent.

Check for insecure direct object references.

Never rely only on hiding buttons in the frontend.

Every sensitive operation must enforce authorization on the server
and, where applicable, through database RLS.

Review Realtime authorization separately.

Ensure a user cannot subscribe to another user's private messages
by guessing a conversation ID or channel name.

Do not use broad RLS policies that allow all authenticated users
to access all records.

Create security tests covering unauthorized access attempts.

==================================================
12. USER INTERFACE AND USER EXPERIENCE
==================================================

ClosetAI Connect must feel like a natural part of the existing
ClosetAI application.

Inspect the current visual identity before designing new screens.

Reuse existing colors, typography, spacing, components, navigation,
buttons, cards, and interaction patterns.

Do not introduce an unrelated design system.

Required initial interface:

A. CONNECT / INBOX PAGE

Include:
- Page title.
- Search or conversation filtering.
- Conversation list.
- Participant avatar and name.
- Last message preview.
- Timestamp.
- Unread indicator.
- New conversation action.
- Appropriate loading, empty, and error states.

B. CONVERSATION PAGE

Include:
- Conversation header.
- Participant details.
- Message history.
- Text composer.
- Send action.
- Share wardrobe item action.
- Share outfit action when supported.
- Styling request action.
- Message timestamps.
- Appropriate mobile layout.

C. SHARED ITEM CARD

Include:
- Clothing image.
- Item name.
- Relevant metadata.
- Sender's accompanying message where applicable.
- Authorized view action.

D. WARDROBE ACCESS MANAGEMENT

Include:
- People with active access.
- Access scope.
- Permission summary.
- Change-permission action.
- Revoke-access action.
- Confirmation before revocation.

E. STYLING REQUEST PAGE

Include:
- Request details.
- Authorized shared items.
- Conversation or collaboration context.
- Submitted recommendations.
- Approve, reject, or request-changes actions.
- Request status.

F. STYLIST DISCOVERY

Implement this after the messaging and sharing foundation.

Include:
- Published stylist profiles.
- Specialties.
- Portfolio previews.
- Profile details.
- Styling request action.

All interfaces must be responsive.

Support small mobile screens without horizontal overflow.

Provide accessible labels, keyboard navigation, sensible focus
states, and appropriate contrast.

Use skeletons or loading indicators where useful.

Provide clear empty states that explain the next action.

Avoid fake functionality, nonfunctional buttons, and placeholder
screens presented as complete features.

==================================================
13. NAVIGATION AND INTEGRATION
==================================================

Integrate ClosetAI Connect into the existing application navigation.

Choose the appropriate location based on the current layout.

Potential navigation label:
"Connect"

Potential routes, adapted to the existing routing architecture:

/connect
/connect/[conversationId]
/connect/stylists
/connect/stylists/[stylistId]
/connect/requests/[requestId]
/settings/sharing

These routes are suggestions, not mandatory paths.

Reuse existing route conventions.

Protect authenticated routes.

Do not expose private conversation content in public metadata,
search indexing, or unauthenticated server-rendered pages.

Do not break the existing dashboard, wardrobe, outfit generation,
authentication, or settings flows.

==================================================
14. NOTIFICATIONS
==================================================

Prepare for notifications when users receive:

- New messages.
- New styling requests.
- New outfit recommendations.
- Responses to styling requests.
- Changes to a styling engagement.

Initially, implement the simplest notification mechanism that fits
the existing architecture.

If an in-app notification system already exists, reuse it.

If no notification system exists, implement a minimal database-backed
notification model where justified.

Do not introduce expensive external messaging services just to
complete the initial feature.

Email notifications can be added later using the existing email
provider.

Avoid sending duplicate notifications when Realtime events,
retries, or repeated requests occur.

Do not expose private message content in notification previews
unless the product's privacy design explicitly permits it.

==================================================
15. PERFORMANCE AND RELIABILITY
==================================================

The feature should remain responsive as conversations grow.

Requirements:

- Paginate message history.
- Add appropriate database indexes.
- Avoid N+1 database queries.
- Avoid repeatedly fetching full wardrobe records for message cards.
- Fetch only required fields.
- Avoid unnecessary subscriptions.
- Clean up Realtime subscriptions when components unmount.
- Handle reconnects and transient network failures.
- Prevent duplicate message submissions.
- Use optimistic updates carefully.
- Validate uploaded files if attachments are introduced.
- Apply upload size and type restrictions.
- Avoid downloading full-resolution images when thumbnails suffice.

Do not add infrastructure that is unnecessary at this stage.

Prefer a maintainable implementation over premature optimization.

==================================================
16. TESTING REQUIREMENTS
==================================================

Write tests using the existing test framework.

If the project has no testing framework, inspect the project and
recommend a minimal suitable option before introducing one.

Test at least the following scenarios:

AUTHENTICATION
- Unauthenticated users cannot access private Connect pages.
- Authenticated users can access authorized conversations.

MESSAGING
- A participant can send a message.
- A nonparticipant cannot read the conversation.
- A nonparticipant cannot send a message.
- Invalid conversation identifiers are rejected.
- Message history pagination works.

WARDROBE SHARING
- A user can share an item they own.
- A user cannot share another person's private item without
  explicit authorization.
- A recipient can view a legitimately shared item.
- A recipient cannot use a shared item to access the owner's
  entire wardrobe.
- Revoked access prevents subsequent authorized reads.

STYLING
- Authorized participants can view styling requests.
- Unauthorized users cannot access styling requests.
- Recommendations reference valid, accessible wardrobe items.
- A recommendation is not automatically saved as the owner's
  outfit without approval.

STYLIST PROFILES
- Users can manage only their own permitted profile fields.
- Users cannot mark themselves as verified.
- Only published profiles appear in public discovery.

GENERAL
- Mobile layouts remain usable.
- Existing ClosetAI features continue to function.
- Database migrations can be applied in the intended environment.
- No secrets are exposed in client-side code.

Run the available linting, type checking, tests, and production
build checks after implementation.

Fix errors caused by your changes.

Do not claim that tests passed unless you actually ran them.

==================================================
17. IMPLEMENTATION ROADMAP
==================================================

Implement this feature incrementally.

PHASE 1: FOUNDATION AND MESSAGING

Implement:
- Database migrations.
- Conversation and membership models.
- Message model.
- RLS policies.
- Conversation list.
- New conversation creation.
- Message history.
- Text messaging.
- Realtime message delivery.
- Basic unread indicators.
- Essential security tests.

This phase must result in a usable messaging feature.

PHASE 2: WARDROBE SHARING

Implement:
- Share clothing items.
- Share saved outfits where supported.
- Rich shared-item cards.
- Secure access to private images.
- Controlled wardrobe-sharing grants.
- Permission management.
- Access revocation.
- Privacy tests.

PHASE 3: COLLABORATIVE STYLING

Implement:
- Styling requests.
- Authorized participants.
- Outfit recommendations.
- Recommendation-item relationships.
- Approval and rejection workflows.
- Request status management.
- Styling collaboration interfaces.

PHASE 4: PROFESSIONAL STYLISTS

Implement:
- Stylist profiles.
- Portfolio management.
- Stylist discovery.
- Styling request submission.
- Stylist-client engagements.
- Profile publication and verification controls.

PHASE 5: AI AND FUTURE MONETIZATION

Implement:
- AI-assisted styling within authorized data boundaries.
- Improved recommendation workflows.
- Email notifications where appropriate.
- Paid styling consultations only after the core experience
  is stable and secure.

Do not implement all five phases in one enormous change.

Complete each phase in a testable state before proceeding.

==================================================
18. DEFINITION OF DONE
==================================================

The initial implementation is complete when:

1. A logged-in user can open ClosetAI Connect.
2. The user can start a conversation with another registered user.
3. Both participants can exchange messages.
4. New messages appear without manual page refresh when
   Realtime is available.
5. Conversation history is paginated.
6. Unauthorized users cannot read or send messages in conversations
   they do not belong to.
7. The interface works on desktop and mobile.
8. Existing ClosetAI features remain functional.
9. Database migrations and security policies are included.
10. Relevant tests, linting, type checking, and build checks have
    been run.
11. The implementation contains no knowingly exposed secrets.
12. Known limitations are documented clearly.

Do not mark the entire roadmap complete after implementing only
messaging. Report which phase is complete and which remains.

==================================================
19. FINAL INSTRUCTIONS
==================================================

Start by inspecting the repository.

Then provide the architecture findings and a staged implementation
plan.

After that, implement PHASE 1: FOUNDATION AND MESSAGING.

Do not merely generate a plan or describe code that should be written.
Make the actual code changes in the existing project.

Use the established code conventions.

Keep changes focused and reviewable.

Do not delete existing functionality to make the new feature easier
to implement.

If you discover a blocker, explain the exact issue and propose the
smallest safe resolution.

After implementation, provide a summary containing:

- Features implemented.
- Files created or modified.
- Database migrations added.
- Security policies added.
- Tests run and their actual results.
- Commands required to run or deploy the changes.
- Environment variables required, if any.
- Manual setup steps.
- Known limitations.
- Recommended next step for PHASE 2.

Begin now.