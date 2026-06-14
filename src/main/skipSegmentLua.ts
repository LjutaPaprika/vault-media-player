// Builds the mpv Lua script that detects OP/ED segments and offers a skip button.
//
// Detection sources, in priority order:
//   1. Sidecar `skips.json` at the show root (walked up from the file's directory),
//      with per-episode keys like "S01E01": { "op": [start, end], "ed": [start, end] }.
//   2. In-file chapter markers whose titles match OP/ED name patterns.
//
// While the playhead is inside an OP/ED range, an ASS-rendered button appears
// in the top-right corner. Click it, press the configured hotkey, or press the
// configured gamepad button to seek past the segment.
//
// Tradeoff (accepted): while the button is showing, MBTN_LEFT is force-bound
// for hit-testing. Clicks that miss the button are silently swallowed for the
// ~90s the segment is active. Spacebar still pauses normally.
//
// Escape note for editors: this file embeds Lua source inside a JS template
// literal. Inside the literal, JS escape rules apply — a single `\` becomes `\\`.
// ASS tags (e.g. `\an7`) and Lua patterns (e.g. `%d`) are written using Lua long
// strings `[[...]]` where possible to avoid double escaping.

export function buildSkipSegmentLua(skipKey: string, skipButton: string): string {
  const gamepadBind = skipButton && skipButton !== 'none'
    ? `mp.add_forced_key_binding('${skipButton}', 'skip-segment-gamepad', do_skip)\n`
    : ''

  return `\
local utils = require 'mp.utils'
local msg = require 'mp.msg'

local SKIP_KEY = '${skipKey}'

-- 'intro'/'prologue'/'prelude'/'part a' deliberately excluded: in anime they
-- almost always label the cold open, not the OP, and offering to skip them
-- jumps past actual story content.
local OP_PATTERNS = { '^opening', '^op$', '^op%W' }
local ED_PATTERNS = { '^outro', '^ending', '^ed$', '^ed%W', '^preview', '^epilogue', '^next episode', '^nep' }

local current = { op = nil, ed = nil, active = nil }
local last_tick = 0
local dismissed_active = nil   -- 'op' or 'ed' once the auto-dismiss fired for that instance
local shown_at = nil           -- mp.get_time() when button was last shown; nil = no countdown
local AUTO_DISMISS_SECONDS = 5.0

-- Button geometry, in OSD pixel space. set_osd_ass is given osd-dimensions so
-- these stay constant-size regardless of video resolution. Positioned bottom-
-- right with enough bottom padding to clear mpv's OSC play bar (~70-90 px tall).
local BTN_W, BTN_H = 440, 100
local RIGHT_PAD, BOTTOM_PAD = 40, 200
local osd_w, osd_h = 1920, 1080
local button_visible = false
local saved_autohide = nil

-- Fade animation state. cur_alpha: 0 = invisible, 1 = fully shown.
local FADE_SECONDS = 0.25
local TICK_SECONDS = 0.030
local cur_alpha = 0.0
local target_alpha = 0.0
local current_label = ''
local anim_timer = nil
local last_anim_time = nil
local FILL_TARGET_HEX = 0x30   -- when fully shown: fill alpha (mostly opaque)

local function trim(s) return (s:gsub('^%s+', ''):gsub('%s+$', '')) end

local function match_any(name, patterns)
  local lower = trim(name:lower())
  for _, p in ipairs(patterns) do
    if lower:match(p) then return true end
  end
  return false
end

local function classify_chapters()
  local chapters = mp.get_property_native('chapter-list', {})
  local duration = mp.get_property_number('duration', 0)
  if #chapters == 0 then return nil, nil end
  local op, ed = nil, nil
  for i, ch in ipairs(chapters) do
    local name = ch.title or ''
    local start = ch.time or 0
    local stop = (chapters[i+1] and chapters[i+1].time) or duration
    if match_any(name, OP_PATTERNS) and not op then
      op = { start, stop }
    elseif match_any(name, ED_PATTERNS) and not ed then
      ed = { start, stop }
    end
  end
  return op, ed
end

local function find_skips_json(path)
  local norm = path:gsub('\\\\', '/')
  local dir = norm:match('(.+)/[^/]+$')
  if not dir then return nil end
  for _ = 1, 4 do
    local candidate = dir .. '/skips.json'
    local f = io.open(candidate, 'r')
    if f then
      local content = f:read('*a')
      f:close()
      return content
    end
    local parent = dir:match('(.+)/[^/]+$')
    if not parent or parent == dir then break end
    dir = parent
  end
  return nil
end

local function load_sidecar(path)
  local basename = path:match('([^/\\\\]+)$') or path
  local s, e = basename:match('[Ss](%d+)[Ee](%d+)')
  if not (s and e) then return nil, nil end
  local ep_key = string.format('S%02dE%02d', tonumber(s), tonumber(e))

  local json_text = find_skips_json(path)
  if not json_text then return nil, nil end
  local parsed = utils.parse_json(json_text)
  if not parsed then
    msg.warn('skip-segment: failed to parse skips.json')
    return nil, nil
  end
  local entry = parsed[ep_key]
  if not entry then return nil, nil end
  return entry.op, entry.ed
end

mp.register_event('file-loaded', function()
  current.op, current.ed, current.active = nil, nil, nil
  dismissed_active = nil
  shown_at = nil
  last_tick = 0
  local path = mp.get_property('path', '')
  if path == '' or path:match('^https?://') or path:match('^ytdl://') then return end

  local side_op, side_ed = load_sidecar(path)
  local ch_op, ch_ed = classify_chapters()
  current.op = side_op or ch_op
  current.ed = side_ed or ch_ed
end)

local function in_range(t, range)
  return range ~= nil and t >= range[1] and t < range[2]
end

local function button_rect()
  local x = osd_w - BTN_W - RIGHT_PAD
  local y = osd_h - BTN_H - BOTTOM_PAD
  return x, y, BTN_W, BTN_H
end

-- Linearly interpolate alpha hex byte: at a=0 fully transparent (0xFF),
-- at a=1 the target value. ASS alpha is inverse: 00=opaque, FF=transparent.
local function lerp_alpha(target_hex, a)
  return math.floor(0xFF - (0xFF - target_hex) * a + 0.5)
end

local function draw_button_at(label, a, progress)
  if a <= 0.01 then
    mp.set_osd_ass(osd_w, osd_h, '')
    return
  end
  local x, y, w, h = button_rect()
  local fill_a   = lerp_alpha(FILL_TARGET_HEX, a)
  local text_a   = lerp_alpha(0x00, a)
  -- Borderless translucent slab to match uosc's flat aesthetic. Text centered
  -- with \an5, biased a touch above center so the countdown bar at the bottom
  -- doesn't visually crowd the label.
  local bg = string.format(
    [[{\\an7\\pos(%d,%d)\\bord0\\1c&H000000&\\1a&H%02x&\\p1}m 0 0 l %d 0 %d %d 0 %d{\\p0}]],
    x, y, fill_a, w, w, h, h
  )
  local text = string.format(
    [[{\\an5\\pos(%d,%d)\\bord0\\1c&Hffffff&\\1a&H%02x&\\fs40\\b1}%s]],
    x + math.floor(w / 2), y + math.floor(h / 2) - 6, text_a, label
  )

  -- Countdown bar: thin rectangle hugging the button's bottom inner edge,
  -- shrinks left-to-right as the auto-dismiss timer drains. Skipped entirely
  -- once progress hits 0 so it doesn't leave a sliver during the fade-out.
  -- Joined to bg/text with a real newline (chr 10) so its own \\pos applies;
  -- ASS soft-break \\n keeps everything on one line and ignores later \\pos.
  local bar = ''
  if progress and progress > 0 then
    local bar_h = 6
    local bar_margin_x = 12
    local bar_margin_b = 10
    local bar_w_max = w - bar_margin_x * 2
    local bar_w = math.max(1, math.floor(bar_w_max * progress))
    local bar_x = x + bar_margin_x
    local bar_y = y + h - bar_h - bar_margin_b
    local bar_a = lerp_alpha(0x20, a)
    bar = '\\n' .. string.format(
      [[{\\an7\\pos(%d,%d)\\bord0\\1c&Hffffff&\\1a&H%02x&\\p1}m 0 0 l %d 0 %d %d 0 %d{\\p0}]],
      bar_x, bar_y, bar_a, bar_w, bar_w, bar_h, bar_h
    )
  end

  mp.set_osd_ass(osd_w, osd_h, bg .. '\\n' .. text .. bar)
end

local function clear_button()
  mp.set_osd_ass(osd_w, osd_h, '')
end

local function anim_tick()
  local now = mp.get_time()
  local dt = (last_anim_time and (now - last_anim_time)) or 0
  last_anim_time = now
  local step = dt / FADE_SECONDS
  if cur_alpha < target_alpha then
    cur_alpha = math.min(target_alpha, cur_alpha + step)
  elseif cur_alpha > target_alpha then
    cur_alpha = math.max(target_alpha, cur_alpha - step)
  end

  -- Auto-dismiss: only counts while the button is fully open. Once it fires,
  -- remember which segment we dismissed so re-entering this range during the
  -- same OP/ED window doesn't re-pop the button.
  local progress = 0
  if shown_at and target_alpha == 1.0 then
    local elapsed = now - shown_at
    progress = math.max(0, 1 - elapsed / AUTO_DISMISS_SECONDS)
    if elapsed >= AUTO_DISMISS_SECONDS then
      dismissed_active = current.active
      target_alpha = 0.0
      shown_at = nil
      progress = 0
    end
  end

  draw_button_at(current_label, cur_alpha, progress)

  -- Keep ticking while fading OR while the countdown bar needs redrawing.
  local need_more = (cur_alpha ~= target_alpha) or (shown_at ~= nil)
  if need_more then
    anim_timer = mp.add_timeout(TICK_SECONDS, anim_tick)
  else
    anim_timer = nil
    last_anim_time = nil
    if target_alpha == 0 and button_visible then
      mp.remove_key_binding('skip-segment-click')
      if saved_autohide ~= nil then
        mp.set_property('cursor-autohide', tostring(saved_autohide))
      end
      button_visible = false
    end
  end
end

local function start_anim()
  if anim_timer then return end
  last_anim_time = mp.get_time()
  anim_tick()
end

-- Defined below file-load so do_skip is in scope at call time.
local do_skip

local function on_mbtn_left()
  local pos = mp.get_property_native('mouse-pos')
  if not pos then return end
  local x, y, w, h = button_rect()
  if pos.x >= x and pos.x <= x + w and pos.y >= y and pos.y <= y + h then
    do_skip()
  end
  -- Clicks outside the button are silently consumed during the segment window.
end

local function show_button(label)
  current_label = label
  if not button_visible then
    saved_autohide = mp.get_property_native('cursor-autohide')
    mp.set_property('cursor-autohide', 'no')
    mp.add_forced_key_binding('MBTN_LEFT', 'skip-segment-click', on_mbtn_left)
    button_visible = true
  end
  target_alpha = 1.0
  shown_at = mp.get_time()
  start_anim()
end

local function hide_button()
  if not button_visible then return end
  target_alpha = 0.0
  shown_at = nil
  start_anim()
end

mp.observe_property('osd-dimensions', 'native', function(_, dim)
  if dim and dim.w and dim.h and dim.w > 0 and dim.h > 0 then
    osd_w, osd_h = dim.w, dim.h
    if button_visible then
      draw_button_at(current_label, cur_alpha)
    end
  end
end)

mp.observe_property('time-pos', 'number', function(_, t)
  if not t then return end
  local now = mp.get_time()
  if now - last_tick < 0.5 then return end
  last_tick = now

  local was_active = current.active
  local now_active = nil
  if in_range(t, current.op) then now_active = 'op'
  elseif in_range(t, current.ed) then now_active = 'ed' end
  current.active = now_active

  if now_active ~= was_active then
    if now_active == 'op' and dismissed_active ~= 'op' then
      show_button('Skip Opening')
    elseif now_active == 'ed' and dismissed_active ~= 'ed' then
      show_button('Skip Ending')
    elseif now_active == nil then
      if button_visible then hide_button() end
      dismissed_active = nil  -- left the segment; future re-entry can show again
    end
  end
end)

do_skip = function()
  local range = nil
  if current.active == 'op' then range = current.op
  elseif current.active == 'ed' then range = current.ed end
  if range then
    mp.commandv('seek', tostring(range[2]), 'absolute+exact')
    current.active = nil
    hide_button()
  end
end

mp.add_forced_key_binding(SKIP_KEY, 'skip-segment', do_skip)
${gamepadBind}`
}
