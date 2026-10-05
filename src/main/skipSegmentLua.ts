// Builds the mpv Lua script behind the player's one on-screen button: "Skip
// Opening" / "Skip Ending" while inside an OP/ED, and "Next Episode" near the
// end when a queue was handed to mpv (see playbackProgress.ts writeQueue).
//
// Segment sources, in priority order:
//   1. Sidecar `skips.json` at the show root (walked up from the file's directory),
//      with per-episode keys like "S01E01": { "op": [start, end], "ed": [start, end] }.
//   2. In-file chapter markers whose titles match OP/ED name patterns.
//
// Next Episode, Netflix style:
//   * When the episode ends in credits - an ending chapter followed by nothing,
//     or only by previews and end cards - the button appears where they start,
//     with a 10 s countdown; with autoplay on, the next episode starts when it
//     runs out. Measured on this library: ~85% of anime ending chapters.
//   * When story follows the ending (Epilogue, Part C, Bonus, an "Outro" after
//     the ED, or any chapter name it does not recognise) nothing is skipped:
//     the ending offers "Skip Ending", which lands on that scene, and Next only
//     appears at the very end, without cutting anything short.
//   * With no chapters at all (most TV, all YouTube), Next shows for the last
//     30 s (15 s for YouTube) and never cuts the video short either.
//   * With autoplay off the button still appears, without a countdown.
//
// While a button is up: click it, Enter, the skip key or controller A press
// it; Esc or controller B dismiss it ("watch credits"). Those keys go back to
// their usual jobs (B quits, A pauses) once it is gone.
//
// Tradeoff (accepted): while a button is showing, MBTN_LEFT is force-bound for
// hit-testing, so clicks that miss it are swallowed for that stretch.
//
// The Lua is written with String.raw so its backslashes (ASS tags such as
// \an7, the '\n' joining overlay parts) reach mpv as written.

