# Cold-store sync: Mac/Linux verification TODO

> **Note for a future Claude session running on Mac or Linux.**
> The cold-store feature (shipped on `main` at commit `2120453`) was built and tested on Windows only. The code has macOS/Linux branches throughout, but they have **not** been exercised on real hardware. Validate the items below before treating the feature as cross-platform.

## What needs checking

1. **`rsync` presence**
   - `src/main/sync.ts` → `runAdditiveSync` spawns `rsync -a --modify-window=2 --info=progress2 --human-readable …` on non-Windows.
   - No startup probe — a missing `rsync` produces a generic "Failed to launch rsync" with no actionable guidance.
   - Suggested fix: probe `rsync --version` at app startup; surface a "rsync required" banner on the Storage page if absent.

2. **`findDriveByLabel` mount-root coverage**
   - Scans `/Volumes` on macOS, `/mnt` `/media` `/run/media` on Linux.
   - Some distros mount external drives under `/run/media/<user>/<label>` (covered via prefix scan) or `/media/<user>/<label>` (also covered). Verify on a real distro.
   - Test: plug in a drive whose volume label matches `backupLabel` in Settings, confirm the cold-store card detects it.

3. **`getDriveStats` via `df -k`**
   - Parses `df -k <path>` columns 1 and 3 (1KB blocks: total, available).
   - macOS BSD-df and Linux GNU-df both use this layout. Confirm by reading the page and watching the bars populate.

4. **Drive-letter assumption properly gated**
   - `getDriveStats` reads `rootPath.charAt(0)` as a drive letter only inside `if (process.platform === 'win32')`. Confirmed by inspection but worth re-checking after any refactor.

5. **`fs.promises.cp` recursive behavior on non-NTFS**
   - Used by `src/main/storageTransfer.ts` for Copy/Move. Confirm the move's size-verify step (`dirSizeSync`) returns identical totals on APFS, ext4, and exFAT-on-mac.

6. **No multi-threaded scan hazard on POSIX**
   - The overlap guard + 3s cooldown in `storage:syncNewItems` was added because Windows + robocopy `/MT:8` + exFAT could BSOD the OS. `rsync` is single-threaded; the guard still applies but the underlying hazard does not.

## How to verify quickly

```bash
git checkout main
npm install
npm run dev    # or `npm run build:mac` for a packaged build
```

Then on the **Storage** page:

- Both drive cards detected and showing real free/used numbers
- Folder listings populate when navigating each pane
- "↔" badge appears on rows that exist on both drives
- Copy / Move / Delete on a small test folder works end-to-end
- "Sync new items" completes without error

## Out of scope

- No Linux deploy script exists (`package.json` has `deploy` for Windows and `deploy:mac` only). Not blocking — `electron-builder --linux` covers builds.

## What's NOT a concern

- Renderer code: pure React/CSS, no platform branches
- `existsSync`/`statSync`/`path.join`: platform-neutral
- The `chcp 65001 >nul && robocopy …` shell wrapper is inside the Windows-only branch — irrelevant on POSIX.
