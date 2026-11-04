import { mkdir, writeFile } from "node:fs/promises";
import { createProject, serialize, svg } from "../web/board-studio/model.mjs";
const dir = new URL("../docs/board-studio/examples/", import.meta.url),
  p = createProject();
await mkdir(dir, { recursive: true });
await writeFile(new URL("grakallbanen-300x400.json", dir), serialize(p) + "\n");
await writeFile(new URL("grakallbanen-300x400.svg", dir), svg(p));
await writeFile(
  new URL("front-openings-300x400.svg", dir),
  svg(p, { layers: ["holes", "outline"] }),
);
console.log(
  "300 × 400 mm SVG, separate opening centres, and editable v1 JSON generated. No LED binding or production validation.",
);
