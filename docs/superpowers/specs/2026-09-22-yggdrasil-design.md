# Yggdrasil: 3D Asset Studio Design

Date: 2026-09-22

Status: Approved in conversation; awaiting written-spec review

## Product Summary

Yggdrasil is a local-first, single-owner web application for importing, understanding, optimizing, customizing, animating, and exporting 3D assets for use in other websites. It will initially run from `C:\dev\yggdrasil` as a local Next.js application and will retain a clean path to hosted deployment later.

The product is intentionally not a browser replacement for Blender. It focuses on preparing existing web-oriented assets and building interactive Three.js and GSAP experiences around them.

The name reflects the product's role as a central system that connects assets to multiple websites, including Valkyrie and Einherji.

## Goals

- Import GLB, GLTF, FBX, and OBJ assets from individual files, folders, or ZIP packages.
- Preserve and catalog existing meshes, materials, textures, cameras, lights, skeletons, morph targets, and animation clips.
- Explain model structure and web-performance risks without modifying assets automatically.
- Offer reversible, opt-in optimizations with before-and-after estimates.
- Provide a guided workflow for visual customization, interactions, and GSAP animation authoring.
- Support embedded, imported, and visually generated animations.
- Export reusable React components, embeddable viewers/configurations, and complete downloadable packages.
- Store structured project data in Neon PostgreSQL through Drizzle ORM.
- Protect the single-owner application with Better Auth.
- Keep large source and generated files on the local filesystem for the first release.
- Leave explicit extension points for hosted object storage and optional AI-assisted semantic recognition.

## Non-Goals for the First Release

- Full mesh modeling, sculpting, UV editing, or texture painting.
- Full skeletal keyframe authoring comparable to Blender or Maya.
- Multi-user teams, sharing, roles, or permissions.
- Offline database synchronization; Neon connectivity is required.
- Automatic invocation of the local Codex CLI from the application.
- A required paid AI service. Technical analysis must work without an AI API.
- Mobile-first authoring. Editing is desktop-first, with tablet support where practical.

## Chosen Architecture

Yggdrasil will be a modular Next.js application using the Node.js runtime.

### Client application

- Next.js App Router for routing and application composition.
- React Three Fiber and Drei for the primary Three.js viewport and interaction layer.
- Direct Three.js APIs where React abstractions are insufficient.
- GSAP and ScrollTrigger for timeline playback and website interaction behavior.
- Web Workers for CPU-heavy browser-safe analysis that would otherwise block rendering.
- An adaptive visual system: a light application shell and a dark 3D editing workspace.

### Server application

- Next.js server actions and route handlers for authenticated mutations and APIs.
- Node-only processing modules for conversion, normalization, thumbnails, optimization, and packaging.
- Long-running processing represented as jobs with progress, cancellation, logs, and retry state.
- Processing concerns isolated behind interfaces so they can move to a separate worker service later.

### Persistence

- Neon PostgreSQL is the required online database.
- Drizzle ORM owns application schema and migrations.
- Better Auth owns the single-user authentication and session flow through its Drizzle-compatible database integration.
- Original model packages, normalized models, textures, previews, and exports live in an app-managed local data directory.
- Database records refer to files by stable internal asset/file IDs and normalized relative storage keys, not fragile absolute user paths.
- Binary model data is not stored in ordinary PostgreSQL columns.

### Extension boundaries

- A storage adapter separates local filesystem storage from future object storage.
- An analysis-provider interface separates deterministic inspection from future optional AI analysis.
- An export-target interface allows React, embed, and downloadable-package outputs to share a common project representation.

## Guided Workflow

The main workflow is:

1. Import
2. Analyze
3. Optimize
4. Appearance
5. Scene
6. Interactions
7. Animate
8. Export

The editor autosaves progress after meaningful changes. A persistent step navigator shows completion, warnings, processing state, and unsaved changes. Users can revisit earlier steps without discarding later work.

### 1. Import

- Accept `.glb`, `.gltf`, `.fbx`, and `.obj` files.
- Accept complete folders and ZIP archives to preserve dependent resources.
- Discover textures, MTL files, thumbnails, attribution/license text, and alternate model variants.
- Validate archive paths and reject path traversal or unsafe executable content.
- Copy the complete source package into protected local storage before processing.
- Preserve the source package unchanged for recovery and provenance.
- Create database records transactionally so failed imports do not leave partial assets.

