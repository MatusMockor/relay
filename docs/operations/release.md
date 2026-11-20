# Release pipeline

Workflow: `.github/workflows/release.yml`. Tools: `scripts/release-tools/` (workspace package `@relay/release-scripts`, tests in `scripts/test/`). Repository: `MatusMockor/relay`. The pipeline follows the one of Codevo Whisper (same owner, same Apple Developer account), without the parts that only exist for Whisper's native binaries.

## Jobs

| Job                   | Runner             | Environment | What it does                                                                                                                                                                                                                                   |
| --------------------- | ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`             | `ubuntu-latest`    | -           | `verify-build-ref.sh`, `resolve-version.sh`: the version is `apps/desktop/package.json` `version`; on a tag push the tag must be exactly `v<that version>`                                                                                     |
| `check-*` / `checks`  | `ubuntu-latest`    | -           | parallel lint, typecheck, package tests, mail-core, sharded server, sharded desktop renderer and desktop main/integration tests (same split as `ci.yml`, using `docker-compose.test.yml`); runs in parallel with packaging and gates `publish` |
| `bundle`              | `ubuntu-latest`    | `release`   | `electron-vite build` once, with the Google OAuth client baked in, uploads `apps/desktop/out` as the artifact `bundle`                                                                                                                         |
| `build-mac` (arm64)   | `macos-15`         | `release`   | package from `bundle`, sign with Developer ID, notarize, staple, build DMG and ZIP, notarize and staple the DMG, gates on what ships, upload `mac-arm64`                                                                                       |
| `build-mac` (x64)     | `macos-15`         | `release`   | the same for Intel (cross-packaged on Apple Silicon with Rosetta 2 verification of the x64 Electron binary and native module), upload `mac-x64`                                                                                                |
| `build-linux` (x64)   | `ubuntu-24.04`     | -           | package AppImage and deb from `bundle`, no signing, no secrets, `SHA256SUMS-linux-x64`, verify `latest-linux.yml`, upload `linux-x64`                                                                                                          |
| `build-linux` (arm64) | `ubuntu-24.04-arm` | -           | the same for arm64 with `latest-linux-arm64.yml`, upload `linux-arm64`                                                                                                                                                                         |
| `publish`             | `ubuntu-latest`    | `release`   | tag pushes only: merge `latest-mac.yml`, add the Linux packages and manifests, verify every manifest and checksum, draft the release, re-verify every asset, publish                                                                           |

Triggers:

- Tag push `v*.*.*`: full release. `publish` runs only after both `build-mac` and both `build-linux` jobs succeeded, so a release always ships macOS and Linux together.
- Manual run (`workflow_dispatch`, no inputs): a dry run from `main` only (the `version` job is skipped for any other ref, so nothing else runs). It builds, signs, notarizes and verifies both mac architectures, builds both Linux architectures and keeps everything as run artifacts for 14 days. It never publishes.

The JavaScript bundle is built once in `bundle` and every packaging job uses that same `out/`, so all six packages ship identical code. The packaging jobs only add Electron, the native module and the signature.

## Signing protection

- `bundle`, `build-mac` and `publish` run in the GitHub environment `release`. The signing, notarization and Google OAuth secrets live in that environment, not in the repository. `build-linux` signs nothing, does not use the environment and references no secret.
- `verify-build-ref.sh` runs in `version`, `build-mac` and `build-linux`: for a tag push the dereferenced tag commit must equal the build SHA, a manual run must be on `main`, and the build commit must be on `main`.
- `publish-github-release.sh` checks again through the GitHub API that the tag points to the build SHA and creates the release with `--verify-tag`.
- Every `uses:` is pinned to a full commit SHA with a `# vX.Y.Z` comment. Only first-party `actions/*` actions are used, pnpm comes from `corepack enable`.
- `permissions: contents: read` for the workflow, only `publish` gets `contents: write`. Checkouts use `persist-credentials: false`.
- Secrets are only step-level `env` of the steps that need them: `RELAY_GOOGLE_CLIENT_ID` / `RELAY_GOOGLE_CLIENT_SECRET` for the bundle, `CSC_LINK` / `CSC_KEY_PASSWORD` for the certificate import, `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` for the two notarization steps, `GH_TOKEN` for the release step. `scripts/test/release-workflow.test.ts` keeps these rules from regressing.
- `with-api-key.sh` writes the App Store Connect key to a private temp dir for one step and deletes it on exit. `import-certificate.sh` decodes the `.p12` in a private temp dir into a temporary keychain in `$RUNNER_TEMP` (deleted at the end of the job) and checks that it is a `Developer ID Application` identity of `APPLE_TEAM_ID`.

