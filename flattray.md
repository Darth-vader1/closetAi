ClosetAI Flatlay Studio — implementation plan

The best approach is to build Flatlay Studio as a two-stage outfit composition tool: ClosetAI automatically arranges clothing from the user's wardrobe into a polished flatlay, then gives the user a visual editor to refine every item's position, size, and rotation.

The reference image you shared is the target for the collage layout: individual garments and accessories on a clean background, arranged at different sizes without being forced into a rigid grid.

We'll also support editorial layouts for users who prefer a more structured, magazine-inspired presentation.

1. The intended user experience

Step 1 — Select wardrobe items

The user chooses a top, bottoms, shoes, bag, jewellery, glasses, and other accessories from their existing ClosetAI wardrobe. They can also start with a saved outfit.

Step 2 — Generate a flatlay

ClosetAI classifies the selected items using existing wardrobe metadata and arranges them using a layout preset. The result uses actual garment images rather than invented AI replacements.

Step 3 — Customize the composition

Users drag items, resize them, rotate them, change the background, switch layouts, undo changes, and reset the arrangement.

Step 4 — Save and share

Save the composition to the user's outfits, export a high-resolution image, or share the finished look through ClosetAI Connect when that integration is available.

2. Layout presets

Collage — Reference style

Asymmetric placement, varied item sizes, balanced whitespace, and a plain background. Best for expressive outfits and social sharing.

Editorial — Magazine style

More deliberate alignment, consistent spacing, and a clear visual hierarchy. Best for polished outfit boards.

Y2K / Streetwear

Expressive placement and larger statement pieces, with space for accessories.

Minimal / Capsule

Clean spacing, restrained composition, and a focus on versatile clothing combinations.

These are starting templates, not separate editors. They should all use the same composition engine, so users can switch presets and continue editing.

3. Recommended technical architecture

Since ClosetAI already uses Next.js and Supabase, keep the composition engine primarily on the client. You don't need an AI API call every time a user rearranges an item.

Existing ClosetAI wardrobe

Clothing images, categories, metadata, saved outfits

Composition engine

Select items · choose preset · calculate initial positions

Interactive editor

Drag · resize · rotate · layers · undo/redo

Save composition

Export image

Suggested libraries
Requirement	Recommendation
Interactive canvas	Fabric.js or Konva with React-Konva
UI transitions	Your existing Framer Motion / Motion setup
Image storage	Existing Supabase Storage
Composition persistence	Existing Supabase database
Background removal	Optional image-processing service
Image export	Canvas-based PNG export

I would start with React-Konva if you want a dedicated canvas editor with draggable and transformable items. Fabric.js is also a strong choice if you need richer object manipulation. Inspect your existing dependencies before choosing; use only one canvas engine.

One critical detail: save the composition's item references and layout properties, not just a flattened screenshot. That allows users to reopen and edit a saved flatlay later.

4. Master prompt for Cursor

Copy the following prompt into your coding agent with the existing ClosetAI project open.

MASTER PROMPT — BUILD CLOSETAI FLATLAY STUDIO
MASTER PROMPT — BUILD CLOSETAI FLATLAY STUDIO
Role

Act as a senior Next.js engineer, frontend architect, canvas-editor specialist, and product designer.

You are implementing Flatlay Studio inside my existing application, ClosetAI, a digital wardrobe and AI-powered styling platform.

The feature must let users automatically create fashion flatlays from their actual wardrobe items, manually refine the composition, save editable outfit boards, and export finished images.

The target visual reference is an asymmetric fashion collage on a plain background, with a top, trousers, shoes, handbag, glasses, jewellery, and other accessories arranged together at different sizes.

The experience must also support structured editorial layouts and multiple visual presets.

1. Inspect the existing codebase first

Before changing code, inspect:

Next.js version and App Router or Pages Router.
TypeScript configuration.
Existing authentication and user profile system.
Supabase client initialization.
Database schema and migrations.
Wardrobe item and saved outfit models.
Clothing image storage and access controls.
Existing image optimization pipeline.
Existing design system and responsive components.
Existing animation libraries.
Existing testing tools.

Reuse the current wardrobe, outfit, image, and authentication systems.

Do not create duplicate tables or parallel authentication systems.

Do not rebuild the application or change its framework.

First provide a concise implementation plan based on the real codebase. Then implement the feature in stages without stopping at a plan alone, unless a genuine blocker requires clarification.

2. Core user journey

Implement this workflow:

User opens Flatlay Studio.
User selects clothing items from their existing wardrobe or starts from a saved outfit.
User chooses a layout preset.
ClosetAI automatically arranges the selected items.
User opens the interactive editor.
User moves, resizes, rotates, layers, or removes items.
User changes the canvas background or switches presets.
User previews the composition.
User saves an editable version.
User exports a high-resolution PNG.
User can reopen a saved composition and continue editing it.

Make this workflow fully functional. Do not build a static mockup or decorative interface with nonfunctional controls.

