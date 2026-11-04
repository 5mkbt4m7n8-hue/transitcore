// Runs inside Chromium against the actual downloaded SVG. Geometry assertions
// below use native SVG length sampling and an independent segment algorithm.
export async function checkSvg(page, text, expected) {
  return page.evaluate(
    ({ text, expected }) => {
      const check = (value, message) => {
          if (!value) throw Error(message);
        },
        dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
        sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
        dot = (a, b) => a.x * b.x + a.y * b.y,
        cross = (a, b) => a.x * b.y - a.y * b.x;
      const svg = new DOMParser().parseFromString(
        text,
        "image/svg+xml",
      ).documentElement;
      check(svg.localName === "svg", "SVG parses");
      document.body.append(svg);
      svg.style.cssText = "position:absolute;left:-10000px;top:0";
      try {
        check(
          svg.getAttribute("width") === expected.width + "mm" &&
            svg.getAttribute("height") === expected.height + "mm",
          "physical millimetre dimensions",
        );
        const nodes = [...svg.querySelectorAll("[data-route]")];
        check(
          nodes.length === expected.paths.length,
          "all model paths are exported",
        );
        const paths = [];
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i],
            match = expected.paths.find(
              (p) =>
                p.part === node.dataset.part &&
                p.trackId === node.dataset.track &&
                p.edge === +node.dataset.edge,
            );
          check(!!match, "track and edge identity");
          const values = node
              .getAttribute("d")
              .match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)
              .map(Number),
            points = [];
          for (let j = 0; j < values.length; j += 2)
            points.push({ x: values[j], y: values[j + 1] });
          check(
            points.length === match.points.length,
            "same canonical vertex count",
          );
          for (let j = 0; j < points.length; j++)
            check(
              dist(points[j], match.points[j]) < 1e-8,
              "SVG vertex/model agreement",
            );
          const len = node.getTotalLength();
          check(Number.isFinite(len) && len > 0, "native SVG length");
          paths.push({
            node,
            len,
            points,
            part: node.dataset.part,
            trackId: node.dataset.track,
          });
        }
        const order = { start: 0, core: 1, end: 2 },
          tracks = expected.trackIds.map((id) =>
            paths
              .filter((p) => p.trackId === id)
              .sort((a, b) => order[a.part] - order[b.part]),
          );
        function get(track, s) {
          for (const part of track) {
            if (s <= part.len) return part.node.getPointAtLength(s);
            s -= part.len;
          }
          return track.at(-1).node.getPointAtLength(track.at(-1).len);
        }
        function pointSegment(p, a, b) {
          const d = sub(b, a),
            u = Math.max(0, Math.min(1, dot(sub(p, a), d) / dot(d, d) || 0));
          return dist(p, { x: a.x + u * d.x, y: a.y + u * d.y });
        }
        const flattened = tracks.map((track) =>
          track.flatMap((part, i) => (i ? part.points.slice(1) : part.points)),
        );
        let maxGapError = 0,
          minTangentCos = 1;
        for (let side = 0; side < 2; side++) {
          const track = tracks[side],
            other = flattened[1 - side],
            total = track.reduce((s, p) => s + p.len, 0);
          check(track.length === 3, "full start/core/end rail");
          // Check actual nearest distance in both directions, away from clipped ends.
          for (let j = 0; j <= 100; j++) {
            const p = get(track, total * (0.1 + (0.8 * j) / 100));
            let gap = Infinity;
            for (let k = 0; k < other.length - 1; k++)
              gap = Math.min(gap, pointSegment(p, other[k], other[k + 1]));
            maxGapError = Math.max(
              maxGapError,
              Math.abs(gap - expected.spacing),
            );
            check(
              Math.abs(gap - expected.spacing) < 0.04,
              `actual rail distance ${gap} vs ${expected.spacing}`,
            );
          }
          for (let j = 1; j < track.length; j++) {
            const a = track[j - 1],
              b = track[j],
              end = a.node.getPointAtLength(a.len),
              start = b.node.getPointAtLength(0);
            check(dist(end, start) < 0.0001, "continuous join");
            const va = sub(
                end,
                a.node.getPointAtLength(Math.max(0, a.len - 0.01)),
              ),
              vb = sub(b.node.getPointAtLength(Math.min(0.01, b.len)), start),
              cos =
                dot(va, vb) / (Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y));
            minTangentCos = Math.min(minTangentCos, cos);
            check(cos > 0.995, `tangent continuity ${cos}`);
          }
          const first = get(track, 0),
            last = get(track, total),
            ports = expected.ports[side];
          check(
            Math.abs(dist(first, ports.start) - expected.ringRadiusA) < 0.015,
            "correct rotated start port and ring clipping",
          );
          check(
            Math.abs(dist(last, ports.end) - expected.ringRadiusB) < 0.015,
            "correct rotated end port and ring clipping",
          );
        }
        for (let side = 0; side < (expected.joins ?? []).length; side++) {
          const pts = flattened[side],
            index = pts.findIndex((p) => dist(p, expected.joins[side]) < 1e-7);
          check(
            index > 0 && index < pts.length - 1,
            "shared Bezier knot appears in SVG",
          );
          let before = index - 1,
            after = index + 1;
          while (before > 0 && dist(pts[before], pts[index]) < 1e-8) before--;
          while (after < pts.length - 1 && dist(pts[after], pts[index]) < 1e-8)
            after++;
          const u = sub(pts[index], pts[before]),
            v = sub(pts[after], pts[index]),
            cos = dot(u, v) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
          check(
            cos > 0.995,
            "rendered continuity across shared Bezier tangent",
          );
        }
        function intersects(a, b, c, d) {
          const ab = sub(b, a),
            cd = sub(d, c),
            den = cross(ab, cd);
          if (Math.abs(den) < 1e-10) return false;
          const t = cross(sub(c, a), cd) / den,
            u = cross(sub(c, a), ab) / den;
          return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8;
        }
        const [left, right] = flattened;
        for (let i = 0; i < left.length - 1; i++)
          for (let j = 0; j < right.length - 1; j++)
            check(
              !intersects(left[i], left[i + 1], right[j], right[j + 1]),
              "exported tracks never cross",
            );
        for (const pts of flattened)
          for (let i = 0; i < pts.length - 1; i++)
            for (let j = i + 2; j < pts.length - 1; j++)
              if (dist(pts[i + 1], pts[j]) > 1e-8)
                check(
                  !intersects(pts[i], pts[i + 1], pts[j], pts[j + 1]),
                  "no exported loop",
                );
        return {
          maxGapError,
          minTangentCos,
          vertices: flattened.map((p) => p.length),
          paths: nodes.map((n) => n.getAttribute("d")),
        };
      } finally {
        svg.remove();
      }
    },
    { text, expected },
  );
}
