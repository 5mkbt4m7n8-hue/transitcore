# Mini LED bitmap text

LED profiles use the original InTransit 3×5 uppercase bitmap font, including Æ Ø Å, at integer scale only. Unknown characters use ?. LCD/OLED text retains the existing native rendering.

The canonical source is `web/mini/pixel-font.js`. Run `node scripts/generate-mini-font.mjs` after editing glyphs; commit the generated `firmware/mini/include/mini_font.hpp`. HUB75 draws those exact glyph bits through fillRect. CI compares generated files and every rendered glyph rectangle against compiled C++ at scales 1–3.

Small fields first omit “via …”, abbreviate gate/stasjon, then end truncated text with a period. Route numbers and countdowns retain separate columns. 64×64 classic still shows five departures. Full names remain available in the controls and source data.

The preview selector defaults to sharp pixels. LED dots are a separate presentation of the same physical framebuffer; PNG exports remain native resolution. Large LED panels above 20,000 pixels fall back to sharp rendering to keep the preview responsive. Preview preference is session-only and does not modify saved display profiles.

The web classic, compact, bold and clock designs are retained. Firmware currently implements its existing classic design only; font parity does not claim full screenshot/layout parity. Physical panel brightness, optics, wiring and readability have not been validated on real hardware.

## Adaptive LED destination layout

The classic and compact **LED** boards now reserve exactly the actual
3×5-font width of the line number and time label, with two physical
pixels between columns on 64×64, instead of reserving percentages of the
whole panel. That can reclaim about 10 pixels per row at 64×64: for
example, `12 | STRINDHEIM | 3m` shows all ten letters of STRINDHEIM,
rather than truncating after seven or eight. The standard **five rows**
are unchanged.

For text that is still too long, remove routing clauses beginning
`via`, then shorten generic street/station/terminal words, then prefer a
complete first destination word before the final glyph-safe period
truncation. Route and countdown columns have precedence and may not
collide. The original full destination and route remain in the Entur
data and filters.

On 64×64 LED boards the header may use more room for the full stop
name (such as `PRINSENS GATE`); the footer remains explicitly
`SIMULERT` for DEMO and the browser's DEMO badge is unchanged. Boards
without a footer retain the header DEMO label. Larger OLED/TFT text
layout, font pixels, four display designs and ESP32 hardware behavior
are otherwise unchanged. The physical ESP32 currently retains its
own classic layout and has not been flashed or compared end to end.

## Optional destination abbreviation or scrolling

Mini web simulator's **«Hvis destinasjonsnavnet er for langt»** option offers
**Forkort teksten** (the existing/default behavior) and **Rull teksten rolig**.
The user can store the chosen option inside each named Mini 3.0 screen profile,
as well as the exported JSON display configuration. Existing saved version 3
profiles without this new field still load as `shorten`; other source data,
saved route filters and the ESP32 hardware configuration are unchanged.

In scrolling mode, only a destination that does not fit its allocated column
moves. Route number, countdown and stop header remain stationary.
The renderer clips glyphs to the destination column itself; no text can
overlap route or time. Scrolling uses **whole physical pixels**:
one pixel per **120 ms**, a **1.2 second pause at both ends**, then reverses
direction without jumping. The effect is supported in the classic, compact,
large-next-departure and clock web designs, including different panel widths.

The animation runs only when the selected panel has overflowing text and the
webpage is visible; it does not request extra Entur data. It respects the
user's operating-system **reduced-motion** preference by falling back to
static abbreviation. Default mode continues to show the five departures
on the 64×64 LED display. The physical ESP32 firmware **does not yet
implement scrolling**; this is a web-simulator-only control until a hardware
test and driver integration can be done.

The PNG export captures the currently visible animation frame; it cannot
encode a moving animation.
