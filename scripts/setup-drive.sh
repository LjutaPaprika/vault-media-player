#!/usr/bin/env bash
# setup-drive.sh
# Creates the Vault Media Player folder structure on an external drive.
#
# Usage:
#   bash setup-drive.sh /Volumes/VAULT
#   bash setup-drive.sh /media/myuser/VAULT

set -e

DRIVE="${1}"

if [[ -z "$DRIVE" ]]; then
    echo "Usage: bash setup-drive.sh /path/to/drive"
    exit 1
fi

if [[ ! -d "$DRIVE" ]]; then
    echo "Error: '$DRIVE' is not a directory or does not exist."
    exit 1
fi

folders=(
    # Media
    "media/movies"
    "media/tv"
    "media/anime"
    "media/music"
    "media/books"
    "media/manga"

    # Games
    "games/pc"
    "games/roms/n64"
    "games/roms/gamecube"
    "games/roms/wii"
    "games/roms/gba"
    "games/roms/gbc"
    "games/roms/gb"
    "games/roms/nds"
    "games/roms/snes"
    "games/roms/xbox360"
    "games/roms/ps4"

    # Players
    "players/mpv/windows"
    "players/mpv/mac"
    "players/mpv/linux"

    # Emulators
    "emulators/dolphin/windows"
    "emulators/dolphin/mac"
    "emulators/dolphin/linux"
    "emulators/simple64/windows"
    "emulators/simple64/linux"
    "emulators/xenia/windows"
    "emulators/mgba/windows"
    "emulators/mgba/mac"
    "emulators/mgba/linux"
    "emulators/melonds/windows"
    "emulators/melonds/mac"
    "emulators/snes9x/windows"
    "emulators/snes9x/mac"
    "emulators/snes9x/linux"
    "emulators/shadps4/windows"

    # System
    "launcher"
)

echo ""
echo "Creating folder structure at: $DRIVE"
echo ""

created=0
skipped=0

for folder in "${folders[@]}"; do
    path="$DRIVE/$folder"
    if [[ -d "$path" ]]; then
        printf "  \033[90m[exists]  %s\033[0m\n" "$folder"
        ((skipped++)) || true
    else
        mkdir -p "$path"
        printf "  \033[32m[created] %s\033[0m\n" "$folder"
        ((created++)) || true
    fi
done

echo ""
printf "Done. \033[36m%d folder(s) created\033[0m, %d already existed.\n" "$created" "$skipped"
echo ""
echo "Next steps:"
echo "  1. Copy the mpv binary into players/mpv/mac/ or players/mpv/linux/"
echo "  2. Copy emulator binaries into emulators/[name]/[platform]/"
echo "  3. Add media to media/ and games/"
echo "  4. Open the app, go to Settings, set your drive label, and run Scan Library"
echo ""
