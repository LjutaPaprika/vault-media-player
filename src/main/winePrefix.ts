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
 * Mach-O library search path for GPTK's D3DMetal + d3d12.so. Wine's d3d12.so
 * links to `@loader_path/libd3dshared.dylib`, but libd3dshared.dylib ships in
 * `wine/lib/external/` while d3d12.so sits in `wine/lib/wine/x86_64-unix/`.
 * Without this on `DYLD_FALLBACK_LIBRARY_PATH`, the dylib resolver can't find
 * it when a game first calls `D3D12CreateDevice`, and the game reports no GPU.
 */
export const MAC_GPTK_DYLD_PATHS = [
  join(HOME, 'Library/Application Support/heroic/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/lib/external'),
  join(HOME, 'Library/Application Support/heroic/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/lib/external/D3DMetal.framework/Versions/A/Resources')
].join(':')

/**
 * Apple's GPTK uses this fixed Wine user name. All of a game's host-side writes
 * under %USERPROFILE% land in `<prefix>/drive_c/users/crossover/`. If a future
 * GPTK release changes this, the save-link resolver and manual symlinks both
 * need updating.
 */
export const MAC_WINE_USER = 'crossover'
