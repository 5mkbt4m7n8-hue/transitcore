#!/usr/bin/env python3
"""Generate a TransitCore route profile from an authoritative Entur GTFS feed."""

import argparse
import csv
import io
import json
import math
import re
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date as date_type
from pathlib import Path

GTFS_URL = "https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_atb-aggregated-gtfs.zip"
PALETTE = ["#ef5350", "#66bb6a", "#42a5f5", "#ffca28", "#ab47bc", "#26c6da"]
ROOT = Path(__file__).resolve().parent.parent
ROUTES_DIR = ROOT / "config" / "routes"


class GtfsSource:
    def __init__(self, directory=None, archive=None):
        self.directory = Path(directory).resolve() if directory else None
        self.archive = zipfile.ZipFile(archive) if archive else None

    def rows(self, name):
        if self.directory:
            handle = (self.directory / name).open(encoding="utf-8-sig", newline="")
            try:
                yield from csv.DictReader(handle)
            finally:
                handle.close()
            return
        raw = self.archive.open(name)
        handle = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        try:
            yield from csv.DictReader(handle)
        finally:
            handle.close()

    def close(self):
        if self.archive:
            self.archive.close()


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--line", required=True, help="Public line number, for example 1")
    parser.add_argument("--codespace", default="ATB", help="Entur codespace, for example ATB or RUT")
    parser.add_argument("--provider-name", default="AtB", help="Provider name used in the profile")
    parser.add_argument("--dataset-url", default=GTFS_URL, help="Authoritative GTFS URL recorded in the profile")
    parser.add_argument("--date", default=date_type.today().isoformat(), help="Service date, YYYY-MM-DD")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--gtfs-dir", help="Use an already extracted GTFS directory")
    source.add_argument("--gtfs-zip", help="Use an existing GTFS ZIP")
    parser.add_argument("--refresh", action="store_true", help="Download a fresh Entur dataset")
    parser.add_argument("--output", help="Output path inside the repository")
    parser.add_argument("--name", help="Override the profile display name")
    parser.add_argument("--register", action="store_true", help="Enable the generated profile in routes.json")
    parser.add_argument("--force", action="store_true", help="Allow replacing an existing output file")
    parser.add_argument("--tolerance-m", type=float, default=12.0, help="Shape simplification tolerance")
    return parser.parse_args()


def download_dataset(refresh, url, codespace):
    cache_zip = ROOT / ".cache" / "entur" / f"{codespace.lower()}.zip"
    cache_zip.parent.mkdir(parents=True, exist_ok=True)
    if refresh or not cache_zip.exists():
        print(f"Downloading Entur {codespace} GTFS to {cache_zip.relative_to(ROOT)}...")
        request = urllib.request.Request(url, headers={"User-Agent": "TransitCore route generator"})
        with urllib.request.urlopen(request, timeout=60) as response, cache_zip.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    return cache_zip


def active_services(source, service_date):
    compact = service_date.strftime("%Y%m%d")
    weekday = service_date.strftime("%A").lower()
    try:
        active = {
            row["service_id"]
            for row in source.rows("calendar.txt")
            if row.get(weekday) == "1" and row["start_date"] <= compact <= row["end_date"]
        }
    except (FileNotFoundError, KeyError):
        active = set()
    for row in source.rows("calendar_dates.txt"):
        if row["date"] != compact:
            continue
        if row["exception_type"] == "1":
            active.add(row["service_id"])
        elif row["exception_type"] == "2":
            active.discard(row["service_id"])
    return active


def transport_mode(route_type):
    value = int(route_type)
    if value in {0, 900, 901, 902, 903, 904, 905, 906}:
        return "tram"
    if value in {1, 400, 401, 402, 403, 404, 405}:
        return "metro"
    if value in {2, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109}:
        return "rail"
    if value == 4 or 1000 <= value < 1100:
        return "ferry"
    if value == 3 or 700 <= value < 800:
        return "bus"
    return "other"


def destination_from_headsign(headsign):
    return re.split(r"\s+via\s+", headsign.strip(), maxsplit=1, flags=re.IGNORECASE)[0]


def point_segment_distance(point, start, end):
    lat0 = math.radians(point[0])
    sx, sy = 111_320 * math.cos(lat0), 110_540
    px, py = point[1] * sx, point[0] * sy
    ax, ay = start[1] * sx, start[0] * sy
    bx, by = end[1] * sx, end[0] * sy
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points, tolerance):
    if len(points) <= 2:
        return points
    distances = [point_segment_distance(point, points[0], points[-1]) for point in points[1:-1]]
    best = max(distances, default=0)
    if best <= tolerance:
        return [points[0], points[-1]]
    index = distances.index(best) + 1
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def is_contiguous_subset(candidate, canonical):
    if len(candidate) > len(canonical):
        return False
    for offset in range(len(canonical) - len(candidate) + 1):
        if canonical[offset:offset + len(candidate)] == candidate:
            return True
    return False


