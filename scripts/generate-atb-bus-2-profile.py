import csv
import io
import json
import math
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE_ID = "ATB:Line:2_2"


def rows(archive, name):
    with archive.open(name) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")))


def point_segment_distance(point, start, end):
    lat0 = math.radians(point[0])
    sx, sy = 111_320 * math.cos(lat0), 110_540
    px, py = point[1] * sx, point[0] * sy
    ax, ay = start[1] * sx, start[0] * sy
    bx, by = end[1] * sx, end[0] * sy
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points, tolerance=12):
    if len(points) <= 2:
        return points
    distances = [point_segment_distance(p, points[0], points[-1]) for p in points[1:-1]]
    best = max(distances, default=0)
    if best <= tolerance:
        return [points[0], points[-1]]
    index = distances.index(best) + 1
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


if len(sys.argv) != 2:
    raise SystemExit("Usage: generate-atb-bus-2-profile.py path/to/atb.zip")

with zipfile.ZipFile(sys.argv[1]) as archive:
    trips = rows(archive, "trips.txt")
    route_trips = [t for t in trips if t["route_id"] == ROUTE_ID and "Outbound" in t["shape_id"]]
    shape_id = Counter(t["shape_id"] for t in route_trips).most_common(1)[0][0]
    trip = next(t for t in route_trips if t["shape_id"] == shape_id)
    stop_times = sorted(
        (r for r in rows(archive, "stop_times.txt") if r["trip_id"] == trip["trip_id"]),
        key=lambda r: int(r["stop_sequence"]),
    )
    stops = {r["stop_id"]: r for r in rows(archive, "stops.txt")}
    shape_rows = sorted(
        (r for r in rows(archive, "shapes.txt") if r["shape_id"] == shape_id),
        key=lambda r: int(r["shape_pt_sequence"]),
    )

profile = {
    "schemaVersion": 1,
    "id": "atb-bus-2-live",
    "name": "AtB buss 2",
    "provider": {"codespaceId": "ATB", "vehicleEndpoint": "https://api.entur.io/realtime/v2/vehicles/graphql"},
    "line": {"id": ROUTE_ID, "publicCode": "2", "mode": "bus", "longName": "Strindheim - Lade - sentrum - Lund"},
    "directions": [
        {"id": "lund", "label": "mot Lund/Midteggen", "destinationMatches": ["Lund", "Midteggen"], "color": "#ef5350", "reverseShape": False},
        {"id": "strindheim", "label": "mot Strindheim", "destinationMatches": ["Strindheim"], "color": "#66bb6a", "reverseShape": True},
    ],
    "stops": [{
        "id": r["stop_id"], "name": stops[r["stop_id"]]["stop_name"],
        "lat": round(float(stops[r["stop_id"]]["stop_lat"]), 6),
        "lon": round(float(stops[r["stop_id"]]["stop_lon"]), 6),
        "shapeDistanceMeters": round(float(r["shape_dist_traveled"]), 1),
    } for r in stop_times],
    "shape": [{"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in simplify([
        (float(r["shape_pt_lat"]), float(r["shape_pt_lon"])) for r in shape_rows
    ])],
    "display": {"layout": "route-live"},
    "source": {
        "format": "GTFS", "dataset": "Entur ATB aggregated",
        "url": "https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_atb-aggregated-gtfs.zip",
        "routeId": ROUTE_ID, "shapeId": shape_id, "checkedDate": "2026-08-11",
    },
}

out = ROOT / "config" / "routes" / "atb-bus-2-live.json"
out.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"Wrote {out.relative_to(ROOT)}: {len(profile['stops'])} stops, {len(profile['shape'])} shape points")

