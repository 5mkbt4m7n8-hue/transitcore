# Mini LED bitmap text

LED profiles use the original InTransit 3×5 uppercase bitmap font, including Æ Ø Å, at integer scale only. Unknown characters use ?. LCD/OLED text retains the existing native rendering.

The canonical source is `web/mini/pixel-font.js`. Run `node scripts/generate-mini-font.mjs` after editing glyphs; commit the generated `firmware/mini/include/mini_font.hpp`. HUB75 draws those exact glyph bits through fillRect. CI compares generated files and every rendered glyph rectangle against compiled C++ at scales 1–3.

Small fields first omit “via …”, abbreviate gate/stasjon, then end truncated text with a period. Route numbers and countdowns retain separate columns. 64×64 classic still shows five departures. Full names remain available in the controls and source data.

The preview selector defaults to sharp pixels. LED dots are a separate presentation of the same physical framebuffer; PNG exports remain native resolution. Large LED panels above 20,000 pixels fall back to sharp rendering to keep the preview responsive. Preview preference is session-only and does not modify saved display profiles.

The web classic, compact, bold and clock designs are retained. Firmware currently implements its existing classic design only; font parity does not claim full screenshot/layout parity. Physical panel brightness, optics, wiring and readability have not been validated on real hardware.
