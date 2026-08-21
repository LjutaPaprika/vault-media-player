# vault-state

Export and restore Vault's user-created state — watch marks, genres, game
playtime and favourite albums — keyed by **library-relative path** rather than
absolute path.

## Why this exists

`library.db` stores absolute paths (`E:\media\tv\Show\S01\ep.mkv`). Two things
follow from that:

1. Move the library to a different drive and every stored path is wrong. The
   app already handles this — `rerootPaths()` rewrites them at startup — so
   this tool is not needed for a straight drive swap.

2. **Archive media off the drive and its marks are destroyed.** The next scan
   finds the files gone, `deleteOrphanedEntries()` confirms ENOENT, and the rows
   are deleted. Restore that media months later and it comes back as fresh rows
   with no history. That is the gap this tool closes.

Keys look like `/media/tv/Show/S01/ep.mkv` — the path from `/media/` or
`/games/` onward, NFC-normalised. That identity survives drive letters, volume
labels, mount roots, the Windows/macOS split, and archive/restore cycles. The
derivation matches `libraryRelKey()` in `src/main/database.ts`, so it agrees
with the scanner's own rename migration.

## Usage

Export (read-only, safe at any time — but close Vault first for a clean read):

```
node tools/vault-state/export.cjs E:\data\library.db F:\_vault-state-2026-08-21.json
```

Preview a restore — writes nothing:

```
node tools/vault-state/import.cjs E:\data\library.db F:\_vault-state-2026-08-21.json
```

Apply it:

```
node tools/vault-state/import.cjs E:\data\library.db F:\_vault-state-2026-08-21.json --apply
```

Both scripts need `better-sqlite3`, which is a native module built against
Electron's ABI. Run them under Electron-as-Node:

```
set ELECTRON_RUN_AS_NODE=1
node_modules\electron\dist\electron.exe tools\vault-state\export.cjs ...
```

## What is and isn't exported

| Exported | Source |
|---|---|
| Watch marks / "last watched" / complete | `media_items.last_opened_at` |
| Genres | `media_items.genre` |
| Game playtime | `game_playtime.play_seconds` |
| Favourite albums | `favourites.album_path` |

Not exported, deliberately:

- **`dir_mtimes`** — a scan cache, rebuilt automatically. Copying it across
  drives would be actively harmful; a stale watermark causes a re-dirty loop.
- **`config`** — holds `driveRoot` and `libraryLabel`. Restoring those onto a
  different drive would point the app at the wrong volume.

## Safety guarantees on import

- Previews unless `--apply` is passed.
- Never overwrites a **newer** `last_opened_at`, so anything watched since the
  export survives.
- Playtime merges with `MAX`, the same rule `rerootPaths()` uses, so a larger
  accumulated total is never reduced.
- Genre only fills where the target has none, so scanner-derived values from
  `movie.json` / `album.json` keep priority.
- Idempotent — running twice changes nothing.
- Entries whose media isn't present are **reported, not invented**. Restore the
  media and re-run.

## Verified behaviour

Tested against a copy of the live library (10,154 keyable rows):

- 246 marks and 103.7 h of playtime restored from a wiped database
- 2,233 genres restored from a fully wiped genre column
- preview mode confirmed to write nothing
- second `--apply` reported 0 restored / 246 identical
- a deleted game was correctly reported as unmatched rather than resurrected
