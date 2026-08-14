import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expected = new Map([["1", "#ef5350"], ["2", "#42a5f5"], ["3", "#66bb6a"]]);
const colors = new Set();

for (const [line, color] of expected) {
  const profile = JSON.parse(await readFile(new URL(`../config/routes/atb-bus-${line}-live.json`, import.meta.url), "utf8"));
  assert.equal(profile.line.publicCode, line);
  assert.equal(profile.line.color, color, `Line ${line} must keep its fixed color`);
  colors.add(profile.line.color);
}

assert.equal(colors.size, expected.size, "Every bus line must have a distinct color");
console.log("Bus line color tests OK");