export function buildSkipSegmentLua(skipKey: string, skipButton: string): string {
  const gamepadBind = skipButton && skipButton !== 'none'
    ? `mp.add_forced_key_binding('${skipButton}', 'skip-segment-gamepad', activate)\n`
    : ''

  return String.raw`local utils = require 'mp.utils'
local msg = require 'mp.msg'

local SKIP_KEY = '${skipKey}'

-- 'intro'/'prologue'/'prelude'/'part a' deliberately excluded: in anime they
-- almost always label the cold open, not the OP, and offering to skip them
-- jumps past actual story content.
local OP_PATTERNS = { '^opening', '^op$', '^op%W' }
-- The credits themselves. The first chapter matching is the ED.
local CREDIT_PATTERNS = { '^ending', '^ed$', '^ed%W', '^outro', '^credits' }
-- Only when there is no credits chapter: older releases mark the tail with
-- these, and "Skip Ending" has always treated them as the ED.
local LEGACY_ED_PATTERNS = { '^preview', '^epilogue', '^next episode', '^nep' }
-- Not story: what may follow the credits and still be skipped by Next.
local SKIPPABLE_PATTERNS = { '^preview', '^pv$', '^pv%W', '^next$', '^next%W', '^nep', '^end ?card', '^info', '^sponsor' }

local NEXT_COUNTDOWN = 10      -- seconds of playback before Next fires on its own
local AUTO_DISMISS_SECONDS = 5.0
local MAX_TAIL = 360           -- a "credits" stretch longer than this is a bad chapter, not credits

-- ── Queue (written by the app next to the progress reports) ─────────────────
local queue = nil
do
  local qpath = mp.get_opt('vault-queue')
  if qpath and qpath ~= '' then
    local f = io.open(qpath, 'r')
    if f then
      queue = utils.parse_json(f:read('*a'))
      f:close()
    end
  end
end
local autoplay = queue ~= nil and queue.autoplay == true
local fallback_window = (queue and queue.category == 'youtube') and 15 or 30

local function next_entry()
  if not queue then return nil end
  local pos = mp.get_property_number('playlist-pos', -1)
  local count = mp.get_property_number('playlist-count', 0)
  if pos < 0 or pos >= count - 1 then return nil end
  return queue.entries[pos + 2]
end

-- ── Per-file state ─────────────────────────────────────────────────────────
local current = { op = nil, ed = nil, tail = nil, active = nil }
local last_tick = 0
local dismissed_active = nil   -- 'op', 'ed' or 'next' once dismissed for this instance
local shown_at = nil           -- mp.get_time() when a skip button was shown; nil = no countdown
local next_deadline = nil      -- playback time at which Next fires; nil = no countdown

-- Button geometry, in OSD pixel space. set_osd_ass is given osd-dimensions so
-- these stay constant-size regardless of video resolution. Positioned bottom-
-- right with enough bottom padding to clear the player's control bar.
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
local current_sub = ''
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

-- OP and ED ranges, plus where the credits tail starts: the earliest point
-- after which everything left is credits or skippable. nil when story comes
-- last, so nothing may be cut.
local function classify_chapters()
  local chapters = mp.get_property_native('chapter-list', {})
  local duration = mp.get_property_number('duration', 0)
  if #chapters == 0 then return nil, nil, nil end
  local function range(i)
    local stop = (chapters[i + 1] and chapters[i + 1].time) or duration
    return { chapters[i].time or 0, stop }
  end
  local op, ed_i, ed_is_credits = nil, nil, false
  for i, ch in ipairs(chapters) do
    local name = ch.title or ''
    if not op and match_any(name, OP_PATTERNS) then op = range(i) end
    if not ed_i and match_any(name, CREDIT_PATTERNS) then ed_i = i; ed_is_credits = true end
  end
  if not ed_i then
    for i, ch in ipairs(chapters) do
      if match_any(ch.title or '', LEGACY_ED_PATTERNS) then ed_i = i; break end
    end
  end
  local ed = ed_i and range(ed_i) or nil

  -- Walk back from the last chapter while it may be skipped: the credits
  -- chapter itself, or previews and end cards. Any other chapter - including
  -- an "Outro" or "Epilogue" after the credits, which in this library is story
  -- (Gintama, Yuru Camp, Bookworm) - stops the walk, so it is never cut.
  local tail_i = nil
  for i = #chapters, 1, -1 do
    local name = chapters[i].title or ''
    if (i == ed_i and ed_is_credits) or match_any(name, SKIPPABLE_PATTERNS) then
      tail_i = i
    else
      break
    end
  end
  local tail = nil
  if tail_i and tail_i > 1 then
    tail = chapters[tail_i].time
    if duration <= 0 or duration - tail > MAX_TAIL then tail = nil end
  end
  return op, ed, tail
end

local function find_skips_json(path)
  local norm = path:gsub('\\', '/')
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
  local basename = path:match('([^/\\]+)$') or path
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

local function ass_escape(s)
  return (s:gsub('\\', '\\\\'):gsub('{', '\\{'):gsub('}', '\\}'))
end

local function draw_button_at(label, sub, a, progress)
  if a <= 0.01 then
    mp.set_osd_ass(osd_w, osd_h, '')
    return
  end
  local x, y, w, h = button_rect()
  local fill_a   = lerp_alpha(FILL_TARGET_HEX, a)
  local text_a   = lerp_alpha(0x00, a)
  local sub_a    = lerp_alpha(0x50, a)
  -- Borderless translucent slab to match uosc's flat aesthetic.
  local bg = string.format(
    [[{\an7\pos(%d,%d)\bord0\1c&H000000&\1a&H%02x&\p1}m 0 0 l %d 0 %d %d 0 %d{\p0}]],
    x, y, fill_a, w, w, h, h
  )
  local text
  if sub ~= '' then
    text = string.format(
      [[{\an5\pos(%d,%d)\bord0\1c&Hffffff&\1a&H%02x&\fs38\b1}%s]],
      x + math.floor(w / 2), y + math.floor(h / 2) - 18, text_a, label
    ) .. '\n' .. string.format(
      [[{\an5\pos(%d,%d)\bord0\1c&Hffffff&\1a&H%02x&\fs24\b0}%s]],
      x + math.floor(w / 2), y + math.floor(h / 2) + 16, sub_a, ass_escape(sub)
    )
  else
    text = string.format(
      [[{\an5\pos(%d,%d)\bord0\1c&Hffffff&\1a&H%02x&\fs40\b1}%s]],
      x + math.floor(w / 2), y + math.floor(h / 2) - 6, text_a, label
    )
  end

  -- Countdown bar hugging the button's bottom inner edge. Joined with a real
  -- newline so its own \pos applies.
  local bar = ''
  if progress and progress > 0 then
    local bar_h = 6
    local bar_margin_x = 12
    local bar_margin_b = 8
    local bar_w_max = w - bar_margin_x * 2
    local bar_w = math.max(1, math.floor(bar_w_max * progress))
    local bar_x = x + bar_margin_x
    local bar_y = y + h - bar_h - bar_margin_b
    local bar_a = lerp_alpha(0x20, a)
    bar = '\n' .. string.format(
      [[{\an7\pos(%d,%d)\bord0\1c&Hffffff&\1a&H%02x&\p1}m 0 0 l %d 0 %d %d 0 %d{\p0}]],
      bar_x, bar_y, bar_a, bar_w, bar_w, bar_h, bar_h
    )
  end

  mp.set_osd_ass(osd_w, osd_h, bg .. '\n' .. text .. bar)
end

-- Defined further down; the click and key handlers need them in scope.
local activate, dismiss

local function on_mbtn_left()
  local pos = mp.get_property_native('mouse-pos')
  if not pos then return end
  local x, y, w, h = button_rect()
  if pos.x >= x and pos.x <= x + w and pos.y >= y and pos.y <= y + h then
    activate()
  end
  -- Clicks outside the button are silently consumed while it is up.
end

local function bind_while_visible()
  saved_autohide = mp.get_property_native('cursor-autohide')
  mp.set_property('cursor-autohide', 'no')
  mp.add_forced_key_binding('MBTN_LEFT', 'skip-segment-click', on_mbtn_left)
  mp.add_forced_key_binding('ENTER', 'skip-segment-enter', function() activate() end)
  mp.add_forced_key_binding('KP_ENTER', 'skip-segment-kpenter', function() activate() end)
  mp.add_forced_key_binding('GAMEPAD_ACTION_DOWN', 'skip-segment-pad-a', function() activate() end)
  mp.add_forced_key_binding('ESC', 'skip-segment-esc', function() dismiss() end)
  mp.add_forced_key_binding('GAMEPAD_ACTION_RIGHT', 'skip-segment-pad-b', function() dismiss() end)
end

local function unbind_while_visible()
  for _, name in ipairs({ 'skip-segment-click', 'skip-segment-enter', 'skip-segment-kpenter',
                          'skip-segment-pad-a', 'skip-segment-esc', 'skip-segment-pad-b' }) do
    mp.remove_key_binding(name)
  end
  if saved_autohide ~= nil then
    mp.set_property('cursor-autohide', tostring(saved_autohide))
  end
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

  local progress = 0
  if next_deadline and target_alpha == 1.0 then
    -- Next's countdown runs on playback time, so pausing pauses it.
    local t = mp.get_property_number('time-pos', 0)
    progress = math.max(0, math.min(1, (next_deadline - t) / NEXT_COUNTDOWN))
    if t >= next_deadline then
      next_deadline = nil
      anim_timer = nil
      last_anim_time = nil
      activate()
      return
    end
  elseif shown_at and target_alpha == 1.0 then
    -- Skip buttons dismiss themselves after a few seconds. Once that fires,
    -- remember which segment it was so re-entering it does not re-pop.
    local elapsed = now - shown_at
    progress = math.max(0, 1 - elapsed / AUTO_DISMISS_SECONDS)
    if elapsed >= AUTO_DISMISS_SECONDS then
      dismissed_active = current.active
      target_alpha = 0.0
      shown_at = nil
      progress = 0
    end
  end

  draw_button_at(current_label, current_sub, cur_alpha, progress)

  -- Keep ticking while fading OR while a countdown bar needs redrawing.
  local need_more = (cur_alpha ~= target_alpha) or (shown_at ~= nil) or (next_deadline ~= nil)
  if need_more then
    anim_timer = mp.add_timeout(TICK_SECONDS, anim_tick)
  else
    anim_timer = nil
    last_anim_time = nil
    if target_alpha == 0 and button_visible then
      unbind_while_visible()
      button_visible = false
    end
  end
end

local function start_anim()
  if anim_timer then return end
  last_anim_time = mp.get_time()
  anim_tick()
end

local function show_button(label, sub)
  msg.verbose('button: ' .. label .. (next_deadline and ' (countdown)' or ''))
  current_label = label
  current_sub = sub or ''
  if not button_visible then
    bind_while_visible()
    button_visible = true
  end
  target_alpha = 1.0
  start_anim()
end

local function hide_button()
  shown_at = nil
  next_deadline = nil
  if not button_visible then return end
  target_alpha = 0.0
  start_anim()
end

mp.register_event('file-loaded', function()
  current.op, current.ed, current.tail, current.active = nil, nil, nil, nil
  dismissed_active = nil
  shown_at = nil
  next_deadline = nil
  last_tick = 0
  hide_button()
  local path = mp.get_property('path', '')
  if path == '' or path:match('^https?://') or path:match('^ytdl://') then return end

  local side_op, side_ed = load_sidecar(path)
  local ch_op, ch_ed, ch_tail = classify_chapters()
  current.op = side_op or ch_op
  current.ed = side_ed or ch_ed
  current.tail = ch_tail
  -- A sidecar ending that runs to the end of the file is a credits tail too.
  if side_ed and not ch_tail then
    local duration = mp.get_property_number('duration', 0)
    if duration > 0 and side_ed[2] >= duration - 3 then current.tail = side_ed[1] end
  end
  -- Silent normally; mpv -v (or --msg-level=skip_segment=v) shows it.
  msg.verbose(string.format('segments: op=%s ed=%s tail=%s next=%s autoplay=%s',
    current.op and string.format('%.1f-%.1f', current.op[1], current.op[2]) or '-',
    current.ed and string.format('%.1f-%.1f', current.ed[1], current.ed[2]) or '-',
    current.tail and string.format('%.1f', current.tail) or '-',
    next_entry() and 'yes' or 'no', tostring(autoplay)))
end)

mp.observe_property('osd-dimensions', 'native', function(_, dim)
  if dim and dim.w and dim.h and dim.w > 0 and dim.h > 0 then
    osd_w, osd_h = dim.w, dim.h
    if button_visible then
      draw_button_at(current_label, current_sub, cur_alpha)
    end
  end
end)

-- Shorten to about n characters, never splitting a UTF-8 sequence (titles
-- here are often Japanese, or use full-width punctuation).
local function shorten(s, n)
  if #s <= n then return s end
  local cut = n
  while cut > 0 and s:byte(cut + 1) and s:byte(cut + 1) >= 0x80 and s:byte(cut + 1) < 0xC0 do cut = cut - 1 end
  return trim(s:sub(1, cut)) .. '…'
end

local function next_label(entry)
  local what = (queue and queue.category == 'youtube') and 'Next Video' or 'Next Episode'
  return what .. '  ›', shorten(entry.title or '', 40)
end

mp.observe_property('time-pos', 'number', function(_, t)
  if not t then return end
  local now = mp.get_time()
  if now - last_tick < 0.5 then return end
  last_tick = now

  local was_active = current.active
  local now_active = nil

  -- Next takes precedence: past the credits tail (or into the last stretch of
  -- a file without one) when there is something to go to.
  local entry = next_entry()
  if entry then
    local duration = mp.get_property_number('duration', 0)
    local start = current.tail or (duration > 0 and duration - fallback_window) or nil
    if start and t >= start then now_active = 'next' end
  end
  if not now_active then
    if in_range(t, current.op) then now_active = 'op'
    elseif in_range(t, current.ed) then now_active = 'ed' end
  end
  current.active = now_active

  if now_active ~= was_active then
    if now_active == 'next' and dismissed_active ~= 'next' then
      local label, sub = next_label(entry)
      shown_at = nil
      -- Counting down only where the credits are known: a guessed window
      -- never cuts a video short.
      next_deadline = (autoplay and current.tail) and (t + NEXT_COUNTDOWN) or nil
      show_button(label, sub)
    elseif now_active == 'op' and dismissed_active ~= 'op' then
      next_deadline = nil
      shown_at = mp.get_time()
      show_button('Skip Opening')
    elseif now_active == 'ed' and dismissed_active ~= 'ed' then
      next_deadline = nil
      shown_at = mp.get_time()
      show_button('Skip Ending')
    elseif now_active == nil then
      if button_visible then hide_button() end
      dismissed_active = nil  -- left the segment; future re-entry can show again
    end
  end
end)

activate = function()
  msg.verbose('pressed: ' .. tostring(current.active))
  if current.active == 'next' then
    hide_button()
    current.active = nil
    -- Leaving early still counts as having finished the episode.
    mp.commandv('script-message', 'vault-finished')
    mp.command('playlist-next')
    return
  end
  local range = nil
  if current.active == 'op' then range = current.op
  elseif current.active == 'ed' then range = current.ed end
  if range then
    mp.commandv('seek', tostring(range[2]), 'absolute+exact')
    current.active = nil
    hide_button()
  end
end

dismiss = function()
  msg.verbose('dismissed: ' .. tostring(current.active))
  dismissed_active = current.active
  hide_button()
end

mp.add_forced_key_binding(SKIP_KEY, 'skip-segment', function() activate() end)
${gamepadBind}`
}