## One-time GitHub setup (owner)

1. Settings, Environments, New environment `release`:
   - Required reviewers: the owner (`MatusMockor`). A run then waits for approval before `bundle`, before `build-mac` and before `publish` (several waiting jobs can be approved at once).
   - Deployment branches and tags: "Selected branches and tags", rules `main` (branch) and `v*` (tag).
   - The environment secrets and the variable below.
2. Settings, Rules, Rulesets, New tag ruleset `release tags`: target tags matching `v*`, enforcement active, rules "Restrict creations", "Restrict updates", "Restrict deletions", "Block force pushes", bypass list: the owner only.
3. The repository is public, so electron-updater reads the GitHub Releases feed without a token. Keep it public, or the in-app update needs another feed.

## Secrets and variables

The commands read the values from files or prompt for them, so nothing ends up in the shell history. Never commit or print the `.p12` or `.p8`.

```bash
repo=MatusMockor/relay
base64 -i ~/Documents/certs/<developer-id>.p12 | gh secret set CSC_LINK --repo "$repo" --env release
gh secret set CSC_KEY_PASSWORD --repo "$repo" --env release
gh secret set APPLE_API_KEY --repo "$repo" --env release < ~/Documents/certs/AuthKey_<KEY_ID>.p8
gh secret set APPLE_API_KEY_ID --repo "$repo" --env release
gh secret set APPLE_API_ISSUER --repo "$repo" --env release
gh variable set APPLE_TEAM_ID --repo "$repo" --env release --body <TEAM_ID>
gh secret set RELAY_GOOGLE_CLIENT_ID --repo "$repo" --env release
gh secret set RELAY_GOOGLE_CLIENT_SECRET --repo "$repo" --env release
```

- `CSC_LINK`: the base64 encoded `.p12` (certificate and private key of the `Developer ID Application` identity), `CSC_KEY_PASSWORD` its password.
- `APPLE_API_KEY`: the content of the App Store Connect API key file (`AuthKey_<KEY_ID>.p8`), `APPLE_API_KEY_ID` its key ID, `APPLE_API_ISSUER` the issuer UUID from App Store Connect, Users and Access, Integrations.
- `APPLE_TEAM_ID` (variable): the team `import-certificate.sh` and `verify-signature.sh` require on the identity, the app and the native module.
- `RELAY_GOOGLE_CLIENT_ID` / `RELAY_GOOGLE_CLIENT_SECRET`: the Google Cloud OAuth client of type "Desktop app" used for Gmail and Google Calendar sign-in. Google treats the secret of a desktop client as not confidential, so it is baked into the app. `bundle` fails when the client ID is missing, so no release ships without Google sign-in.

## Cutting a release

1. `main` is green and contains everything for the release.
2. Bump `apps/desktop/package.json` `version` (semver, for example `0.2.0` or `0.2.0-beta.1`) in a pull request and merge it.
3. Optional dry run without publishing: `gh workflow run release.yml --repo MatusMockor/relay --ref main`, approve the `release` environment, and download the run artifacts to try the packages.
4. Tag the merge commit on `main` and push the tag:

   ```bash
   git tag -a v0.2.0 -m "Relay 0.2.0"
   git push origin v0.2.0
   ```

