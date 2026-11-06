// Minimal offline vector PDF writer. All public coordinates are millimetres.
// No canvas rasterization, font downloads, print-dialog defaults or DPI guessing.
export const MM_TO_PT = 72 / 25.4;
const n = (x) => Number(x.toFixed(7)).toString();
const literal = (text) =>
  "(" +
  [...String(text)]
    .map((c) => {
      const v = c.charCodeAt(0);
      if (v > 255) return "?";
      if (c === "(" || c === ")" || c === "\\") return "\\" + c;
      if (v < 32) return " ";
      if (v > 126) return "\\" + v.toString(8).padStart(3, "0");
      return c;
    })
    .join("") +
  ")";
const unicode = (text) =>
  "<FEFF" +
  Array.from({ length: text.length }, (_, i) =>
    text.charCodeAt(i).toString(16).padStart(4, "0"),
  ).join("") +
  ">";
export function vectorPdf(pages, { title = "Boremal", layers } = {}) {
  const objects = [],
    add = (s) => {
      objects.push(s);
      return objects.length;
    },
    catalog = add(""),
    pagesRef = add(""),
    font = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ),
    groups = layers.map((layer, i) => ({
      id: add(`<< /Type /OCG /Name ${literal(layer.label)} >>`),
      key: "L" + i,
      ...layer,
    }));
  const pageIds = [];
  for (const page of pages) {
    const k = MM_TO_PT,
      pt = (x, y) => `${n(x * k)} ${n((page.height - y) * k)}`;
    let stream = "";
    for (const group of groups) {
      stream += `/OC /${group.key} BDC\nq\n`;
      if (group.clip)
        stream += `${n(page.margin * k)} ${n(page.margin * k)} ${n((page.width - 2 * page.margin) * k)} ${n((page.height - 2 * page.margin) * k)} re W n\n`;
      for (const item of page.items.filter((i) => i.layer === group.keyName)) {
        const gray = item.gray ?? 0;
        stream += `${n(gray)} G ${n(gray)} g ${n((item.stroke ?? 0.12) * k)} w\n`;
        if (item.type === "line")
          stream += `${pt(item.x, item.y)} m ${pt(item.x2, item.y2)} l S\n`;
        else if (item.type === "rect")
          stream += `${n(item.x * k)} ${n((page.height - item.y - item.height) * k)} ${n(item.width * k)} ${n(item.height * k)} re S\n`;
        else if (item.type === "circle") {
          const { x, y, r } = item,
            c = r * 0.5522847498307936;
          stream += `${pt(x + r, y)} m ${pt(x + r, y + c)} ${pt(x + c, y + r)} ${pt(x, y + r)} c ${pt(x - c, y + r)} ${pt(x - r, y + c)} ${pt(x - r, y)} c ${pt(x - r, y - c)} ${pt(x - c, y - r)} ${pt(x, y - r)} c ${pt(x + c, y - r)} ${pt(x + r, y - c)} ${pt(x + r, y)} c S\n`;
        } else if (item.type === "text") {
          const a = (-(item.rotate ?? 0) * Math.PI) / 180;
          stream += `BT /F1 ${n(item.size * k)} Tf ${n(Math.cos(a))} ${n(Math.sin(a))} ${n(-Math.sin(a))} ${n(Math.cos(a))} ${pt(item.x, item.y)} Tm ${literal(item.text)} Tj ET\n`;
        }
      }
      stream += "Q\nEMC\n";
    }
    const content = add(
        `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
      ),
      pageId = add(
        `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${n(page.width * k)} ${n(page.height * k)}] /Rotate 0 /UserUnit 1 /Resources << /Font << /F1 ${font} 0 R >> /Properties << ${groups.map((g) => `/${g.key} ${g.id} 0 R`).join(" ")} >> >> /Contents ${content} 0 R >>`,
      );
    pageIds.push(pageId);
  }
  objects[pagesRef - 1] =
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] >>`;
  objects[catalog - 1] =
    `<< /Type /Catalog /Pages ${pagesRef} 0 R /ViewerPreferences << /PrintScaling /None /Duplex /Simplex >> /OCProperties << /OCGs [${groups.map((g) => g.id + " 0 R").join(" ")}] /D << /Order [${groups.map((g) => g.id + " 0 R").join(" ")}] /ON [${groups.map((g) => g.id + " 0 R").join(" ")}] >> >> >>`;
  const info = add(
    `<< /Title ${unicode(title)} /Creator (InTransit Board Studio) /Producer (InTransit millimetre vector export) >>`,
  );
  let file = "%PDF-1.7\n",
    offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(file, (c) => c.charCodeAt(0));
}
