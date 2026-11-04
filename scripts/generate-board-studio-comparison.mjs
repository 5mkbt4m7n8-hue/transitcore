import { writeFile, readFile } from "node:fs/promises";
import { geometryFixture } from "../web/board-studio/fixtures.mjs";
import { svg, serialize } from "../web/board-studio/model.mjs";
const root = new URL("../docs/board-studio/", import.meta.url),
  p = geometryFixture(),
  after = svg(p),
  before = await readFile(new URL("geometry-before.svg", root), "utf8");
await writeFile(new URL("geometry-after.svg", root), after);
await writeFile(
  new URL("examples/geometry-v02.json", root),
  serialize(p) + "\n",
);
let cropId = 0;
const cropped = (source) => {
  const id = `crop-${cropId++}`;
  return source
    .replace(/<\?xml[^>]+>/, "")
    .replace(
      /width="300mm" height="400mm" viewBox="0 0 300 400"/,
      'width="100%" height="330" viewBox="18 145 230 100"',
    )
    .replace(
      /(<svg[^>]*>)/,
      `$1<defs><clipPath id="${id}"><rect x="18" y="145" width="230" height="100"/></clipPath></defs><g clip-path="url(#${id})">`,
    )
    .replace("</svg>", "</g></svg>");
};
await writeFile(
  new URL("geometry-comparison.html", root),
  `<!doctype html><html lang="nb"><meta charset="utf-8"><title>Board Studio · geometriregresjon</title><style>body{font:15px Arial;background:#eef1eb;color:#263b2c;margin:0;padding:32px}h1{font-size:23px;font-weight:500}main{display:grid;grid-template-columns:1fr 1fr;gap:22px}section{background:white;padding:24px;border:1px solid #dae1d5;border-radius:8px}h2{font-size:16px;font-weight:500}p{color:#6b7f69;font-size:12px;line-height:1.7}svg{overflow:hidden}footer{font-size:12px;margin-top:20px;color:#65735d}</style><h1>InTransit Board Studio · roterte dobbeltstasjoner</h1><p>Samme stasjonssentre, orienteringer og 10 mm sporavstand. Regresjon fra skjermbildet.</p><main><section><h2>Før · v0.1</h2><p>Uavhengige Bézier-overganger kobler gjennom hverandre ved sluttstasjonen.</p>${cropped(before)}</section><section><h2>Etter · v0.2</h2><p>Felles sentertrasé med normalforskyvning. Varige spor- og portreferanser.</p>${cropped(after)}</section></main><footer>Kurvene er redigerbar vektorgeometri. Offsets eksporteres som adaptive linjesegmenter med 0,008 mm midtpunktsgrense. Geometriprøve uten geografiske kildeidentiteter.</footer></html>`,
);
console.log(
  "Regenerated v0.2 fixture, after SVG and before/after comparison; baseline is retained from v0.1.",
);
