# Local development

Yggdrasil runs locally from `C:\dev\yggdrasil`. The toolchain verified for this milestone is Node.js **24.20.0** and pnpm **12.5.1** (`node --version`, `pnpm --version`). Install the locked dependencies with `pnpm install --frozen-lockfile`.

## Configure Neon and local storage

1. Create a Neon PostgreSQL project and copy its connection string. Neon must be reachable while using Yggdrasil; binary model files stay on your computer.
2. If `.env` does not exist, copy `.env.example` to `.env`. Set `DATABASE_URL` to the Neon connection string. Never paste that URL into a commit, issue, or screenshot.
3. Generate at least 32 random bytes for `BETTER_AUTH_SECRET`. In PowerShell: `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`. Put the resulting value in `.env` once. If the file contains duplicate `BETTER_AUTH_SECRET` lines, remove the duplicate and keep the intended secret; changing it later invalidates existing sessions.
4. Set `BETTER_AUTH_URL=http://localhost:3000`, `YGGDRASIL_OWNER_EMAIL` to your own email, and `YGGDRASIL_ASSET_ROOT` to an absolute local directory such as `C:\dev\yggdrasil-data`. The owner email is the only address allowed to register. Keep the storage directory outside the repository when possible.
5. Run `pnpm db:migrate` to apply the Drizzle schema. Then run `pnpm dev` and open `http://localhost:3000/sign-in`. With an empty owner table, use **Create owner account** with the configured email. Alternatively, run `pnpm auth:create-owner` in an interactive terminal and enter a password of at least 12 characters. Once an owner exists, public registration is closed.

Run `pnpm db:migrate` again after pulling changes that add migrations, before restarting the app. The example connection string uses `sslmode=verify-full`; runtime and migration connections also normalize older `prefer`, `require`, and `verify-ca` values to that same verification behavior.

The import flow accepts glTF/GLB, FBX, OBJ with MTL/texture dependencies, folders, and ZIPs. FBX and OBJ are converted to web-ready GLBs; the original package is retained. OBJ materials and some FBX exporter features may not convert faithfully, so inspect the warnings in the asset report. The rest of the editing workflow is tracked in [the roadmap](roadmap/README.md).

After upload, the owner reviews every candidate model, its detectable required resources, missing or incompatible inputs, and package license/credit text before selecting a preview. A later switch makes a separate preview version and retains every original source file. Root credit files apply to all variants; a credit file inside one variant folder applies only to that folder. Missing or ambiguous attribution is shown as **unknown**. Supplied text is not a legal clearance or redistribution approval. Review shows up to 64 KiB of each text file and marks a longer preview as truncated; the retained file is available from the protected asset page after import. FBX external resources cannot be fully inferred before conversion and are labeled unverified.

Uploads stream into protected temporary files. Current limits are 1 GiB of multipart or ZIP source bytes, 10,000 files/ZIP entries, 1 GiB of expanded ZIP content, 256 MiB per processed file, and a 100:1 declared ZIP expansion ratio. ZIP entry paths, symlinks, encryption, and actual extracted bytes are checked before an asset is made ready. Persisted import jobs expose upload and processing progress, cancellation, and retry across app restarts.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. The ordinary Playwright run checks the public entry page; the import test skips unless an E2E database mode is explicitly selected.

For a full browser import check, prefer a separate **empty** Neon database and set `YGGDRASIL_E2E_DATABASE_URL` in the environment. The test creates a temporary owner and asset folder and removes those test records afterward. Do not point this variable at a database containing real users or assets.

On Windows, after `pnpm build`, run `pnpm exec tsx scripts/restart-import-gate.ts` with the same isolated, empty, migrated `YGGDRASIL_E2E_DATABASE_URL` to verify browser recovery across a real app process restart. The gate uses port 3210 and its own temporary asset root. It rejects a database equal to `DATABASE_URL` or one with existing users or assets.

If you deliberately use the configured main database, first confirm it contains **no users or assets**, then run in PowerShell:

```powershell
$env:YGGDRASIL_E2E_USE_MAIN_DATABASE = '1'
pnpm test:e2e -- e2e/import-flow.spec.ts
Remove-Item Env:YGGDRASIL_E2E_USE_MAIN_DATABASE
```

The test independently checks the empty-database precondition before registering its throwaway owner. It rejects a nonempty database and removes only that run's uniquely named owner (and its cascading assets) plus its validated temporary asset folder. An abrupt process kill may leave test records; inspect them before any manual cleanup. Never run this test against a populated production database.

To check the private Mega Wyvern asset without copying it into the repository, set `YGGDRASIL_PRIVATE_FIXTURE_DIR` to the directory containing `f8caf90ad5da4017b0dddfe880cf37cc_Textured.gltf` and run `pnpm test -- src/features/assets/infrastructure/gltf-analyzer.test.ts`. The expected inventory is 78 nodes, one skinned mesh, and 11 animations; the supplied file has **zero cameras**. Keep the private model local unless its redistribution license explicitly permits sharing.

Never commit `.env`, `.env.local`, Neon credentials, owner passwords, imported assets, private fixtures, or generated export packages. `.env.example` is intentionally tracked as a placeholder-only template.
