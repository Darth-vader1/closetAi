y recommendation: Give this to your coding agent with your existing Closet AI project open. Let it inspect the application before changing any code.

Master Prompt: Transform Closet AI into an AI-Powered Social Fashion Platform

Copy everything below into your coding agent.

PROJECT OVERVIEW

You are working on Closet AI, an existing AI-powered digital wardrobe and personal styling application.

The application already allows users to manage clothing items in their personal wardrobes and receive AI-powered outfit recommendations.

The goal is to expand Closet AI into a social fashion platform where users can share their personal style, publish outfit photographs, discover inspiration from others, follow other users, and eventually recreate outfits using clothing they already own.

This must be implemented as an extension of the existing application.

Do not rebuild the application from scratch. Do not replace working features unnecessarily. Do not introduce a second authentication system or duplicate existing infrastructure.

Your responsibilities include inspecting the existing codebase, designing the necessary architecture, implementing the feature, testing it, and documenting the changes.

1. FIRST: AUDIT THE EXISTING CODEBASE

Before writing or modifying code, inspect the entire relevant application structure.

Identify:

Frontend framework and application architecture.
Backend framework and API structure, if applicable.
Authentication provider and session management.
User profile model and existing profile fields.
Existing wardrobe and clothing-item data models.
How clothing images are uploaded, stored, retrieved, and deleted.
Existing AI outfit recommendation implementation.
Database schema and relationships.
Existing storage provider and image-processing utilities.
Current routing and navigation system.
Existing UI components, styling conventions, and design system.
Current authorisation rules and database access policies.
Existing notification and messaging functionality.
Current testing framework and available tests.
Deployment environment and environment-variable conventions.

Determine which components can be reused and which new components are necessary.

Produce a concise implementation plan based on the actual codebase.

Do not assume the application uses a particular framework, database, authentication provider, or storage service without verifying it.

If a required capability already exists, extend it instead of creating a duplicate.

If a proposed feature conflicts with the current architecture, explain the conflict and implement the safest compatible alternative.

After the audit, proceed with implementation in logical stages rather than stopping at a plan.

2. PRODUCT VISION

Closet AI should combine three connected experiences.

A. My Closet

The existing personal wardrobe management experience.

Users can:

Upload and manage clothing items.
Organise clothes into categories.
View clothing images.
Receive AI-powered outfit recommendations.
Build and manage outfit combinations.
Continue using all existing wardrobe features.
B. Discover

A social fashion feed where users can:

Discover outfit photographs.
Explore different fashion styles.
View public outfit posts.
Follow other users.
Like and save outfits.
View public profiles and publicly shared wardrobe items.
Find inspiration for their own outfits.
C. My Profile

A personal profile where users can:

Display their profile photograph.
Choose a display name.
Add a short biography.
Share their fashion preferences.
Manage public and private content.
Publish outfit photographs.
View their published outfits.
Manage followers and following.
Control privacy settings.

The three experiences should work together as one coherent product.

Do not make the social feed feel like an unrelated application embedded inside Closet AI.

3. FEATURE ONE: PUBLIC PROFILES

Implement public profile functionality.

Each profile may contain:

Profile photograph.
Display name.
Unique user identifier, if supported by the existing architecture.
Biography.
Optional fashion interests.
Published outfit posts.
Publicly visible wardrobe items.
Followers count.
Following count.
Profile navigation

When a user selects another user's profile, they should be able to view the content that user has explicitly made accessible to them.

A public profile must not automatically expose the owner's entire wardrobe.

Profile ownership

Users must be able to edit their own profile.

Users must not be able to modify another user's profile by changing a client-side identifier or API request.

Enforce ownership on the server.

Account identification

Multiple users may have the same display name.

Reuse an existing unique public identifier if the application has one.

Otherwise, introduce a stable display identifier that distinguishes accounts without exposing email addresses.

Do not rely on the last six or eight characters of a UUID as a guaranteed unique identifier.

The full internal user ID must remain the authoritative identifier for database relationships, conversations, and permissions.

4. FEATURE TWO: WARDROBE VISIBILITY AND PRIVACY

Users must be able to decide whether their wardrobes are visible to other people.

Implement these visibility options where appropriate to the existing architecture.

Private

Only the owner can access the wardrobe.

Public

Anyone permitted by the application's public-content policy can access the wardrobe's publicly visible items.

Followers only

Only authorised followers can access content marked as followers-only.

