# Yggdrasil Foundation, Import, and Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Yggdrasil vertical slice: a tested Next.js application with single-owner Better Auth, Neon/Drizzle persistence, safe local asset storage, GLTF/GLB package import, deterministic technical analysis, an asset library, and a live Three.js preview.

**Architecture:** A modular Next.js Node-runtime application owns the UI and server APIs. Domain services depend on small repository and storage interfaces so imports can be tested without Neon or the filesystem, while production adapters use Drizzle/Neon and an app-managed local directory. Imported sources are immutable; analysis is stored separately and the preview reads only validated internal storage keys.

**Tech Stack:** Current stable Next.js, React, TypeScript, Tailwind CSS, Three.js, React Three Fiber, Drei, GSAP, Zod, Neon PostgreSQL, Drizzle ORM, Better Auth, glTF Transform, Vitest, Testing Library, and Playwright; pnpm lockfile records the exact resolved versions.

**Spec:** `docs/superpowers/specs/2026-09-22-yggdrasil-design.md`

## Global Constraints

- The initial repository and runtime live at `C:\dev\yggdrasil`.
- Neon PostgreSQL is required; there is no offline database synchronization layer.
- The application has one owner account; public registration is disabled after bootstrap.
- Original model packages are immutable and large binaries remain in app-managed local storage.
- Database records use stable internal IDs and storage keys, never arbitrary client-supplied absolute paths.
- The first import slice accepts GLB, GLTF, complete GLTF dependency selections, and ZIP packages; FBX and OBJ conversion belong to the next import-conversion plan.
- Deterministic technical analysis is available without a paid AI provider.
- No application route may invoke the local Codex CLI.
- Exact dependency versions are resolved from current stable releases during Task 1 and committed in `pnpm-lock.yaml`.
- Every mutation route runs on the Node.js runtime and requires an authenticated owner session unless explicitly identified as first-run bootstrap.

---

## File Structure

The plan creates these responsibility-focused areas:

```text
src/
  app/
    api/auth/[...all]/route.ts       Better Auth HTTP handler
    api/assets/import/route.ts       authenticated multipart import endpoint
    api/assets/[assetId]/file/route.ts validated model/texture streaming
    (auth)/sign-in/page.tsx          owner sign-in
    (studio)/layout.tsx              protected application shell
    (studio)/library/page.tsx        asset library
    (studio)/assets/[assetId]/page.tsx asset analysis and preview
    layout.tsx                       root metadata and global styles
    page.tsx                         auth-aware entry redirect
  auth/
    auth.ts                          Better Auth server configuration
    auth-client.ts                   browser auth client
    owner-policy.ts                  single-owner bootstrap policy
  db/
    client.ts                        Drizzle Neon client
    schema/auth.ts                   CLI-generated Better Auth schema
    schema/assets.ts                 application asset schema
    schema/index.ts                  schema export boundary
  features/assets/
    domain/types.ts                  shared asset/import/analysis types
    domain/errors.ts                 typed import errors
    application/import-asset.ts      transactional import orchestration
    application/get-asset.ts         asset detail query
    infrastructure/asset-repository.ts Drizzle repository
    infrastructure/gltf-analyzer.ts  GLTF/GLB deterministic inspection
    infrastructure/import-manifest.ts dependency and archive manifest validation
    ui/import-dropzone.tsx           upload interaction
    ui/asset-card.tsx                library presentation
    ui/analysis-summary.tsx          technical report presentation
  features/viewer/
    model-canvas.tsx                 client-only R3F canvas
    model-scene.tsx                  validated model loader and framing
    viewer-error-boundary.tsx        recoverable WebGL/model errors
  lib/
    env/server.ts                    server environment validation
    ids.ts                           UUID helpers
    storage/types.ts                 local-storage interface
    storage/local-storage.ts         safe filesystem adapter
    storage/storage-key.ts           traversal-proof key validation
  test/
    setup.ts                         DOM matcher setup
    fixtures/create-gltf-fixture.ts  redistributable generated fixture
e2e/
  smoke.spec.ts                      application shell smoke test
  import-flow.spec.ts                authenticated import vertical slice
drizzle.config.ts                    migration configuration
vitest.config.ts                     unit/integration test configuration
playwright.config.ts                 browser test configuration
.env.example                         documented required variables
```

Files generated by the current Better Auth CLI remain isolated in `src/db/schema/auth.ts`; application tables never modify generated auth definitions directly.

---