3. Automatic composition engine

Create a reusable layout engine that accepts a list of authorized wardrobe items and returns deterministic placement instructions.

Each composition item should reference the existing wardrobe record and contain the properties required for rendering, such as:

Stable composition-item ID.
Wardrobe-item ID.
Position X and Y.
Width and height or scale.
Rotation.
Layer order.
Optional visibility state.
Optional lock state.

Adapt the model to the selected canvas library.

The layout engine must consider:

Clothing category.
Original image aspect ratio.
Available canvas space.
Item importance.
Visual hierarchy.
Whitespace.
Collisions and overlap.
Number of selected items.

Use clothing categories to inform placement.

For example:

Tops generally occupy the upper area.
Trousers and skirts generally occupy a lower or adjacent area.
Shoes occupy a lower region.
Bags and accessories occupy available supporting spaces.

These rules must remain flexible rather than forcing every composition into a rigid template.

Use a deterministic layout algorithm so that regenerating the same layout with the same input produces the same initial positions.

Do not make an external AI request every time the user generates or edits a composition.

Provide a regenerate-layout action that creates a new arrangement without changing the selected wardrobe items.

4. Layout presets

Implement a preset system using shared composition-engine infrastructure.

Initial presets:

A. Reference Collage

Asymmetric composition.
Mixed item sizes.
Generous whitespace.
Plain background.
Fashion mood-board aesthetic.

B. Editorial

More deliberate alignment.
Balanced spacing.
Clear visual hierarchy.
Magazine-inspired composition.

C. Streetwear / Y2K

Expressive asymmetric placement.
Larger statement pieces.
Space for accessories.

D. Minimal / Capsule

Restrained spacing.
Balanced composition.
Focus on versatile pieces.

E. Grid / Catalogue

Consistent alignment.
Organized product-like presentation.

Presets should define initial layout rules and visual defaults, not create separate editor implementations.

Users must be able to switch presets after generation.

When switching presets, preserve the selected clothing items. Ask for confirmation only when a meaningful user edit could otherwise be lost.

Provide an option to retain manual edits where feasible.

5. Interactive editor

Use a canvas library suited to the existing application.

Evaluate React-Konva or Fabric.js before installing anything. Prefer one canvas engine rather than combining both.

Build a responsive editor with:

Main composition canvas.
Clothing-item selection or add-item panel.
Layout preset selector.
Background selector.
Selected-item controls.
Layer ordering controls.
Undo and redo.
Reset layout.
Regenerate layout.
Save.
Export.
Loading and error states.

Required object interactions:

Select an item.
Drag an item.
Resize an item while preserving aspect ratio by default.
Rotate an item.
Bring an item forward.
Send an item backward.
Hide or show an item where supported.
Lock or unlock an item where supported.
Remove an item from the composition.
Add more items from the user's wardrobe.

Support keyboard shortcuts where appropriate, including undo, redo, and delete for the selected item.

Prevent keyboard shortcuts from interfering with text inputs.

Allow selection handles and controls to appear only when appropriate.

The editor must be usable on mobile screens. Provide touch-friendly controls and avoid making the desktop canvas simply overflow offscreen.

Use a consistent internal coordinate system and scale the canvas to fit the viewport without corrupting saved positions.

6. Garment image quality

Use the actual images from the user's wardrobe.

Do not replace actual garments with generated substitutes.

Preserve image aspect ratios and prevent clothing from being stretched.

Handle transparent PNG and WebP images correctly.

If the existing images have solid backgrounds, support them as they are. Do not assume all uploaded images have transparent backgrounds.

Where useful, integrate an optional background-removal workflow, but do not make it a prerequisite for the first usable release.

Do not silently remove backgrounds or alter the original stored image.

If background removal is added, store the processed image as a separate asset and retain the original.

Use appropriate optimized image variants for previews. Avoid loading unnecessarily large originals into the editor.

Respect private Supabase Storage permissions. Never expose service-role credentials or grant public access to private wardrobe images.

Ensure the export process can access authorized images reliably, including images originally obtained through expiring signed URLs.

7. Background and visual styling

Provide background presets:

White.
Off-white.
Cream.
Light grey.
Black or charcoal.
A restrained selection of additional colors.

If supported cleanly, allow users to choose a custom solid color.

Keep the initial visual style premium and fashion-oriented.

Avoid excessive UI decoration, large gradients, unnecessary animation, and generic dashboard styling.

The exported canvas should contain only the intended composition and any explicitly enabled design elements. Editor controls, selection borders, resize handles, and toolbars must never appear in the exported image.

8. Save and reopen editable compositions

Integrate saving with the existing authentication and database architecture.

Inspect the existing saved-outfit model before deciding how compositions should be stored.

If a new table is required, use a migration.

A composition record should contain appropriate fields such as:

ID.
Owner ID.
Name.
Canvas dimensions or aspect ratio.
Layout preset.
Background settings.
Composition data.
Created timestamp.
Updated timestamp.

