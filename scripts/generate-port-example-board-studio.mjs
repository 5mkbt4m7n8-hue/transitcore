import { writeFile } from "node:fs/promises";
import { portFixture } from "./fixtures/board-studio-v032.mjs";
import {
  connectPorts,
  newConnection,
} from "../web/board-studio/connections.mjs";
import {
  parseProject,
  serialize,
  layerMarkup,
} from "../web/board-studio/model.mjs";
const p = portFixture();
p.layout.stations = p.layout.stations.filter((s) => !s.id.startsWith("pair-"));
const before = structuredClone(p);
const legacyBranch = newConnection(before, ["junction", "branch"]);
legacyBranch.portSigns = { junction: 1, branch: 1 };
before.layout.routes.push(legacyBranch);
const old = parseProject(before);
const after = parseProject(
  connectPorts(
    p,
    { stationId: "junction", portId: "pair:left" },
    { stationId: "branch", portId: "pair:left" },
  ).project,
);
await writeFile(
  new URL(
    "../docs/board-studio/examples/port-sidebranch-v032.json",
    import.meta.url,
  ),
  serialize(after),
);
const panel = (p, x, title, note) =>
  `<g transform="translate(${x} 0)"><text x="15" y="16" font-size="8" fill="#203e31">${title}</text><text x="15" y="27" font-size="4.5" fill="#62756a">${note}</text><g transform="translate(0 35)">${["routes", "capsules", "rings", "names"].map((id) => layerMarkup(p, id)).join("")}</g></g>`;
// The old renderer is intentionally used without explicit anchors on the old
// branch. This is a reproducible illustration, not the user's screenshot.
await writeFile(
  new URL("../docs/board-studio/v032-before-after.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 600 310" font-family="Arial, sans-serif"><rect width="600" height="310" fill="#fff"/><path d="M 300 0 V 310" stroke="#ddd"/>${panel(old, 0, "Før: automatisk tilkobling", "Reprodusert eldre forbindelse med lagret utgang på motsatt side.")}${panel(after, 300, "Etter: eksplisitt portvalg", "Sidegrenen deler hovedlinjens valgte utgang. To spor, én senterkurve.")}</svg>`,
);