Individual clothing-item visibility

Wardrobe visibility and individual item visibility must be separate concepts.

For example, a user might have 50 clothing items:

25 publicly visible items.
15 followers-only items.
10 private items.

The public profile should display only the 25 public items.

Privacy rules

Implement privacy enforcement in the backend and database access policies.

Do not rely on frontend filtering.

Users must not be able to retrieve private items by:

Modifying API requests.
Guessing database identifiers.
Accessing image URLs directly.
Manipulating query parameters.
Calling backend endpoints outside the intended UI.

All wardrobe retrieval endpoints must enforce the applicable access permissions.

Important: Sharing an individual outfit post must not automatically publish every clothing item associated with the outfit.

An outfit post may reference private wardrobe items internally, but those items must not become publicly accessible merely because they appear in a relationship with a published post.

5. FEATURE THREE: OUTFIT POST CREATION

Create an outfit publishing workflow.

Users should be able to publish photographs of themselves wearing outfits.

Creating a post

The user should be able to:

Select or upload an outfit photograph.
Enter a caption.
Optionally select clothing items from their wardrobe.
Add optional fashion tags.
Choose a visibility setting.
Preview the post.
Publish it.

Allow users to publish outfit photographs even if they have not catalogued every clothing item in their wardrobe.

Do not force users to link wardrobe items before publishing.

Post information

Each post should support the appropriate combination of:

Post ID.
Author ID.
Image reference.
Caption.
Creation timestamp.
Updated timestamp.
Visibility setting.
Optional tags.
Optional associated wardrobe-item references.
Engagement counts, if appropriate.

Follow the existing database conventions.

Avoid storing information that can be derived efficiently from existing relationships unless there is a justified performance reason.

Post management

Users must be able to:

View their own posts.
Edit captions and supported metadata.
Change post visibility.
Delete their posts.
Remove associated wardrobe-item references when appropriate.

Only the post owner or an authorised administrator should be able to modify or delete a post.

Deleting a post must not accidentally delete clothing items that remain part of the owner's wardrobe.

6. FEATURE FOUR: IMAGE UPLOADS AND STORAGE

This feature involves user-generated photographs, so image handling must be secure and efficient.

Inspect the existing image-storage infrastructure before selecting an implementation.

Reuse the current provider if it is suitable.

Requirements
Accept supported image formats only.
Validate uploads on the server.
Enforce reasonable file-size limits.
Generate image variants or thumbnails where appropriate.
Optimise images for mobile and desktop viewing.
Preserve reasonable visual quality.
Avoid loading original high-resolution images unnecessarily in feed previews.
Handle upload failures and retries.
Prevent unauthorised access to private images.
Avoid exposing storage credentials in client-side code.
Remove unnecessary EXIF metadata, including embedded GPS coordinates, where supported.
Implement appropriate deletion and cleanup behaviour.

Private images must not become publicly accessible merely because they are uploaded to a storage service.

Use private storage and authorised access mechanisms where required.

For public images, use the existing application's appropriate public-image delivery mechanism.

Do not create a second storage system unless the current one cannot support these requirements.

7. FEATURE FIVE: DISCOVER FEED

Build a dedicated Discover page.

The feed should display outfit posts that the current viewer is authorised to access.

Feed cards

Each card should include:

Creator's profile photograph.
Creator's display name.
Outfit photograph.
Caption.
Optional fashion tags.
Like button.
Save button.
Comment entry point, when implemented.
Link to the creator's profile.
Optional associated clothing-item previews.
Feed behaviour

Implement:

Pagination or infinite scrolling.
Loading states.
Empty states.
Error handling.
Responsive layouts.
Image-loading optimisation.
Duplicate-request prevention.
Stable pagination behaviour.

Do not fetch the entire post database and filter it in the browser.

Apply visibility restrictions and pagination at the query or backend level.

Initial feed strategy

Prioritise a simple, reliable feed over an elaborate recommendation algorithm.

A reasonable initial approach is:

Display recent posts the viewer can access.
Support discovery of public creators.
Introduce followed-user prioritisation when the follow system is implemented.
Leave advanced ranking for a later phase.

Do not invent engagement metrics or populate the production feed with fake users.

When a new user has no accessible posts to view, provide a useful empty state that encourages exploration or publishing an outfit.

8. FEATURE SIX: FOLLOWING SYSTEM

Implement follow and unfollow functionality.