Composition data must preserve the relationships to existing wardrobe items.

Use normalized relationships if required by the existing schema and access model. Do not store unnecessary copies of full wardrobe records.

Validate all referenced items on the server before saving.

Only the owner or another explicitly authorized collaborator may access or edit a private composition.

Saved compositions must reopen with their original item positions, sizes, rotations, and layer ordering.

If a referenced clothing item is deleted or becomes inaccessible, handle it gracefully and allow the user to repair the composition.

Do not automatically make compositions public.

If sharing is supported later, implement explicit visibility and permission controls.

9. Image export

Implement a functional export action.

The initial export format should be PNG.

Offer sensible output dimensions, including:

Square social post.
Portrait composition.
Landscape composition.
High-resolution export.

Use an appropriate pixel ratio and image-quality strategy.

Export the composition background and clothing images only.

Handle cross-origin images and private image retrieval safely so that canvas export does not fail because of an origin-tainted canvas.

Show an appropriate loading state during export.

Display a useful error if an image cannot be loaded or exported.

Do not report success until an export has actually been produced.

Where the application supports native file downloads, use the correct mechanism. For mobile, provide a practical share or save alternative when supported.

10. Framer Motion

Reuse the animation library already installed in the project.

Use Framer Motion or the existing Motion package for UI transitions, such as:

Studio opening.
Preset selection.
Item-panel transitions.
Toolbar appearance.
Save confirmation.
Empty states.
Smooth panel changes.

Do not use Framer Motion as a replacement for the canvas engine's object manipulation.

Canvas items must remain directly interactive.

Animations must not interfere with dragging, resizing, rotation, selection, or export.

Respect reduced-motion preferences.

11. Database and security

Inspect existing RLS policies and authorization patterns.

Any new table containing compositions or collaboration data must have appropriate Row Level Security policies.

At minimum:

Users can read their own private compositions.
Users cannot save or modify another user's composition without authorization.
Users cannot attach wardrobe items they do not own or have permission to use.
Users cannot access another user's private image by manipulating a client-supplied ID.
The server independently verifies ownership and access.
Service-role keys remain server-only.
Private image storage remains private.

Use database migrations, foreign keys, indexes, and constraints where appropriate.

Do not weaken existing security policies to simplify implementation.

12. Performance and reliability
Avoid unnecessary re-renders while dragging objects.
Keep interactive canvas operations responsive.
Debounce or batch persistence where appropriate.
Do not write to the database on every pointer movement.
Preserve unsaved edits if a temporary save operation fails.
Avoid unnecessary full-size image downloads.
Clean up event listeners and resources.
Handle loading, missing images, empty wardrobes, and failed exports.
Test with small and large numbers of clothing items.
Avoid layout shifts and broken images.
13. Testing

Use the project's existing testing tools.

Test:

Automatic placement.
Every preset.
Switching presets.
Dragging, resizing, and rotation.
Aspect-ratio preservation.
Layer ordering.
Undo and redo.
Save and reopen.
Export output.
Missing and deleted wardrobe items.
Private image access.
Unauthorized composition access.
Mobile usability.
Existing ClosetAI functionality.

Run linting, type checking, tests, and a production build where available.

Report the actual results. Do not claim a check passed unless it was run.

14. Implementation phases

Phase 1:

Wardrobe item selection.
Composition data model.
Automatic placement engine.
Reference Collage and Editorial presets.
Basic responsive canvas preview.

Phase 2:

Interactive drag, resize, and rotation.
Additional presets.
Background controls.
Layer ordering.
Undo, redo, and reset.

Phase 3:

Save and reopen editable compositions.
Database migration and authorization.
PNG export and output dimensions.

Phase 4:

Optional background removal.
Additional customization.
Sharing and collaboration integration.
Advanced templates.

Complete and test each phase before moving to the next.

Do not implement all phases as one enormous, unreviewable change.

15. Definition of done

The first production-ready version must let a logged-in user:

Select real wardrobe items.
Generate a flatlay automatically.
Switch between collage, editorial, and other presets.
Manually reposition, resize, and rotate items.
Change the background.
Undo and redo edits.
Save the composition.
Reopen and continue editing it.
Export a clean PNG without editor controls.
Use the feature without breaking existing ClosetAI functionality.

Begin by inspecting the actual codebase, then implement the first phase and continue through the roadmap where feasible. Clearly report completed phases, modified files, migrations, test results, setup requirements, and remaining work.

5. A few decisions that will make the result better
Keep manual edits separate from automatic layout. Users should be able to experiment without losing their original arrangement. Add an explicit “Regenerate” action.
Save editable compositions. A flatlay should not become a static image until export; users need to return and change the shoes, top, or accessories later.
Use real clothing cutouts where possible. Background removal will significantly improve the reference-style collage, but make it optional for the initial release.
Build sharing on top of saved compositions. That will let users share their finished flatlays through ClosetAI Connect instead of creating a separate sharing mechanism.