def safe_output_path(requested, codespace, mode, line):
    default = ROUTES_DIR / f"{codespace.lower()}-{mode}-{line}-live.json"
    output = (ROOT / requested).resolve() if requested else default.resolve()
    if not output.is_relative_to(ROOT):
        raise ValueError("output must stay inside the repository")
    return output


def write_json_atomic(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    temporary.replace(path)


def generate(source, args, service_date):
    matches = [row for row in source.rows("routes.txt") if row["route_short_name"] == args.line]
    if len(matches) != 1:
        raise ValueError(f"expected one route for line {args.line}, found {len(matches)}")
    route = matches[0]
    route_id = route["route_id"]
    services = active_services(source, service_date)
    trips = [
        row for row in source.rows("trips.txt")
        if row["route_id"] == route_id and row["service_id"] in services
    ]
    if not trips:
        raise ValueError(f"no active trips for line {args.line} on {service_date}")

    counts = Counter((row["trip_headsign"], row["direction_id"], row["shape_id"]) for row in trips)
    representatives = {}
    for row in trips:
        representatives.setdefault((row["trip_headsign"], row["direction_id"], row["shape_id"]), row["trip_id"])

    stop_times = defaultdict(list)
    representative_ids = set(representatives.values())
    for row in source.rows("stop_times.txt"):
        if row["trip_id"] in representative_ids:
            stop_times[row["trip_id"]].append(row)
    for rows in stop_times.values():
        rows.sort(key=lambda row: int(row["stop_sequence"]))

    patterns = []
    for key, count in counts.items():
        trip_id = representatives[key]
        rows = stop_times[trip_id]
        patterns.append({
            "headsign": key[0], "direction": key[1], "shape": key[2],
            "count": count, "trip": trip_id, "stops": rows,
            "distance": float(rows[-1].get("shape_dist_traveled") or 0),
        })

    by_direction = defaultdict(list)
    for pattern in patterns:
        by_direction[pattern["direction"]].append(pattern)
    canonical_by_direction = {
        direction: max(items, key=lambda item: (len(item["stops"]), item["distance"], item["count"]))
        for direction, items in by_direction.items()
    }
    canonical = max(canonical_by_direction.values(), key=lambda item: (len(item["stops"]), item["distance"], item["count"]))

    stop_ids = {row["stop_id"] for row in canonical["stops"]}
    stops_by_id = {row["stop_id"]: row for row in source.rows("stops.txt") if row["stop_id"] in stop_ids}
    all_pattern_stop_ids = {row["stop_id"] for pattern in patterns for row in pattern["stops"]}
    names_by_stop_id = {row["stop_id"]: row["stop_name"] for row in source.rows("stops.txt") if row["stop_id"] in all_pattern_stop_ids}

    shape_rows = [row for row in source.rows("shapes.txt") if row["shape_id"] == canonical["shape"]]
    shape_rows.sort(key=lambda row: int(row["shape_pt_sequence"]))
    if len(shape_rows) < 2:
        raise ValueError("canonical pattern has no usable shape")

    canonical_names = [names_by_stop_id[row["stop_id"]] for row in canonical["stops"]]
    reverse_names = list(reversed(canonical_names))
    short_turns = []
    for pattern in patterns:
        names = [names_by_stop_id[row["stop_id"]] for row in pattern["stops"]]
        if len(names) >= len(canonical_names):
            continue
        if is_contiguous_subset(names, canonical_names) or is_contiguous_subset(names, reverse_names):
            label = f"{names[0]} - {names[-1]}"
            if label not in short_turns:
                short_turns.append(label)

    directions = []
    for index, (direction, items) in enumerate(sorted(by_direction.items())):
        ranked = Counter(destination_from_headsign(item["headsign"]) for item in items for _ in range(item["count"]))
        destinations = [name for name, _ in ranked.most_common()]
        directions.append({
            "id": f"direction-{direction}",
            "label": "mot " + " / ".join(destinations),
            "destinationMatches": destinations,
            "color": PALETTE[index % len(PALETTE)],
            "reverseShape": direction != canonical["direction"],
        })

    mode = transport_mode(route["route_type"])
    norwegian_mode = {"bus": "buss", "tram": "trikk", "rail": "tog", "metro": "T-bane", "ferry": "ferge"}.get(mode, mode)
    slug = args.codespace.lower()
    profile = {
        "schemaVersion": 1,
        "id": f"{slug}-{mode}-{args.line}-live",
        "name": args.name or f"{args.provider_name} {norwegian_mode} {args.line}",
        "provider": {
            "codespaceId": args.codespace,
            "vehicleEndpoint": "https://api.entur.io/realtime/v2/vehicles/graphql",
        },
        "line": {
            "id": route_id,
            "publicCode": args.line,
            "mode": mode,
            "longName": route["route_long_name"],
        },
        "directions": directions,
        "stops": [
            {
                "id": row["stop_id"],
                "name": stops_by_id[row["stop_id"]]["stop_name"],
                "lat": round(float(stops_by_id[row["stop_id"]]["stop_lat"]), 6),
                "lon": round(float(stops_by_id[row["stop_id"]]["stop_lon"]), 6),
                "shapeDistanceMeters": round(float(row.get("shape_dist_traveled") or 0), 1),
            }
            for row in canonical["stops"]
        ],
        "shape": [
            {"lat": round(lat, 6), "lon": round(lon, 6)}
            for lat, lon in simplify([
                (float(row["shape_pt_lat"]), float(row["shape_pt_lon"])) for row in shape_rows
            ], args.tolerance_m)
        ],
        "display": {"layout": "route-live"},
        "serviceVariants": {
            "canonical": f"{canonical_names[0]} - {canonical_names[-1]}",
            "supportedShortTurns": short_turns,
        },
        "source": {
            "format": "GTFS",
            "dataset": f"Entur {args.codespace} aggregated",
            "url": args.dataset_url,
            "routeId": route_id,
            "shapeId": canonical["shape"],
            "checkedDate": service_date.isoformat(),
        },
    }
    return profile, patterns


def validate_generated(profile):
    if len(profile["directions"]) < 2:
        raise ValueError("generated profile has fewer than two directions")
    if len(profile["stops"]) < 2 or len(profile["shape"]) < 2:
        raise ValueError("generated profile has insufficient stops or shape points")
    distances = [stop["shapeDistanceMeters"] for stop in profile["stops"]]
    if any(right <= left for left, right in zip(distances, distances[1:])):
        raise ValueError("generated stop distances are not strictly increasing")
    if len({direction["id"] for direction in profile["directions"]}) != len(profile["directions"]):
        raise ValueError("generated directions are not unique")


def prepare_registration(output, profile):
    if output.parent != ROUTES_DIR.resolve():
        raise ValueError("--register requires output directly inside config/routes")
    registry_path = ROUTES_DIR / "routes.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    name = output.name
    identity = (
        profile["provider"]["codespaceId"],
        profile["line"].get("id") or profile["line"]["publicCode"],
        profile["line"]["mode"],
    )
    for entry in registry["routes"]:
        existing_name = entry.get("profile")
        if not existing_name or existing_name == name:
            continue
        existing_path = ROUTES_DIR / existing_name
        if not existing_path.exists():
            continue
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
        existing_identity = (
            existing.get("provider", {}).get("codespaceId"),
            existing.get("line", {}).get("id") or existing.get("line", {}).get("publicCode"),
            existing.get("line", {}).get("mode"),
        )
        if existing_identity == identity:
            raise ValueError(
                f"line identity is already registered by {existing_name}"
            )
    matches = [entry for entry in registry["routes"] if entry.get("profile") == name]
    if not matches:
        registry["routes"].append({"profile": name, "enabled": True})
    else:
        matches[0]["enabled"] = True
    return registry_path, registry


def main():
    args = parse_args()
    try:
        service_date = date_type.fromisoformat(args.date)
        if args.gtfs_dir:
            source = GtfsSource(directory=args.gtfs_dir)
        else:
            archive = Path(args.gtfs_zip) if args.gtfs_zip else download_dataset(args.refresh, args.dataset_url, args.codespace)
            source = GtfsSource(archive=archive)
        try:
            profile, patterns = generate(source, args, service_date)
        finally:
            source.close()
        validate_generated(profile)
        output = safe_output_path(args.output, args.codespace, profile["line"]["mode"], args.line)
        if output.exists() and not args.force:
            raise ValueError(f"{output.relative_to(ROOT)} already exists; use --force to replace it")
        registration = prepare_registration(output.resolve(), profile) if args.register else None
        output.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(output, profile)
        if registration:
            write_json_atomic(*registration)
        print(f"Generated {output.relative_to(ROOT)}")
        print(f"Line {args.line}: {len(profile['stops'])} stops, {len(profile['shape'])} shape points")
        print(f"Active patterns: {len(patterns)}; short turns: {len(profile['serviceVariants']['supportedShortTurns'])}")
        print("Run: node tools/validate-route-profiles.mjs")
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