### Task 1: Establish the Current Stable Application and Test Harness

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/test/setup.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: approved design specification only.
- Produces: scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:watch`, and `test:e2e`; import alias `@/* -> src/*`; a browser-renderable root route.

- [ ] **Step 1: Resolve and install the latest stable dependency set**

Run:

```powershell
corepack enable
pnpm init
pnpm add next@latest react@latest react-dom@latest three@latest @react-three/fiber@latest @react-three/drei@latest gsap@latest zod@latest drizzle-orm@latest @neondatabase/serverless@latest better-auth@latest @better-auth/drizzle-adapter@latest @gltf-transform/core@latest @gltf-transform/extensions@latest @gltf-transform/functions@latest fflate@latest file-type@latest clsx@latest tailwind-merge@latest lucide-react@latest
pnpm add -D typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest @types/three@latest eslint@latest eslint-config-next@latest tailwindcss@latest @tailwindcss/postcss@latest vitest@latest @vitejs/plugin-react@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest @playwright/test@latest drizzle-kit@latest tsx@latest
pnpm exec playwright install chromium
```

Record the resolved versions with `pnpm list --depth 0` in the task notes. Do not replace stable packages with release candidates unless the stable package's own official installation path requires it.

- [ ] **Step 2: Write the failing smoke test**

Create `e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("shows the Yggdrasil entry screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Yggdrasil" })).toBeVisible();
  await expect(page.getByText("Prepare 3D assets for the web")).toBeVisible();
});
```

- [ ] **Step 3: Configure the application and verify the test fails**

Set `package.json` to `private: true`, `type: "module"`, and add these scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

Configure Playwright to start `pnpm dev` at `http://127.0.0.1:3000`. Run:

```powershell
pnpm test:e2e -- e2e/smoke.spec.ts
```

Expected: FAIL because the Yggdrasil entry content does not exist.

- [ ] **Step 4: Implement the minimal root page and shared test setup**

Create a server-rendered page with this semantic core:

```tsx
export default function HomePage() {
  return (
    <main>
      <p>3D asset studio</p>
      <h1>Yggdrasil</h1>
      <p>Prepare 3D assets for the web</p>
    </main>
  );
}
```

Configure Tailwind through `@tailwindcss/postcss`, Vitest with `jsdom`, Testing Library setup, and the `@/*` TypeScript alias. Add root metadata title `Yggdrasil` and description `Local-first 3D asset preparation studio`.

- [ ] **Step 5: Verify the foundation**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e -- e2e/smoke.spec.ts
pnpm build
```

Expected: every command exits 0 and the smoke test passes.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs src/app src/test vitest.config.ts playwright.config.ts e2e/smoke.spec.ts
git commit -m "build: establish Yggdrasil application foundation"
```

---

### Task 2: Add Validated Environment, Neon/Drizzle, and Single-Owner Better Auth

**Files:**
- Create: `.env.example`
- Create: `drizzle.config.ts`
- Create: `src/lib/env/server.ts`
- Create: `src/lib/env/server.test.ts`
- Create: `src/db/client.ts`
- Create: `src/db/schema/auth.ts`
- Create: `src/db/schema/assets.ts`
- Create: `src/db/schema/index.ts`
- Create: `src/auth/auth.ts`
- Create: `src/auth/auth-client.ts`
- Create: `src/auth/owner-policy.ts`
- Create: `src/auth/owner-policy.test.ts`
- Create: `scripts/create-owner.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/app/(auth)/sign-in/page.tsx`

**Interfaces:**
- Consumes: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `YGGDRASIL_ASSET_ROOT`, and `YGGDRASIL_OWNER_EMAIL`.
- Produces: `serverEnv`, `db`, `auth`, `authClient`, and `canCreateOwner(existingUserCount: number, candidateEmail: string, configuredOwnerEmail: string): boolean`.

- [ ] **Step 1: Write failing environment and owner-policy tests**

Create `src/lib/env/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./server";

describe("parseServerEnv", () => {
  it("rejects a missing Neon connection string", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("accepts the complete server configuration", () => {
    const value = parseServerEnv({
      DATABASE_URL: "postgresql://owner:secret@example.neon.tech/neondb?sslmode=require",
      BETTER_AUTH_SECRET: "a-secure-test-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      YGGDRASIL_ASSET_ROOT: "C:\\dev\\yggdrasil-data",
      YGGDRASIL_OWNER_EMAIL: "owner@example.test",
    });
    expect(value.YGGDRASIL_OWNER_EMAIL).toBe("owner@example.test");
  });
});
```

Create `src/auth/owner-policy.test.ts`:

```ts
import { expect, it } from "vitest";
import { canCreateOwner } from "./owner-policy";

it("allows only the configured first owner", () => {
  expect(canCreateOwner(0, "owner@example.test", "owner@example.test")).toBe(true);
  expect(canCreateOwner(0, "other@example.test", "owner@example.test")).toBe(false);
  expect(canCreateOwner(1, "owner@example.test", "owner@example.test")).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
pnpm test -- src/lib/env/server.test.ts src/auth/owner-policy.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement environment validation and owner policy**

Implement `parseServerEnv` with Zod using these rules:

```ts
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  YGGDRASIL_ASSET_ROOT: z.string().min(3),
  YGGDRASIL_OWNER_EMAIL: z.string().email().transform((value) => value.toLowerCase()),
});
```

Implement:

```ts
export function canCreateOwner(
  existingUserCount: number,
  candidateEmail: string,
  configuredOwnerEmail: string,
): boolean {
  return existingUserCount === 0 &&
    candidateEmail.toLowerCase() === configuredOwnerEmail.toLowerCase();
}
```

Document every variable in `.env.example` with non-secret example values.

- [ ] **Step 4: Configure Drizzle and generate the Better Auth schema**

Use the official Neon HTTP driver for ordinary queries:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { serverEnv } from "@/lib/env/server";
import * as schema from "@/db/schema";

const sql = neon(serverEnv.DATABASE_URL);
export const db = drizzle({ client: sql, schema });
```

Configure Better Auth with `drizzleAdapter(db, { provider: "pg", schema })`, email/password enabled, and the owner policy applied before user creation. Generate the auth schema using the installed CLI version:

```powershell
pnpm dlx @better-auth/cli@latest generate --config src/auth/auth.ts --output src/db/schema/auth.ts
pnpm db:generate
```

Review the generated file and confirm it exports the user, session, account, and verification tables required by the installed Better Auth version. Do not hand-edit generated column definitions.

- [ ] **Step 5: Add the one-time owner creation command**

Add package script `"auth:create-owner": "tsx scripts/create-owner.ts"`. The script must:

1. Read `YGGDRASIL_OWNER_EMAIL` from validated server configuration.
2. Require the password through a hidden interactive prompt and reject values shorter than 12 characters.
3. Count existing users through Drizzle and call `canCreateOwner`.
4. Call Better Auth's installed server API for email/password sign-up with the configured owner email.
5. Exit without creating a user if any user already exists.
6. Never print or persist the password.

Run it only after migrations are applied:

```powershell
pnpm db:migrate
pnpm auth:create-owner
```

- [ ] **Step 6: Add the auth route and sign-in page**

Expose the Better Auth handler:

```ts
import { auth } from "@/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

The sign-in page contains email and password fields, an accessible submit button named `Sign in`, an error region with `role="alert"`, and no public sign-up link after the owner exists.

- [ ] **Step 7: Verify auth and schema boundaries**

Run:

```powershell
pnpm test -- src/lib/env/server.test.ts src/auth/owner-policy.test.ts
pnpm typecheck
pnpm lint
pnpm db:generate
```

Expected: tests pass, typecheck/lint exit 0, and Drizzle reports no untracked schema error.

- [ ] **Step 8: Commit**

```powershell
git add .env.example drizzle.config.ts scripts/create-owner.ts package.json src/lib/env src/db src/auth src/app/api/auth src/app/\(auth\)
git commit -m "feat: add Neon persistence and single-owner authentication"
```

---

### Task 3: Build Traversal-Proof Local Asset Storage

**Files:**
- Create: `src/lib/storage/types.ts`
- Create: `src/lib/storage/storage-key.ts`
- Create: `src/lib/storage/storage-key.test.ts`
- Create: `src/lib/storage/local-storage.ts`
- Create: `src/lib/storage/local-storage.test.ts`

**Interfaces:**
- Consumes: `serverEnv.YGGDRASIL_ASSET_ROOT`.
- Produces: `StorageKey`, `parseStorageKey(value: string): StorageKey`, and `AssetStorage` with `put`, `read`, `exists`, `removeTree`, `commitTree`, and server-only `processingPath` operations.

- [ ] **Step 1: Write failing storage-key tests**

```ts
import { describe, expect, it } from "vitest";
import { parseStorageKey } from "./storage-key";

describe("parseStorageKey", () => {
  it("accepts a normalized internal key", () => {
    expect(parseStorageKey("assets/550e8400-e29b-41d4-a716-446655440000/source/model.glb"))
      .toBe("assets/550e8400-e29b-41d4-a716-446655440000/source/model.glb");
  });

  it.each(["../secret", "assets/../../secret", "/absolute/file", "C:\\secret", "assets\\mixed"])(
    "rejects unsafe key %s",
    (value) => expect(() => parseStorageKey(value)).toThrow(/storage key/i),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
pnpm test -- src/lib/storage/storage-key.test.ts
```

Expected: FAIL because `parseStorageKey` is missing.

- [ ] **Step 3: Implement storage-key validation**

Normalize only forward-slash internal keys. Reject empty segments, `.`, `..`, backslashes, drive prefixes, NUL characters, and absolute paths. Brand the validated value:

```ts
declare const storageKeyBrand: unique symbol;
export type StorageKey = string & { readonly [storageKeyBrand]: true };
```

- [ ] **Step 4: Write failing local-storage tests**

Use a unique temporary directory created in `beforeEach`. Assert that `put` writes bytes under the root, `read` returns identical bytes, `commitTree` atomically renames a staged import directory to its final asset directory, `processingPath` returns a contained absolute path for a branded key, and every public method rejects an unvalidated path.

- [ ] **Step 5: Implement `LocalAssetStorage`**

Implement this boundary:

```ts
export interface AssetStorage {
  put(key: StorageKey, bytes: Uint8Array): Promise<void>;
  read(key: StorageKey): Promise<Uint8Array>;
  exists(key: StorageKey): Promise<boolean>;
  removeTree(prefix: StorageKey): Promise<void>;
  commitTree(stagedPrefix: StorageKey, finalPrefix: StorageKey): Promise<void>;
  processingPath(key: StorageKey): string;
}
```

Resolve every key against the configured root, call `path.relative(root, candidate)`, and reject candidates whose relative value starts with `..` or is absolute. Create parent directories only after this containment check. `processingPath` performs the same containment check and is used only by server-side parsers; routes and client code never receive its result.

- [ ] **Step 6: Verify and commit**

```powershell
pnpm test -- src/lib/storage
pnpm typecheck
pnpm lint
git add src/lib/storage
git commit -m "feat: add safe local asset storage"
```

Expected: all storage tests pass and no method can address files outside the configured root.

---

### Task 4: Validate Import Manifests and Generate a Legal Test Fixture

**Files:**
- Create: `src/features/assets/domain/types.ts`
- Create: `src/features/assets/domain/errors.ts`
- Create: `src/features/assets/infrastructure/import-manifest.ts`
- Create: `src/features/assets/infrastructure/import-manifest.test.ts`
- Create: `src/test/fixtures/create-gltf-fixture.ts`

**Interfaces:**
- Consumes: uploaded file entries `{ relativePath: string; bytes: Uint8Array }[]`.
- Produces: `buildImportManifest(entries): Promise<ImportManifest>` where the manifest identifies one primary model, dependencies, attribution files, thumbnails, and warnings.

- [ ] **Step 1: Define the domain contract and failing tests**

Use this minimal contract:

```ts
export type ImportFile = { relativePath: string; bytes: Uint8Array };
export type ImportManifest = {
  primaryModel: ImportFile;
  dependencies: ImportFile[];
  attributionFiles: ImportFile[];
  thumbnails: ImportFile[];
  warnings: Array<{ code: string; message: string }>;
};
```

Tests must prove that the builder:

- selects the only GLB as primary;
- keeps `.bin`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.ktx2`, `.txt`, and `.md` dependencies/metadata;
- rejects traversal paths and executable extensions;
- rejects an archive expanded beyond 1 GiB or 10,000 entries;
- expands ZIP entries into the same validated `ImportFile[]` representation before manifest selection;
- rejects encrypted entries, symlinks, absolute paths, parent traversal, duplicate normalized paths, and a compression ratio above 100:1;
- reports `AMBIGUOUS_PRIMARY_MODEL` when multiple GLTF/GLB candidates exist instead of guessing;
- verifies supported file signatures with `file-type` when a signature is available.

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
pnpm test -- src/features/assets/infrastructure/import-manifest.test.ts
```

Expected: FAIL because the manifest builder does not exist.

- [ ] **Step 3: Implement manifest validation**

Allow only the explicit extensions in the test. Treat GLTF JSON as valid only when parsing succeeds and `asset.version` begins with `2.`. Treat GLB as valid only when its first four bytes are ASCII `glTF`. Never infer a primary model when more than one supported model candidate exists; return the typed ambiguity error with candidate paths.

When an uploaded entry is a ZIP, use `fflate` to enumerate it before allocating extracted output. Enforce the entry-count, declared expanded-size, per-entry compression-ratio, and total expanded-size limits first. Normalize and validate every entry path, reject link-like metadata, and then pass the extracted entries through the same extension/signature rules as direct uploads. A package may contain a single ZIP or a direct file selection, not both in the same request.

- [ ] **Step 4: Add the generated fixture helper**

`createGltfFixture()` returns an in-memory glTF 2.0 document with one scene, one named node, one triangle mesh, one material, and one animation. Generate its binary data in code so repository tests do not redistribute the Mega Wyvern asset.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm test -- src/features/assets/infrastructure/import-manifest.test.ts
pnpm typecheck
pnpm lint
git add src/features/assets/domain src/features/assets/infrastructure/import-manifest.ts src/features/assets/infrastructure/import-manifest.test.ts src/test/fixtures
git commit -m "feat: validate model import manifests"
```

---

### Task 5: Implement Deterministic GLTF and GLB Analysis

**Files:**
- Create: `src/features/assets/infrastructure/gltf-analyzer.ts`
- Create: `src/features/assets/infrastructure/gltf-analyzer.test.ts`

**Interfaces:**
- Consumes: `AssetStorage` and a validated staged `StorageKey` whose sibling files contain the model dependencies.
- Produces: `analyzeGltf(storage: AssetStorage, primaryKey: StorageKey): Promise<AssetAnalysis>` using the domain type below.

- [ ] **Step 1: Add the analysis type and failing fixture test**

Extend `domain/types.ts`:

```ts
export type AssetAnalysis = {
  format: "gltf" | "glb";
  counts: {
    scenes: number;
    nodes: number;
    meshes: number;
    primitives: number;
    vertices: number;
    triangles: number;
    materials: number;
    textures: number;
    skins: number;
    morphTargets: number;
    cameras: number;
    lights: number;
    animations: number;
  };
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  animations: Array<{ name: string; durationSeconds: number; channels: number }>;
  nodeNames: string[];
  extensionsUsed: string[];
  warnings: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }>;
};
```

Test the generated fixture and assert one scene, one mesh, one primitive, three vertices, one triangle, one material, one animation, a finite animation duration, and the named node.

- [ ] **Step 2: Run the test to verify it fails**

```powershell
pnpm test -- src/features/assets/infrastructure/gltf-analyzer.test.ts
```

Expected: FAIL because `analyzeGltf` is missing.

- [ ] **Step 3: Implement analysis with glTF Transform**

Resolve the validated key through `storage.processingPath(primaryKey)`, then use `NodeIO` from `@gltf-transform/core` and register the installed Khronos extensions. Count triangles as indexed accessor count divided by three for triangle primitives, or position accessor count divided by three when unindexed. Derive animation duration from sampler input accessor min/max values. Traverse all nodes for names and world bounds. Sort node names and extension names before returning so stored snapshots and tests are deterministic.

Emit explicit warnings for unnamed meshes/clips, missing textures, unsupported required extensions, texture dimensions above 4096, and triangle counts above 250,000. These are findings only; do not mutate the document.

- [ ] **Step 4: Add a private Mega Wyvern verification test**

When `YGGDRASIL_PRIVATE_FIXTURE_DIR` is defined, run an opt-in test against `f8caf90ad5da4017b0dddfe880cf37cc_Textured.gltf` and assert 78 nodes, one mesh, one material, one skin, one camera, and 11 animations. Skip the test when the variable is absent. Never copy this asset into the repository.

- [ ] **Step 5: Verify and commit**

```powershell
$env:YGGDRASIL_PRIVATE_FIXTURE_DIR='C:\Users\Seifm\Downloads\01- Mega.Wyvern'
pnpm test -- src/features/assets/infrastructure/gltf-analyzer.test.ts
pnpm typecheck
pnpm lint
git add src/features/assets/domain/types.ts src/features/assets/infrastructure/gltf-analyzer.ts src/features/assets/infrastructure/gltf-analyzer.test.ts
git commit -m "feat: analyze GLTF assets deterministically"
```

Expected: the generated fixture and private Mega Wyvern assertions pass.

---

### Task 6: Add Asset Schema, Repository, and Transactional Import Service

**Files:**
- Modify: `src/db/schema/assets.ts`
- Create: `src/features/assets/application/import-asset.ts`
- Create: `src/features/assets/application/import-asset.test.ts`
- Create: `src/features/assets/application/get-asset.ts`
- Create: `src/features/assets/infrastructure/asset-repository.ts`

**Interfaces:**
- Consumes: `AssetStorage`, `buildImportManifest`, `analyzeGltf`, and `AssetRepository`.
- Produces: `importAsset(request: ImportAssetRequest): Promise<ImportAssetResult>` and `getAsset(assetId: string): Promise<AssetDetail | null>`.

- [ ] **Step 1: Define schema and repository interfaces**

Create tables for `assets`, `assetSources`, `assetFiles`, `assetVersions`, and `sceneAnalyses`. Use UUID primary keys, owner foreign keys, timestamps, status enums, storage keys, byte sizes, SHA-256 hashes, MIME types, and JSONB analysis snapshots. Add unique constraints preventing duplicate storage keys and duplicate `(sourceId, relativePath)` entries.

Define the application-facing repository:

```ts
export interface AssetRepository {
  createImport(input: CreateImportRecord): Promise<{ assetId: string; sourceId: string }>;
  completeImport(input: CompleteImportRecord): Promise<void>;
  failImport(assetId: string, errorCode: string): Promise<void>;
  getAsset(assetId: string, ownerId: string): Promise<AssetDetail | null>;
  listAssets(ownerId: string): Promise<AssetSummary[]>;
}
```

- [ ] **Step 2: Write the failing orchestration tests**

Use in-memory fakes for storage, repository, manifest builder, and analyzer. Tests must assert:

- source files are staged before analysis;
- successful analysis commits the staged tree and completes the database record;
- analysis failure removes the staged tree and marks the record failed;
- SHA-256 hashes and byte sizes are persisted for every file;
- the source bytes received by the service are never modified.

- [ ] **Step 3: Run tests to verify they fail**

```powershell
pnpm test -- src/features/assets/application/import-asset.test.ts
```

Expected: FAIL because the import service is missing.

- [ ] **Step 4: Implement the minimal import service**

Use explicit dependency injection:

```ts
export function createImportAsset(deps: {
  storage: AssetStorage;
  repository: AssetRepository;
  buildManifest: typeof buildImportManifest;
  analyze: typeof analyzeGltf;
  createId: () => string;
}) {
  return async function importAsset(request: ImportAssetRequest): Promise<ImportAssetResult> {
    // orchestration implemented from the tested state transitions
  };
}
```

Stages use `staging/<importId>/...`; committed sources use `assets/<assetId>/source/...`. The service must catch typed errors, remove only its validated staging prefix, persist the failure code, and rethrow a safe application error.

- [ ] **Step 5: Implement the Drizzle repository**

Use a Drizzle transaction for `createImport` and another transaction for `completeImport` so file manifests, version records, and analysis snapshots become visible together. Repository queries always filter by `ownerId`.

- [ ] **Step 6: Verify schema and service, then commit**

```powershell
pnpm db:generate
pnpm test -- src/features/assets/application/import-asset.test.ts
pnpm typecheck
pnpm lint
git add src/db/schema/assets.ts src/features/assets/application src/features/assets/infrastructure/asset-repository.ts drizzle
git commit -m "feat: add transactional asset imports"
```

Expected: a migration is generated, orchestration tests pass, and source/failure invariants are enforced.

---

### Task 7: Expose Authenticated Import and File-Streaming Routes

**Files:**
- Create: `src/app/api/assets/import/route.ts`
- Create: `src/app/api/assets/import/route.test.ts`
- Create: `src/app/api/assets/[assetId]/file/route.ts`
- Create: `src/app/api/assets/[assetId]/file/route.test.ts`

**Interfaces:**
- Consumes: Better Auth session, `importAsset`, `getAsset`, `AssetStorage`.
- Produces: `POST /api/assets/import` and `GET /api/assets/:assetId/file?key=<encoded storage key>`.

- [ ] **Step 1: Write failing route tests**

Mock only the session and application service boundaries. Assert:

- unauthenticated requests return 401;
- multipart requests without files return 400 with `{ code: "NO_FILES" }`;
- valid multipart files preserve `webkitRelativePath` supplied in the `relativePath` form field manifest;
- ambiguity returns 422 with candidates;
- success returns 201 with `{ assetId, status: "ready" }`;
- the file route returns 404 when the requested key does not belong to the owner's asset;
- valid GLB responses use `model/gltf-binary`, `nosniff`, private cache headers, and byte-range support.

- [ ] **Step 2: Run tests to verify they fail**

```powershell
pnpm test -- src/app/api/assets
```

Expected: FAIL because the route modules are missing.

- [ ] **Step 3: Implement the import route**

Set `export const runtime = "nodejs"`. Parse multipart entries with a 1 GiB total limit and 10,000-file limit. Convert every browser `File` to `Uint8Array`, pass only relative paths and bytes to the service, and map typed application errors to stable JSON error codes.

- [ ] **Step 4: Implement the owner-scoped streaming route**

Resolve the asset through `getAsset(assetId, session.user.id)`, verify the requested storage key is in its file manifest, then stream bytes. Never accept a filesystem path. Support `Range: bytes=start-end` for GLB delivery and return 416 for invalid ranges.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm test -- src/app/api/assets
pnpm typecheck
pnpm lint
git add src/app/api/assets
git commit -m "feat: expose secure asset import and streaming APIs"
```

---

### Task 8: Build the Protected Library and Guided Import Experience

**Files:**
- Create: `src/app/(studio)/layout.tsx`
- Create: `src/app/(studio)/library/page.tsx`
- Create: `src/features/assets/ui/import-dropzone.tsx`
- Create: `src/features/assets/ui/import-dropzone.test.tsx`
- Create: `src/features/assets/ui/asset-card.tsx`
- Create: `src/features/assets/ui/analysis-summary.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: auth session, `listAssets`, import API, and `AssetAnalysis`.
- Produces: protected `/library`, accessible file/folder/ZIP selection, progress/error presentation, and asset navigation.

- [ ] **Step 1: Write failing dropzone tests**

```tsx
it("submits selected relative paths and reports progress", async () => {
  const upload = vi.fn().mockResolvedValue({ assetId: "asset-1", status: "ready" });
  render(<ImportDropzone upload={upload} />);
  const input = screen.getByLabelText("Choose model files");
  const file = new File(["{}"], "model.gltf", { type: "model/gltf+json" });
  await userEvent.upload(input, file);
  await userEvent.click(screen.getByRole("button", { name: "Import asset" }));
  expect(upload).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ relativePath: "model.gltf" }),
  ]));
  expect(await screen.findByText("Import complete")).toBeVisible();
});
```

Also test the empty selection, server error code rendering, disabled state during upload, and keyboard activation.

- [ ] **Step 2: Run the component test to verify it fails**

```powershell
pnpm test -- src/features/assets/ui/import-dropzone.test.tsx
```

Expected: FAIL because `ImportDropzone` is missing.

- [ ] **Step 3: Implement the adaptive shell and import UI**

Use a light library surface, high-contrast typography, one primary `Import asset` action, and a clear eight-step progress label with `Import` active. Add separate `Choose model files`, `Choose folder`, and `Choose ZIP` controls that all normalize to the same upload boundary. Do not hide the native input from assistive technology without an equivalent labeled control.

- [ ] **Step 4: Implement the server-rendered asset library**

Require the owner session in `(studio)/layout.tsx`; redirect unauthenticated users to `/sign-in`. Render asset cards with name, format, status, file size, mesh/triangle/animation counts, and last-updated time. Empty state copy directs the owner to import the first model.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm test -- src/features/assets/ui
pnpm typecheck
pnpm lint
pnpm build
git add src/app src/features/assets/ui
git commit -m "feat: add protected asset library and guided import"
```

---

### Task 9: Add the Asset Detail Report and Live Three.js Preview

**Files:**
- Create: `src/app/(studio)/assets/[assetId]/page.tsx`
- Create: `src/features/viewer/model-canvas.tsx`
- Create: `src/features/viewer/model-scene.tsx`
- Create: `src/features/viewer/viewer-error-boundary.tsx`
- Create: `src/features/viewer/model-canvas.test.tsx`
- Modify: `src/features/assets/ui/analysis-summary.tsx`

**Interfaces:**
- Consumes: owner-scoped `AssetDetail` and streamed GLTF/GLB URL.
- Produces: a dark preview surface, automatic framing, orbit controls, animation inventory, technical counts, and recoverable WebGL/model errors.

- [ ] **Step 1: Write failing viewer boundary tests**

Mock React Three Fiber's `Canvas` and the model loader. Assert that:

- the canvas receives a camera and accessible label `3D model preview`;
- loading shows `Loading model` with progress semantics;
- a loader failure shows `The model could not be displayed` and a `Retry preview` button;
- reduced-motion preference prevents automatic animation playback.

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
pnpm test -- src/features/viewer/model-canvas.test.tsx
```

Expected: FAIL because the viewer modules are missing.

- [ ] **Step 3: Implement the client-only viewer**

Render `Canvas` only in a client component. Load the owner-scoped internal URL with Drei's glTF loader, clone the scene safely for React ownership, frame the bounds, add neutral environment lighting, a grid toggle, orbit controls, and a reset-camera action. Dispose cloned geometry/material resources on unmount without disposing shared loader cache resources.

- [ ] **Step 4: Implement the asset detail route**

Server-load the owner-scoped asset record. Return `notFound()` for missing or foreign assets. The page uses the dark preview surface and a light report panel containing file/scene counts, named animation clips and durations, extensions, warnings, and source-package metadata.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm test -- src/features/viewer src/features/assets/ui
pnpm typecheck
pnpm lint
pnpm build
git add src/app/\(studio\)/assets src/features/viewer src/features/assets/ui/analysis-summary.tsx
git commit -m "feat: preview imported assets and show analysis"
```

---

### Task 10: Prove the Complete Vertical Slice

**Files:**
- Modify: `e2e/import-flow.spec.ts`
- Create: `docs/development.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the complete foundation/import/analysis slice.
- Produces: repeatable local setup instructions and browser-level acceptance evidence.

- [ ] **Step 1: Write the end-to-end acceptance test**

The test bootstraps the configured owner in an isolated test database, signs in, opens `/library`, uploads the generated GLTF fixture and its dependency files, waits for `Import complete`, opens the asset card, and asserts:

```ts
await expect(page.getByText("1 mesh")).toBeVisible();
await expect(page.getByText("1 animation")).toBeVisible();
await expect(page.getByLabel("3D model preview")).toBeVisible();
await expect(page.getByText("No destructive changes applied")).toBeVisible();
```

- [ ] **Step 2: Run the acceptance test and confirm the first failure**

```powershell
pnpm test:e2e -- e2e/import-flow.spec.ts
```

Expected: FAIL at the first unconnected UI/API or fixture boundary.

- [ ] **Step 3: Connect only the missing boundaries exposed by the test**

Wire the real import client to `POST /api/assets/import`, refresh the library after success, and use the returned asset ID for navigation. Keep application logic in the existing services; route and UI modules only adapt inputs and outputs.

- [ ] **Step 4: Document local operation**

`docs/development.md` must include:

1. Required Node and pnpm versions from the installed toolchain.
2. Neon project creation and `DATABASE_URL` placement.
3. Generation of a 32-byte-or-longer `BETTER_AUTH_SECRET`.
4. Owner email and local asset-root configuration.
5. `pnpm db:migrate`, `pnpm dev`, and first-owner bootstrap commands.
6. The private Mega Wyvern verification command using `YGGDRASIL_PRIVATE_FIXTURE_DIR`.
7. A warning never to commit `.env.local`, Neon credentials, or imported assets.

Add `.env*`, local asset roots, Playwright output, coverage, and private fixture paths to `.gitignore`, while explicitly retaining `.env.example`.

- [ ] **Step 5: Run the full verification suite**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
git status --short
```

Expected: all checks exit 0. `git status --short` lists only the intended Task 10 changes before commit.

- [ ] **Step 6: Commit**

```powershell
git add e2e/import-flow.spec.ts docs/development.md .gitignore
git commit -m "test: verify the import and analysis vertical slice"
```

---

## Acceptance Checklist

- [ ] Current stable dependencies are locked with pnpm.
- [ ] The single owner can authenticate through Better Auth.
- [ ] Application metadata persists in Neon through Drizzle.
- [ ] Local storage rejects traversal and never exposes arbitrary filesystem paths.
- [ ] GLTF/GLB files, selected dependency groups, and ZIP packages can be validated and imported.
- [ ] Original files remain byte-identical and immutable.
- [ ] Generated fixture analysis passes without proprietary assets.
- [ ] The private Mega Wyvern check reports 78 nodes and 11 animations.
- [ ] The library displays imported assets and technical counts.
- [ ] The asset detail page renders a live Three.js preview and deterministic report.
- [ ] Unauthorized and cross-owner requests cannot import, query, or stream assets.
- [ ] Lint, typecheck, unit/integration tests, Playwright tests, and production build pass.

## Subsequent Implementation Plans

After this vertical slice is accepted, write and execute separate plans in this order:

1. FBX/OBJ conversion, large-archive streaming, variant selection, attribution capture, and background processing.
2. Optimization recommendations, derived asset versions, comparison, and reversible operation history.
3. Appearance, scene configuration, interactions, hotspots, and structured trigger/action authoring.
4. Embedded/imported animation editing, skeleton mapping, blending, and visual GSAP timelines.
5. React component, embed viewer, downloadable package, and configurable prefetch export targets.

Each plan must leave the application working and independently testable before the next subsystem begins.
