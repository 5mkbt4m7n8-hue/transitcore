import { writeFile } from "node:fs/promises";
import { trondheimPrototype } from "../web/board-studio/prototype.mjs";
import {
  drillPdf,
  drillSvg,
  machiningSvg,
  graphicsSvg,
  drillCsv,
} from "../web/board-studio/production.mjs";
const p = trondheimPrototype(),
  base = new URL("../docs/board-studio/examples/", import.meta.url);
for (const side of ["front", "back"])
  for (const [kind, extension, make] of [
    ["drill-a4", "pdf", drillPdf],
    ["drill", "svg", drillSvg],
    ["holes", "svg", machiningSvg],
    ["graphics", "svg", graphicsSvg],
    ["holes", "csv", drillCsv],
  ])
    await writeFile(
      new URL(`trondheim-buss-v04-${kind}-${side}.${extension}`, base),
      make(p, { side }),
    );
await writeFile(
  new URL("trondheim-buss-v04-drill-full-front.pdf", base),
  drillPdf(p, { paper: "board", side: "front" }),
);