Users should be able to follow other users and see their follower and following counts.

Requirements
Follow a user.
Unfollow a user.
Prevent duplicate follow relationships.
Prevent invalid self-follow relationships where inappropriate.
Display followers and following lists.
Update counts accurately.
Enforce access permissions for restricted profiles and content.
Handle deleted accounts and removed relationships safely.

Use the existing authentication identity as the relationship key.

Enforce uniqueness at the database level where supported.

Feed integration

Once the follow system is working, allow the feed to prioritise content from followed users without excluding other discoverable public content unnecessarily.

If the product uses approved followers for restricted content, implement that authorisation explicitly rather than assuming that all follows grant access.

9. FEATURE SEVEN: LIKES AND SAVED OUTFITS

Implement lightweight social interactions.

Likes

Users should be able to like and unlike posts.

Requirements:

One active like per user per post.
Accurate counts.
Persistent state across sessions.
Appropriate handling of deleted posts.
Protection against duplicate requests and race conditions.
Saved outfits

Users should be able to save outfits for later reference.

Saved posts must be private to the user unless the product explicitly introduces a sharing feature.

Users should be able to:

Save a post.
Remove it from saved posts.
Browse saved outfits.
Open the original post when it remains available and accessible.

Saving an outfit must not copy private content into a public collection.

If a post becomes private or is deleted, ensure saved references do not bypass the original access restrictions.

10. FEATURE EIGHT: AI OUTFIT RECREATION

This is one of Closet AI's most important differentiators.

A user should be able to view an outfit post and select:

"Recreate this look."

The application should compare the inspiration outfit with the user's own wardrobe and suggest similar combinations.

Initial implementation

Reuse the existing AI styling functionality wherever possible.

Inspect how wardrobe items are represented and how recommendations are generated.

Use available attributes such as:

Clothing category.
Colour.
Style.
Occasion.
Garment type.
Other relevant metadata already present in the application.

If suitable visual analysis is available, it may also be used to extract attributes from an inspiration photograph.

Do not assume every photograph can be reliably decomposed into individual garments.

Example

Inspiration outfit:

Black oversized T-shirt.
Grey cargo trousers.
Black sneakers.

User's wardrobe:

Black graphic T-shirt.
Grey relaxed-fit trousers.
White sneakers.

The recommendation might be:

"Try your black graphic T-shirt with the grey trousers. Your white sneakers will create a lighter contrast while preserving the casual streetwear style."

Requirements
Only access wardrobe items the current user is authorised to use.
Do not expose another user's private wardrobe to the AI service.
Avoid sending unnecessary personal information to external AI providers.
Explain when a recommended item is an approximate match.
Provide useful alternatives when the user's wardrobe lacks a matching item.
Handle empty wardrobes and AI failures gracefully.
Avoid making unsupported claims about clothing attributes.
User experience

The user should be able to:

Open an outfit post.
Select "Recreate this look."
Receive a proposed combination from their own wardrobe.
Review the recommended items.
Save the combination to their own outfits, if supported by the existing application.

If the existing application already supports saved outfit combinations, integrate with that functionality rather than creating a parallel system.

Do not implement a completely new AI pipeline if the current recommendation system can be extended.

11. FEATURE NINE: PROFILE AND NAVIGATION INTEGRATION

Integrate the new social features into the existing application navigation.

A possible structure is:

Home: Existing personalised recommendations and styling experience.
Discover: Social outfit feed.
My Closet: Existing wardrobe management.
Activity: Social notifications, where implemented.
Profile: Personal profile and published content.

Treat this as a proposed information architecture, not a requirement to replace a working navigation system blindly.

Inspect the existing interface and adapt the structure to the current application.

Design principles
Maintain the existing Closet AI branding.
Use consistent typography, spacing, and components.
Prioritise the outfit photographs.
Keep navigation understandable.
Make the interface responsive.
Support keyboard navigation where appropriate.
Provide clear focus states and accessible labels.
Use loading skeletons or equivalent loading indicators where suitable.
Avoid excessive animation.
Do not introduce visual clutter.

The interface should feel like a polished fashion application rather than a generic social-media template.

Do not redesign unrelated pages unless necessary for integration.

12. FEATURE TEN: NOTIFICATIONS

Implement notifications for relevant social activity if the existing application supports a suitable notification architecture.

Potential notification events include:

Someone follows the user.
Someone likes their post.
Someone comments on their post, if comments are implemented.
Other relevant interactions introduced by the feature.
Requirements
Store notifications using the existing database architecture.
Track read and unread states.
Allow users to navigate to the relevant post or profile.
Avoid duplicate notifications from retried requests.
Prevent unauthorised access to another user's notifications.
Handle deleted users and posts.
Avoid exposing private content in notification previews.

Do not introduce a complex real-time infrastructure solely for the initial implementation.

Start with reliable persistent notifications and add real-time updates if the existing architecture supports them efficiently.

13. FEATURE ELEVEN: MODERATION AND USER SAFETY

Because users can upload photographs and interact with one another, introduce essential moderation and safety controls.

Implement the following where compatible with the current product:

Reporting

Users can report an outfit post or profile.

A report should record the relevant target, reporting user, reason, timestamp, and moderation status.

Blocking

Users can block other users.

A block should prevent the blocked relationship from enabling unwanted interactions or access to restricted content.

Define and enforce the expected effects across profiles, feeds, follows, and messaging if available.

Content removal

Post owners should be able to remove their own posts.

Provide an administrative moderation path if an administrative system already exists.

Rate limiting

Protect sensitive endpoints against abuse, including:

Follow and unfollow actions.
Likes.
Comment creation, if implemented.
Post creation.
Image uploads.
Reporting.
Privacy

Do not expose private wardrobe contents or private profile information through public endpoints, feed queries, notifications, or search results.

Do not treat a user's public profile as consent to publish every item in their wardrobe.

14. DATABASE AND BACKEND ARCHITECTURE

Before adding tables, inspect the existing schema.

Introduce only the new entities required by the implementation.

Depending on the existing architecture, these may include:

Outfit posts.
Post-to-wardrobe-item relationships.
Follow relationships.
Likes.
Saved posts.
Notifications.
Reports.
Blocks.

Profile and clothing-item visibility may require extending existing models.

Database requirements
Use the existing user ID for relationships.
Apply foreign keys where supported.
Add appropriate uniqueness constraints.
Index fields used frequently in feed queries.
Use transactions for multi-step operations where necessary.
Implement pagination efficiently.
Handle account and post deletion consistently.
Prevent duplicate relationships and interactions.
Enforce privacy at the appropriate data-access layer.
Migration safety

If database changes are necessary:

Create explicit, version-controlled migrations.
Preserve existing records.
Avoid destructive changes.
Document new relationships.
Verify rollback or recovery procedures where practical.
Test the migration against a development or test database before production deployment.

Do not drop or recreate existing tables to simplify implementation.

Do not change authentication providers merely to support this feature.

15. SECURITY REQUIREMENTS

Treat this as a multi-user application containing personal photographs and private wardrobe data.

Implement and verify:

Server-side authorisation.
Appropriate database access policies.
Secure session handling using the existing authentication system.
Input validation.
Output encoding.
Protection against unauthorised record modification.
Secure image-upload handling.
Appropriate rate limiting.
Privacy-aware logging.
Safe error messages.
Correct access control for all newly introduced endpoints.

Do not trust user IDs supplied by the client when determining which resources the authenticated user owns.

Do not assume that an unpredictable identifier is sufficient protection.

Every operation must verify that the authenticated user is permitted to perform it.

A user must never be able to access another person's private wardrobe by modifying a request.

16. PERFORMANCE REQUIREMENTS

The social features must remain usable as the number of users and photographs grows.

Implement:

Server-side pagination.
Appropriate database indexes.
Thumbnail generation or image variants where useful.
Lazy image loading.
Efficient queries that avoid unnecessary repeated database calls.
Appropriate caching where safe.
Duplicate-request prevention.
Efficient retrieval of engagement counts.

Do not cache private content in a way that could expose it to another user.

Avoid introducing additional paid services unless they are necessary and justified by the existing architecture.

Reuse the application's current infrastructure whenever practical.

17. IMPLEMENTATION PHASES

Build the feature in the following order.

