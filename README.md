# Vault Media Player

A portable Electron-based media and game library for an external drive. Browse movies, TV shows, anime, music, books, manga, and games from a single app. Playback uses mpv for video/audio and platform emulators for ROMs.

---

## Features

- **Library scanning** — indexes your drive automatically; incremental rescans skip unchanged files
- **In-app music player** — Spotify-style album grid, track list, persistent player bar with seek/volume
- **Video playback** — launches mpv with a configured portable setup (English subtitles auto-selected, skip intro detection, custom seek keys)
- **Game launching** — PC games launch their executable directly; ROMs open in the configured emulator
- **Search** — filter any library page by title
- **Backup sync** — copy the drive to a second external drive

---

## Requirements

- **Node.js** 18+ and **npm** (for development)
- **mpv** placed at `[DRIVE]/players/mpv/[platform]/mpv` (see Drive Layout below)
- **Emulators** placed at `[DRIVE]/emulators/[name]/[platform]/` (optional, for ROMs)

---

## Development

```bash
npm install
npm run dev
```

Build a distributable:

```bash
npm run build:win    # Windows portable .exe
npm run build:mac    # macOS .dmg
npm run build:linux  # Linux AppImage
```

> **Note:** `better-sqlite3` is a native module. If you switch Node/Electron versions, run:
> ```bash
> npm run rebuild-native
> ```

---

## Drive Layout

The app expects a specific folder structure on the external drive. Run the included setup script to create it automatically (see [Setup Script](#setup-script)).

```
[DRIVE]/
├── media/
│   ├── movies/
│   │   └── Movie Title (Year)/
│   │       ├── Movie Title (Year).mkv
│   │       ├── poster.jpg           ← displayed in the app
│   │       ├── movie.json           ← optional metadata override
│   │       └── Featurettes/
│   │           └── Featurette.mkv
│   │
│   ├── tv/
│   │   └── Show Title/
│   │       ├── S01/
│   │       │   ├── Show Title - S01E01 - Episode Name.mkv
│   │       │   └── Show Title - S01E02 - Episode Name.mkv
│   │       └── poster.jpg
│   │
│   ├── anime/
│   │   └── Anime Title/
│   │       ├── S01/
│   │       │   ├── Anime Title - S01E01 - Episode Name.mkv
│   │       │   └── Anime Title - S01E02 - Episode Name.mkv
│   │       └── poster.jpg
│   │
│   ├── music/
│   │   └── Artist Name/
│   │       └── Album Title (Year)/
│   │           ├── 01 - Track Title.flac
│   │           ├── 02 - Track Title.flac
│   │           └── cover.jpg
│   │
│   ├── books/
│   │   └── Book Title.epub
│   │
│   └── manga/
│       └── Series Title/
│           ├── Volume 01.cbz
│           └── cover.jpg
│
├── games/
│   ├── pc/
│   │   └── Game Title (Year)/
│   │       ├── Game.exe
│   │       ├── poster.jpg
│   │       └── game.json
│   │
│   └── roms/
│       ├── n64/
│       │   └── Game Title.z64
│       ├── gamecube/
│       │   └── Game Title.iso
│       ├── wii/
│       │   └── Game Title.wbfs
│       ├── gba/
│       │   └── Game Title.gba
│       ├── nds/
│       │   └── Game Title.nds
│       ├── snes/
│       │   └── Game Title.sfc
│       └── xbox360/
│           └── Game Title.iso
│
├── players/
│   └── mpv/
│       ├── windows/
│       │   └── mpv.exe
│       ├── mac/
│       │   └── mpv
│       └── linux/
│           └── mpv
│
└── emulators/
    ├── dolphin/
    │   ├── windows/
    │   │   └── dolphin.exe
    │   └── ...
    ├── simple64/      ← N64
    ├── xenia/         ← Xbox 360
    ├── mgba/          ← GBA / GB / GBC
    ├── melonds/       ← NDS
    ├── snes9x/        ← SNES
    └── shadps4/       ← PS4
```

---

## Sidecar Files

### `movie.json`
```json
{
  "title": "The Dark Knight",
  "year": 2008,
  "genre": ["Action", "Crime", "Drama"],
  "description": "Batman faces the Joker."
}
```

### `game.json`
```json
{
  "title": "Elden Ring",
  "year": 2022,
  "genre": ["Action", "RPG"],
  "description": "An action RPG set in the Lands Between.",
  "executable": "EldenRing.exe"
}
```

---

## Episode Filename Formats

The scanner recognises several naming conventions automatically:

| Format | Example |
|---|---|
| Standard `SxxExx` | `Show - S01E01 - Title.mkv` |
| Number + dot + title | `01. Episode Title.mkv` |
| Number at end | `[Group] Show 01.mkv` |
| Underscore/dash separated | `Show_-_01_(extras).mkv` |

Episodes within a `S01/`, `S02/`, `Season 1/` folder are automatically grouped by season.

---

## Setup Script

Run `scripts/setup-drive.ps1` (Windows) or `scripts/setup-drive.sh` (macOS/Linux) to create the full folder structure on a new drive.

**Windows (PowerShell):**
```powershell
.\scripts\setup-drive.ps1 -Drive E:
```

**macOS / Linux (bash):**
```bash
bash scripts/setup-drive.sh /Volumes/VAULT
```

---

## Keyboard Shortcuts (mpv player)

| Key | Action |
|---|---|
| `→` | Skip forward 10 seconds |
| `←` | Skip back 10 seconds |
| `Shift+→` | Skip forward 3 seconds |
| `Shift+←` | Skip back 3 seconds |
| `C` | Skip intro (when intro chapter detected) |
| `J` | Toggle English subtitles on/off |
| `Space` | Play / Pause |
| `F` | Fullscreen |
| `Q` | Quit |