5. Approve the `release` environment when asked (`bundle`, then `build-mac`, then `publish`) and watch the run (`gh run watch`). Notary submission IDs are in each `build-mac` job summary.
6. The release appears once `publish` finishes. A version with a pre-release suffix is published as a GitHub pre-release.

A tag that does not match the package version fails in `version` before anything is built. `publish-github-release.sh` refuses to run when a release for the tag already exists: delete the leftover draft (`gh release delete v0.2.0`) and re-run the failed job. "Re-run failed jobs" re-runs a failed `build-mac` or `build-linux` architecture together with `publish`; a re-run of `build-mac` signs and submits again.

## macOS packaging steps

One `build-mac` job per architecture (`fail-fast: false`, 360 minutes):

1. `verify-build-ref.sh`, `pnpm install`, download `bundle` into `apps/desktop/out`.
2. `import-certificate.sh`.
3. `package-app.sh <arch>`: `electron-builder --mac zip --<arch> --publish never` into `apps/desktop/release/stage/<arch>` with the identity of `APPLE_TEAM_ID` (`signing-identity.sh`). The `zip` target is required because electron-builder writes `Contents/Resources/app-update.yml` (the electron-updater GitHub config) only for `zip` or `dmg`. Fuses are flipped and the app is signed with the hardened runtime and `resources/entitlements.mac.plist`. Then `verify-signature.sh`, `verify-native-module.sh` and `verify-fuses.ts` run on the stage app.
4. `notarize-app.sh`: zips the signed app, submits it with `notarytool`, waits (`NOTARY_TIMEOUT`, 150 minutes), staples and validates.
5. `package-distributables.sh <arch> <version>`: `electron-builder --mac dmg zip --prepackaged <stapled app>` into `apps/desktop/release/dist/<arch>`. `--prepackaged` does not re-sign the app, so the DMG and ZIP contain the stapled app. `dmg.writeUpdateInfo: false` keeps `latest-mac.yml` to the ZIP.
6. `notarize-dmg.sh`: submits, waits, staples and validates the signed DMG.
7. `verify-shipped.sh <arch> <version>`: gates on what ships, not on the stage app. It extracts the ZIP and mounts the DMG read-only and on both copies runs `verify-signature.sh` (deep strict `codesign --verify`, identifier `sk.relay.desktop`, team, hardened runtime, timestamp, the `allow-jit` entitlement, and the team signature of `better_sqlite3.node`), `verify-native-module.sh`, `verify-fuses.ts` (fuse wire against `electronFuses` in `electron-builder.yml`), `app-update.yml` and `stapler validate`, then `verify-notarization.sh` (`spctl` must say `source=Notarized Developer ID`, stapled app and DMG).
8. Upload DMG, ZIP, ZIP blockmap and the per-arch `latest-mac.yml` as `mac-<arch>`, delete the keychain.

Apple network calls go through `retry.sh` (transient network and CloudKit errors, 6 attempts with backoff, never a second notary submission once Apple returned an ID). Signing in `package-app.sh` also goes through `retry.sh timestamp`: when `codesign` gets no answer from Apple's timestamp service (`A timestamp was expected but was not found`), electron-builder runs again after 1, 2, 4, 8 and 10 minutes. `notary-wait.sh` re-runs `notarytool wait` after a dropped connection within the remaining budget, fails on `Invalid` / `Rejected` with the notary log, and exits with 75 when Apple is still `In Progress` after the budget. Whisper's resume of a pending submission across job attempts is not ported yet; a re-run submits again.

Artifact names: `relay-<version>-<arch>-mac.{dmg,zip}`. The arch token is what MacUpdater uses to pick the right ZIP, and x64 names never contain `arm64`.

## Entitlements and fuses

