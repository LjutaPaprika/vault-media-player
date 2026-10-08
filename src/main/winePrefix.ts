import { join } from 'path'

// Shared constants for the Mac Wine prefix that Vault uses to run Windows games.
// Both the GPTK runtime and the prefix live under Heroic Games Launcher's data
// folder — Vault does not install either, it reuses what Heroic ships. The user
// accepted this exception to rule 2 (host-side install) in exchange for free
// tools. See MAC-GAMING-HANDOFF.md on the drive for the setup.

const HOME = process.env['HOME'] ?? ''

/** The Wine prefix shared across every PC game Vault launches on Mac. */
export const MAC_WINE_PREFIX = join(
  HOME,
  'Library/Application Support/heroic/Prefixes/vault'
)

/** The wine64 binary from Heroic's bundled Game Porting Toolkit runtime. */
export const MAC_WINE_BIN = join(
  HOME,
  'Library/Application Support/heroic/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/bin/wine64'
)

/**
 * Apple's GPTK uses this fixed Wine user name. All of a game's host-side writes
 * under %USERPROFILE% land in `<prefix>/drive_c/users/crossover/`. If a future
 * GPTK release changes this, the save-link resolver and manual symlinks both
 * need updating.
 */
export const MAC_WINE_USER = 'crossover'
