# setup-drive.ps1
# Creates the Vault Media Player folder structure on an external drive.
#
# Usage:
#   .\setup-drive.ps1 -Drive E:
#   .\setup-drive.ps1 -Drive F: -Label VAULT

param(
    [Parameter(Mandatory = $true)]
    [string]$Drive,

    [string]$Label = ""
)

# Normalise drive path
$Drive = $Drive.TrimEnd('\').TrimEnd('/')
if ($Drive -notmatch ':$') {
    Write-Error "Drive must be a Windows drive letter, e.g. E:"
    exit 1
}

if (-not (Test-Path "$Drive\")) {
    Write-Error "Drive $Drive not found. Make sure it is plugged in."
    exit 1
}

# Optionally set the volume label
if ($Label -ne "") {
    Write-Host "Setting volume label to '$Label'..."
    & cmd /c "label ${Drive} ${Label}" 2>$null
}

$folders = @(
    # Media
    "media\movies",
    "media\tv",
    "media\anime",
    "media\music",
    "media\books",
    "media\manga",

    # Games
    "games\pc",
    "games\roms\n64",
    "games\roms\gamecube",
    "games\roms\wii",
    "games\roms\gba",
    "games\roms\gbc",
    "games\roms\gb",
    "games\roms\nds",
    "games\roms\snes",
    "games\roms\xbox360",
    "games\roms\ps4",

    # Players
    "players\mpv\windows",
    "players\mpv\mac",
    "players\mpv\linux",

    # Emulators
    "emulators\dolphin\windows",
    "emulators\dolphin\mac",
    "emulators\dolphin\linux",
    "emulators\simple64\windows",
    "emulators\simple64\linux",
    "emulators\xenia\windows",
    "emulators\mgba\windows",
    "emulators\mgba\mac",
    "emulators\mgba\linux",
    "emulators\melonds\windows",
    "emulators\melonds\mac",
    "emulators\snes9x\windows",
    "emulators\snes9x\mac",
    "emulators\snes9x\linux",
    "emulators\shadps4\windows",

    # Hidden system folders (hidden after creation)
    "players",
    "launcher"
)

Write-Host ""
Write-Host "Creating folder structure on $Drive ..."
Write-Host ""

$created = 0
$skipped = 0

foreach ($folder in $folders) {
    $path = "$Drive\$folder"
    if (Test-Path $path) {
        Write-Host "  [exists]  $folder" -ForegroundColor DarkGray
        $skipped++
    } else {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "  [created] $folder" -ForegroundColor Green
        $created++
    }
}

# Hide system folders from Windows Explorer
Write-Host ""
Write-Host "Hiding system folders..."
foreach ($hidden in @("players", "launcher")) {
    $path = "$Drive\$hidden"
    if (Test-Path $path) {
        & attrib +h "$path" 2>$null
        Write-Host "  [hidden]  $hidden" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "Done. $created folder(s) created, $skipped already existed." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Copy mpv.exe into players\mpv\windows\"
Write-Host "  2. Copy emulator executables into emulators\[name]\windows\"
Write-Host "  3. Add media to media\ and games\"
Write-Host "  4. Open the app, go to Settings, set your drive label, and run Scan Library"
Write-Host ""