- `resources/entitlements.mac.plist` holds only `com.apple.security.cs.allow-jit`, which V8 needs under the hardened runtime (the same set as Whisper minus its microphone entitlement). Relay loads no unsigned code: `better_sqlite3.node` is signed with the app's team, so library validation stays on, and the app does not use the App Sandbox.
- `mac.extendInfo.ElectronSquirrelPreventDowngrades: true` makes Squirrel.Mac refuse a signed bundle with a lower version than the running one, on top of `allowDowngrade = false` in electron-updater.
- `electronFuses.runAsNode` stays `true`. The local AI runner starts the Claude Code or Codex CLI with a stdio MCP mail server whose command is the Relay executable itself (`process.execPath`) with `ELECTRON_RUN_AS_NODE=1` and `out/main/mcp-mail-stdio.js` (`apps/desktop/src/main/bootstrap/mcp-entry.ts`). The CLI spawns that command, so it cannot be an Electron `utilityProcess`, and a disabled fuse would break every local AI run. The other fuses are hardened: `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` off, `onlyLoadAppFromAsar` and `enableCookieEncryption` on.

## Native module

`better-sqlite3` 13 ships Node-API prebuilds for every platform and architecture in its npm package (`prebuilds/<platform>-<arch>.node`). Node-API is ABI stable across Node and Electron, so the same file works in tests and in the app and nothing has to be compiled per Electron version. electron-builder's `npmRebuild` still runs `@electron/rebuild` for the target arch (a no-op while the prebuild exists). `electron-builder.yml` packs only the prebuild of the target platform and arch and drops the C sources. `verify-native-module.sh` checks on every package that exactly that prebuild is shipped, that it has the right architecture (`lipo` on macOS, `file` on Linux), that no locally compiled `build/Release/better_sqlite3.node` would shadow it, and that the packaged Electron (`ELECTRON_RUN_AS_NODE=1`, which also proves the `runAsNode` fuse) loads it from the asar and opens an in-memory database.

## Update feed

Each `build-mac` job writes its own `latest-mac.yml` with only its ZIP, so `publish` merges them (`merge-latest-mac.ts`): different versions, entries without `url` / `sha512` / integer `size` and a result without a ZIP are refused, entries are de-duplicated by `url`, and the legacy top-level `path` / `sha512` point to the x64 ZIP. Linux needs no merge: `latest-linux.yml` (x64) and `latest-linux-arm64.yml` (arm64) each list the AppImage and the deb of their architecture.

`verify-feed.ts` (rules per manifest name in `feed-manifests.ts`) checks the release version, re-hashes every listed file (size and sha512), rejects URLs that are not plain file names and a legacy `path` that does not match a listed file, requires a ZIP for both `arm64` and `x64` in `latest-mac.yml`, and exactly the AppImage and the deb of the right architecture and version (`relay-<version>-{x86_64,arm64}-linux.AppImage`, `relay-<version>-{amd64,arm64}-linux.deb`) in the Linux manifests. `verify-checksums.ts` re-hashes the `SHA256SUMS-linux-<arch>` files. `publish-github-release.sh` creates a draft with every file of `feed/`, downloads the draft again and requires the same file list and the same sha256 for every asset (`verify-release-assets.ts`) before it publishes. Publishing the draft is the single switch that makes the version visible to clients.

Assets of a release `vX.Y.Z` (14 files): `relay-X.Y.Z-{arm64,x64}-mac.{dmg,zip,zip.blockmap}`, `latest-mac.yml`, `relay-X.Y.Z-{x86_64,arm64}-linux.AppImage`, `relay-X.Y.Z-{amd64,arm64}-linux.deb`, `latest-linux.yml`, `latest-linux-arm64.yml`, `SHA256SUMS-linux-{x64,arm64}`.

Local check of a downloaded feed: `node scripts/release-tools/verify-feed.ts <dir>/latest-mac.yml [version]`, `node scripts/release-tools/verify-checksums.ts <dir>/SHA256SUMS-linux-x64`.

## In-app update