Phase 1: Codebase audit and architecture
Inspect existing code.
Document relevant models, routes, components, and services.
Identify reuse opportunities.
Define the database changes and authorisation rules.
Establish the implementation plan.
Phase 2: Profiles and privacy
Implement public profile functionality.
Add wardrobe visibility settings.
Add per-item visibility where needed.
Enforce permissions.
Test private-data isolation.
Phase 3: Outfit publishing
Implement post creation.
Integrate image uploads.
Add captions and optional tags.
Associate posts with wardrobe items.
Add editing, deletion, and visibility controls.
Phase 4: Discover feed
Build the feed interface.
Add efficient pagination.
Implement public profile navigation.
Add appropriate empty, loading, and error states.
Phase 5: Social interactions
Implement follows.
Implement likes.
Implement saved outfits.
Add notifications if supported by the existing architecture.
Phase 6: AI outfit recreation
Integrate with the existing AI styling system.
Match inspiration outfits against the user's wardrobe.
Display recommendations and alternatives.
Support saving recommendations where existing functionality allows.
Phase 7: Safety and production readiness
Implement reporting and blocking.
Verify authorisation and database policies.
Test uploads and privacy restrictions.
Test performance and error handling.
Verify responsive layouts.
Run relevant automated tests.
Run linting and type checks.

Do not declare the feature complete merely because the interface renders. Verify that the underlying operations work correctly.

18. TESTING REQUIREMENTS

Test the feature against realistic scenarios.

Account and profile tests
Two users have identical display names.
A user edits their own profile.
A user attempts to modify another user's profile.
A user views a public profile.
A user attempts to access a restricted profile.
Wardrobe privacy tests
A user has a private wardrobe.
A user has a public wardrobe containing private items.
A user publishes an outfit containing references to private wardrobe items.
An unauthorised user attempts to retrieve a private item.
A private image URL is accessed without authorisation.
Post tests
A user creates an outfit post.
A user edits their own post.
A user attempts to edit another user's post.
A user deletes a post.
An upload fails.
A user changes post visibility.
Social interaction tests
A user follows and unfollows another user.
Duplicate follows are prevented.
A user likes and unlikes a post.
Duplicate likes are prevented.
A user saves and unsaves an outfit.
A user attempts to access another user's saved posts.
AI tests
The user's wardrobe contains suitable matching items.
The wardrobe contains only partial matches.
The wardrobe is empty.
AI processing fails.
A recommendation does not expose another user's private wardrobe.
Regression tests

Verify that the existing wardrobe-management and AI styling features still work.

Run the available automated tests, lint checks, and type checks.

Resolve regressions introduced by the implementation.

19. DELIVERABLES

At the end of the implementation, provide:

A summary of the features implemented.
A list of files created or modified.
A description of database changes and migrations.
A description of any new endpoints or server actions.
An explanation of how privacy and authorisation are enforced.
A summary of the tests executed and their results.
Any remaining limitations or unfinished work.
Any required environment variables or deployment configuration.
Any manual setup steps required before deployment.

Clearly distinguish between:

Fully implemented features.
Partially implemented features.
Features that remain planned.

Do not claim a feature is complete if it has only been implemented in the frontend.

20. FINAL INSTRUCTION

Build Closet AI as a cohesive AI-powered wardrobe and social fashion platform while preserving the existing application.

Prioritise correctness, privacy, maintainability, and a polished user experience over unnecessary complexity.

Inspect before modifying.

Reuse before rebuilding.

Validate before exposing data.

Test before declaring completion.

Avoid unrelated refactoring.

Begin by auditing the codebase and presenting the implementation plan. Then proceed with the first implementation phase, verify it, and continue through the remaining phases without replacing working features unnecessarily.

My advice before you run this prompt

There are three decisions I'd make deliberately rather than leave entirely to your coding agent.

1. Don't make every outfit public automatically

Use private by default, with an explicit choice to publish an outfit publicly or restrict it to followers.

A user's decision to upload clothes into a personal wardrobe should not automatically make those clothes visible to the world.

2. Build the social feed before adding more AI complexity

Your existing AI wardrobe functionality is already a substantial component. First establish that users can publish outfits, discover people, follow accounts, and save inspiration.

Then connect the feed to AI outfit recreation.

That gives you a measurable foundation before spending additional time or money on more AI processing.

3. Don't implement everything in one untested coding pass

The prompt defines the overall project, but the implementation should be incremental.

After the agent finishes the first phase, verify the database changes and privacy rules. After it finishes publishing, test image uploads and deletion. After it builds the feed, test visibility restrictions using multiple accounts.

This is particularly important because Closet AI will contain both personal wardrobe information and photographs of people.

The end goal is not just a place where people post outfits. It's a platform where people discover styles and use AI to recreate those styles with clothes they already own. That connection is what gives Closet AI its strongest product differentiation.