### 2. Analyze

Technical analysis inventories:

- Scenes, nodes, meshes, primitives, vertex attributes, and bounding volumes.
- Materials, textures, texture dimensions, color spaces, and UV channels.
- Cameras, lights, skeletons, bones, skins, morph targets, and animation clips.
- File size, vertices, triangles, draw calls, animation durations, and likely runtime cost.
- Missing dependencies, unsupported features, duplicate resources, and unused resources.

Semantic inference uses deterministic evidence such as names, hierarchy, material associations, geometry placement, and rig relationships. Difficult cases can be reviewed manually with Codex outside the application. A future optional provider may submit rendered views and structured metadata to a cloud model, but AI is not required for the first release.

### 3. Optimize

The system presents recommendations individually. Each recommendation includes the reason, expected benefit, quality trade-off, and affected resources. The user must approve every operation.

Initial operations include:

- Normalize supported inputs to web-ready GLB variants.
- Remove unused resources.
- Resize or compress selected textures.
- Apply compatible geometry and mesh compression.
- Generate configurable lower-detail geometry where safe.
- Repair or report straightforward metadata and material issues.

Every output is a new asset version. Original uploads remain immutable, and applied operations are recorded so the user can compare or revert versions.

### 4. Appearance

- Edit transforms, visibility, materials, textures, colors, opacity, and common PBR properties.
- Select objects through either the viewport or a searchable hierarchy.
- Store edits as project configuration or generated variants rather than modifying the original package.

### 5. Scene

- Configure environment, lighting, shadows, background, camera, controls, tone mapping, and presentation framing.
- Preview common responsive viewport sizes and reduced-motion behavior.

### 6. Interactions

- Add click and hover behavior to selectable parts.
- Add hotspots, annotations, camera targets, and named actions.
- Use structured trigger/action records rather than arbitrary user-written JavaScript in the initial release.

### 7. Animate

Yggdrasil supports three animation sources:

1. Embedded clips already present in a model.
2. Additional compatible clips imported into a project.
3. Visual GSAP timelines created in the editor.

Users can rename, duplicate, trim, retime, loop, blend, sequence, reorder, disable, and remove project animations. Imported clips undergo skeleton and bone-mapping validation. A mapping preview identifies matched, missing, and ambiguous bones before the clip is attached.

Removing or editing an animation changes the project representation or a derived version; it does not modify the preserved source package.

The visual GSAP timeline can target object transforms, material properties, cameras, lights, morph values, and named parts. Triggers include timeline start, scroll position, click, hover, and model/clip events.

### 8. Export

Each project can produce:

- A reusable React and Three.js component with its assets and typed configuration.
- An embeddable viewer and serializable configuration.
- A complete downloadable package containing assets, runtime code, dependencies, documentation, and attribution.

Export supports these loading policies:

- `on-demand`
- `metadata-first`
- `critical-assets`
- `full-preload`

Users can mark critical models, textures, and opening animations. Generated packages include preload hints, progress events, loading UI hooks, error fallbacks, and lazy loading for noncritical resources.

## User Interface

The interface is a guided wizard rather than a permanently visible professional studio layout.

- Library, import, analysis, settings, and export history use a clean light presentation.
- Model inspection, appearance, scene, interactions, and animation use a dark, model-centered workspace.
- Each step has one visually dominant primary action.
- Advanced controls are progressively disclosed and do not obstruct the default path.
- A project history panel exposes reversible changes and generated versions.
- Keyboard shortcuts cover undo, redo, save, playback, transforms, and frame-selection.
- Controls use accessible labels, visible focus states, sufficient contrast, reduced-motion support, and warnings that do not rely on color alone.
- Complex editing is optimized for desktop; tablet layouts remain usable for review and basic adjustments.

## Data Model

The initial logical entities are:

- `users`, `sessions`, `accounts`, and verification records managed by Better Auth.
- `assets` for logical library entries.
- `asset_sources` for immutable imported packages and provenance.
- `asset_files` for source and generated file manifests.
- `asset_versions` for normalized or optimized variants.
- `scene_analyses` for analysis runs and summaries.
- `scene_nodes`, `meshes`, `materials`, `textures`, `skins`, `morph_targets`, `cameras`, and `lights` for searchable technical metadata.
- `animation_clips` and `animation_bindings` for embedded and imported animation data.
- `findings`, `optimization_operations`, and `operation_results` for proposed and applied changes.
- `projects` and `project_steps` for wizard state.
- `scene_configs`, `interaction_configs`, `timeline_configs`, and `loading_policies` for non-destructive authoring state.
- `export_jobs` and `export_artifacts` for generated outputs and manifests.

Large or highly variable inspection details may be stored as validated JSONB snapshots alongside normalized searchable summaries. Schema-owned records remain the source of truth for user-created state.

## Error Handling and Recovery

- Import validation happens before database finalization.
- Failed imports clean up temporary files and leave the immutable source area unchanged.
- Missing textures and dependencies list the expected filename and the model that referenced it.
- Unsupported model features produce warnings when a partial preview remains safe and errors when correctness cannot be preserved.
- Animation compatibility failures identify unmatched or ambiguous bones and do not mutate the project.
- Optimization failures retain the prior version and operation log.
- Interrupted jobs can be retried from their last safe boundary.
- Export validation confirms that manifests, referenced assets, and generated entry points are complete before marking an artifact ready.
- Database or network failures display persistent retry state; the application does not pretend a Neon-backed save succeeded.

## Security and Privacy

- All authoring and mutation routes require the authenticated owner session.
- The first-run setup creates the single owner account; public registration is disabled afterward.
- Secrets remain in server-only environment configuration.
- Uploads are checked by signature and parser behavior rather than trusting file extensions.
- ZIP extraction rejects absolute paths, parent-directory traversal, symlinks, and excessive expansion.
- File access is restricted to storage keys rooted in the configured asset directory.
- Generated embed packages do not contain Neon credentials or private application secrets.
- No model data is sent to an AI provider in the initial release.

## Testing Strategy

### Unit tests

- Format and dependency detection.
- Manifest normalization and safe storage-key resolution.
- Analysis calculations and warning rules.
- Timeline serialization and loading-policy generation.
- Animation compatibility and bone-mapping logic.
- Drizzle repositories and domain services at their boundaries.

### Integration tests

- Import a complete folder or ZIP and verify transactional database/file behavior.
- Normalize each supported format and re-open the result.
- Apply, compare, and revert an optimization.
- Attach compatible and incompatible animation clips.
- Generate each export target and validate its manifest.

### Browser tests

- Owner login and protected navigation.
- Complete wizard path from import through export.
- Autosave, undo/redo, job progress, cancellation, and retry.
- Viewport selection, configuration editing, timeline authoring, and loading-policy selection.

The provided Mega Wyvern asset is a representative private local test case: two GLTF variants, one external texture option, 78 nodes, one skinned mesh, one material, one camera, and 11 animation clips. It will only be committed as a test fixture if its redistribution license explicitly permits that; otherwise tests will reference it locally and the repository will contain a small purpose-built fixture.

## Delivery Boundaries

The first usable release is complete when the owner can:

1. Sign in locally.
2. Import the Mega Wyvern-style folder or ZIP successfully.
3. Inspect its structure, rig, material, texture, camera, and animation inventory.
4. Review and selectively apply optimization recommendations.
5. Change appearance and scene presentation non-destructively.
6. Add interactions and a visual GSAP timeline.
7. Edit existing clips, import a compatible clip, and validate its mapping.
8. Select a preload strategy.
9. Export a working React component, embed package, and downloadable bundle.
10. Reopen the project from Neon-backed metadata and local files without losing state.

## Implementation Constraints

- Exact package versions will be resolved from current stable releases at implementation time and locked in the package manager lockfile.
- The initial repository and runtime live at `C:\dev\yggdrasil`.
- Application modules remain small and responsibility-focused so format handlers, analyzers, optimizers, storage providers, and exporters can be tested independently.
- New hosted capabilities must reuse the provider boundaries instead of adding hosting assumptions directly to editor components.
