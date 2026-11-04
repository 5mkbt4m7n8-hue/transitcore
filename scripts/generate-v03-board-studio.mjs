import { writeFile, mkdir } from "node:fs/promises";
import { trondheimPrototype } from "../web/board-studio/prototype.mjs";
import { serialize, svg } from "../web/board-studio/model.mjs";
const p = trondheimPrototype(),
  dir = new URL("../docs/board-studio/examples/", import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL("trondheim-buss-v03.json", dir), serialize(p) + "\n");
await writeFile(
  new URL("trondheim-buss-v03.svg", dir),
  svg(p, { layers: ["routes", "capsules", "rings", "names", "outline"] }),
);
console.log(
  "Generated Trondheim v0.3 physical demo: 300 × 400 mm, 3 straight segments, 12 stations, 18 bindings. Not a verified route plan or production drill template.",
);