Code: `apps/desktop/src/main/updates/` (`AppUpdater` port, `ElectronUpdaterAdapter`, `LazyAppUpdater`, `UpdateService`, platform policy), wiring in `apps/desktop/src/main/composition/app-updates.ts` and `bootstrap/electron-updates.ts`, IPC channels `app.update.status`, `app.update.install` and the stream `app.update.events` in `packages/shared/src/ipc/update-channels.ts`, renderer prompt in `apps/desktop/src/renderer/src/features/updates/`.

- Feed: electron-updater with the GitHub provider from `app-update.yml` (`owner: MatusMockor`, `repo: relay`, written from `publish` in `electron-builder.yml`). Only published releases are visible, drafts are not.
- Policy: packaged macOS and the Linux AppImage (`APPIMAGE` set and no `resources/package-type`) update in the app. The deb (electron-builder writes `deb` into `resources/package-type`) is left to the package manager, so updates are off there, also when `APPIMAGE` happens to be set. Development builds and other platforms never contact the feed and never load electron-updater.
- Schedule: first check 30 seconds after start, then every hour. electron-updater is loaded on the first check.
- A check that finds a newer version downloads it in the background right away (`autoDownload` is off, the service starts the download). Then the renderer shows "Nová verzia je pripravená" with "Reštartovať" (`quitAndInstall`) and "Neskôr". `autoInstallOnAppQuit` is on, so a downloaded update is also installed when the user quits Relay normally.
- macOS installs through Squirrel.Mac (`quitAndInstall(false, true)`), which requires the signed app, checks the downloaded bundle against the running app's designated requirement and relaunches Relay after the old process has exited.
- The AppImage is installed silently (`quitAndInstall(true, false)`: electron-updater moves the new AppImage in place without starting it) and Relay then asks Electron to relaunch the new AppImage after this process exits (`app.relaunch`, `restart-strategy.ts`). Starting it right away would race Relay's single-instance lock while the quit guard is still tearing down, and the new instance would quit.
- Install errors arrive as electron-updater `error` events. The adapter turns them into a rejected `install()`, the service moves to `error` (`failed: install`), the prompt says "Aktualizáciu sa nepodarilo nainštalovať", and the next scheduled check downloads the update again.
- electron-updater is bundled into `out/main` (a devDependency, like React), so the package needs no extra `node_modules`.

## Local packaging

```bash
pnpm --filter @relay/desktop package:dir
```

builds an unsigned, unpackaged app in `apps/desktop/release` (`package:mac` and `package:linux` build the installers). Set `RELAY_GOOGLE_CLIENT_ID` and `RELAY_GOOGLE_CLIENT_SECRET` in the shell to bake a Google client into a local build. Without them the build works as before and reads the client from the runtime environment or `google-oauth.json` in the user data directory. Without a Developer ID identity in the keychain (or with `CSC_IDENTITY_AUTO_DISCOVERY=false`) electron-builder skips signing, and on Apple silicon the unsigned app is killed at start because flipping the fuses invalidated the Electron signature. Sign it ad hoc to run it locally: `codesign --force --deep --sign - apps/desktop/release/mac-arm64/Relay.app`. Packaging rewrites `node_modules/better-sqlite3/build`; run `pnpm --filter @relay/desktop native:node` if the tests complain afterwards.

## Not covered yet

- The pipeline has not run yet: the first dry run after the secrets are set is the first real test of signing, notarization and the Linux packaging on GitHub runners.
- No N to N+1 update test yet, it needs two published releases. Run one before announcing auto-update: install N from the DMG, publish N+1, wait for the prompt, restart, and check `codesign` / `spctl` on the updated app; repeat with the AppImage.
- The electron-updater redirect patches Whisper carries (redirect hop counting, refusing HTTPS to HTTP redirects) are not ported.
- The desktop package still lists the workspace packages as `dependencies`, so electron-builder copies them and their dependencies into the asar although electron-vite already bundled them. Moving them to `devDependencies` would shrink the app.
