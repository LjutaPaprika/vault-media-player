# Cold-store sync: Mac/Linux verification TODO

> **Note for a future Claude session running on Mac or Linux.**
> The cold-store feature (shipped on `main` at commit `2120453`) was built and tested on Windows only. The code has macOS/Linux branches throughout. Items below were validated on macOS 15.3.1 (Apple Silicon) during work captured in commit `892f1e6`; Linux items remain unverified.

## Status legend
- ✅ done
- ⚠️ partial — blocked on hardware or live UI walkthrough
- ⬜ not started

## Items

1. ✅ **`rsync` presence**
   - `src/main/sync.ts` → `runAdditiveSync` no longer passes openrsync-incompatible flags (`--info=progress2`, `--human-readable`) — `-a + --modify-window=2` works on macOS's bundled openrsync 2.6.9-compat and GNU rsync. Fixed in commit `892f1e6`.
   - Startup probe added: `isRsyncAvailable()` in `sync.ts`, surfaced as `rsyncAvailable` on `storage:getDrives`. Storage page shows a red "rsync not found — install with `brew install rsync`" banner when absent, and the **Sync new items** button is gated off. (Caches the probe result; install state doesn't change at runtime.)

2. ⚠️ **`findDriveByLabel` mount-root coverage**
   - macOS `/Volumes` confirmed working — `findDriveByLabel('VAULT')` returns `/Volumes/VAULT` on this Mac.
   - Linux mount roots (`/mnt`, `/media`, `/run/media`) **not** verified — no Linux hardware available. The branches read fine on inspection; will need a real distro to confirm.

3. ✅ **`getDriveStats` via `df -k`**
   - `df -k /Volumes/VAULT` on macOS Sequoia produces the column layout the parser expects (column 1 = 1KB-blocks total, column 3 = 1KB-blocks available). Parsed values match `diskutil` reports.

4. ✅ **Drive-letter assumption properly gated**
   - `getDriveStats` reads `rootPath.charAt(0)` only inside the `process.platform === 'win32'` branch (line ~14). Re-confirmed.

5. ⚠️ **`fs.promises.cp` recursive behavior on non-NTFS**
   - Not exercised — requires the cold-store drive mounted alongside vault to trigger Copy/Move from the Storage page. Code inspection of `storageTransfer.ts` shows no NTFS-specific assumptions. Re-check once both drives are simultaneously available.

6. ℹ️ **No multi-threaded scan hazard on POSIX** (informational, no action)
   - The overlap guard + 3s cooldown in `storage:syncNewItems` exists because Windows + robocopy `/MT:8` + exFAT could BSOD the OS. `rsync` is single-threaded; the guard still applies harmlessly.

## Still pending — requires both drives mounted

The "How to verify quickly" walkthrough below has **not** been run end-to-end because only one of the two drives was mounted during the verification session. Items to validate when the cold drive is plugged in:

- Cold-store DriveCard shows real free/used numbers
- Folder listings populate when navigating each pane
- "↔" badge appears on rows that exist on both drives
- Copy / Move / Delete on a small test folder works end-to-end
- "Sync new items" completes without error (this exercises items #1 and #5 together)

```bash
git checkout main
npm install
npm run build:mac    # then drag the new Vault.app to /Applications, or run electron-vite dev
```

## Out of scope

- No Linux deploy script exists (`package.json` has `deploy` for Windows and `deploy:mac` only). Not blocking — `electron-builder --linux` covers builds.

## What's NOT a concern

- Renderer code: pure React/CSS, no platform branches.
- `existsSync`/`statSync`/`path.join`: platform-neutral.
- The `chcp 65001 >nul && robocopy …` shell wrapper is inside the Windows-only branch — irrelevant on POSIX.
