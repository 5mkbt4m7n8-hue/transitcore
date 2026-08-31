import csv
import io
import json
import math
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(sys.argv[1]).resolve()
ROUTE_DIR = ROOT / "config" / "routes"
BOARD_FILE = ROOT / "config" / "boards" / "oslo-metro-board.json"
BOARD_DIRECTION_FILES = {
    "0": ROOT / "config" / "boards" / "oslo-metro-board-direction-a.json",
    "1": ROOT / "config" / "boards" / "oslo-metro-board-direction-b.json",
}
LINES = {"2", "3", "4", "5"}
LINE_COLORS = {"1": "00A9E0", "2": "F15A24", "3": "9B5AA6", "4": "00529B", "5": "35A936"}


def read_rows(archive, name):
    with archive.open(name) as handle:
        return list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")))


def haversine(a, b):
    radius = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    value = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def slug(value):
    value = value.lower().replace("å", "a").replace("ø", "o").replace("æ", "ae")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def terminal_match(headsign):
    return re.split(r"\s+via\s+", headsign, maxsplit=1, flags=re.IGNORECASE)[0].strip()


def write_json(path, value):
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


with zipfile.ZipFile(ARCHIVE) as archive:
    route_rows = read_rows(archive, "routes.txt")
    trip_rows = read_rows(archive, "trips.txt")
    stop_time_rows = read_rows(archive, "stop_times.txt")
    stop_rows = read_rows(archive, "stops.txt")
    shape_rows = read_rows(archive, "shapes.txt")

routes_by_code = {row["route_short_name"]: row for row in route_rows if row["route_short_name"] in LINES}
stops_by_id = {row["stop_id"]: row for row in stop_rows}
trip_stops = defaultdict(list)
for row in stop_time_rows:
    trip_stops[row["trip_id"]].append(row)
for values in trip_stops.values():
    values.sort(key=lambda row: int(row["stop_sequence"]))

shape_points = defaultdict(list)
for row in shape_rows:
    shape_points[row["shape_id"]].append(row)
for values in shape_points.values():
    values.sort(key=lambda row: int(row["shape_pt_sequence"]))

route_trip_rows = defaultdict(list)
for trip in trip_rows:
    route_trip_rows[trip["route_id"]].append(trip)

quays_by_station_name = defaultdict(set)
for trip in trip_rows:
    route = next((row for row in route_rows if row["route_id"] == trip["route_id"]), None)
    if not route or route.get("route_type") not in {"1", "401"}:
        continue
    for stop_time in trip_stops[trip["trip_id"]]:
        stop = stops_by_id[stop_time["stop_id"]]
        quays_by_station_name[stop["stop_name"]].add(stop["stop_id"])


def canonical_trip(route_id, line):
    candidates = []
    for trip in route_trip_rows[route_id]:
        values = trip_stops[trip["trip_id"]]
        if not values:
            continue
        names = [stops_by_id[value["stop_id"]]["stop_name"] for value in values]
        unique_count = len(dict.fromkeys(names))
        candidates.append((len(values), unique_count, trip["trip_id"], trip))
    if line == "5":
        # Line 5 has several through-running and short-turn variants. The
        # longest trip is not necessarily the public Sognsvann–Vestli line.
        public_terminals = {"Sognsvann", "Vestli"}
        preferred = []
        for candidate in candidates:
            values = trip_stops[candidate[3]["trip_id"]]
            names = [stops_by_id[value["stop_id"]]["stop_name"] for value in values]
            if names and {names[0], names[-1]} == public_terminals:
                preferred.append(candidate)
        if not preferred:
            raise RuntimeError("Fant ingen linje 5-tur mellom Sognsvann og Vestli")
        return max(preferred, key=lambda value: (value[0], value[1]))[3]
    patterns = Counter((tuple(stops_by_id[value["stop_id"]]["stop_name"] for value in trip_stops[item["trip_id"]]), item["shape_id"]) for item in route_trip_rows[route_id] if trip_stops[item["trip_id"]])
    names, shape_id = patterns.most_common(1)[0][0]
    return next(item for item in route_trip_rows[route_id] if item["shape_id"] == shape_id and tuple(stops_by_id[value["stop_id"]]["stop_name"] for value in trip_stops[item["trip_id"]]) == names)


profiles = []
for line in sorted(LINES):
    route = routes_by_code[line]
    trip = canonical_trip(route["route_id"], line)
    ordered = []
    seen_names = set()
    for value in trip_stops[trip["trip_id"]]:
        stop = stops_by_id[value["stop_id"]]
        if stop["stop_name"] in seen_names:
            continue
        seen_names.add(stop["stop_name"])
        ordered.append(stop)
    distance = 0.0
    stops = []
    previous = None
    for stop in ordered:
        lat, lon = float(stop["stop_lat"]), float(stop["stop_lon"])
        if previous:
            distance += haversine(previous, (lat, lon))
        previous = (lat, lon)
        stops.append({
            "id": stop["stop_id"],
            "quayIds": sorted(quays_by_station_name[stop["stop_name"]]),
            "name": stop["stop_name"],
            "lat": lat,
            "lon": lon,
            "shapeDistanceMeters": round(distance, 1),
        })
    first, last = stops[0]["name"], stops[-1]["name"]
    # TransitCore uses stable product colours per public line. The aggregated
    # GTFS route colour can be a common operator brand colour.
    color = "#" + LINE_COLORS[line]
    shape = [{"lat": float(point["shape_pt_lat"]), "lon": float(point["shape_pt_lon"])} for point in shape_points[trip["shape_id"]]]
    profile = {
        "schemaVersion": 1,
        "id": f"rut-metro-{line}-live",
        "name": f"Ruter T-bane {line}",
        "provider": {"codespaceId": "RUT", "vehicleEndpoint": "https://api.entur.io/realtime/v2/vehicles/graphql"},
        "positioning": {
            "strategy": "estimated-station-calls",
            "endpoint": "https://api.entur.io/journey-planner/v3/graphql",
            "pollIntervalMs": 30000,
            "lookBehindSeconds": 75,
            "lookAheadSeconds": 600,
            "stationWindowSeconds": 45,
        },
        "line": {"id": route["route_id"], "publicCode": line, "mode": "metro", "longName": route["route_long_name"], "color": color},
        "directions": [
            {"id": slug(last), "label": f"mot {last}", "destinationMatches": [last], "color": color, "reverseShape": False},
            {"id": slug(first), "label": f"mot {first}", "destinationMatches": [first], "color": color, "reverseShape": True},
        ],
        "stops": stops,
        "shape": shape,
        "display": {"layout": "route-leds" if line == "5" else "route-live"},
        "serviceVariants": {"canonical": route["route_long_name"], "networkLoop": line == "5"},
        "source": {
            "format": "GTFS",
            "dataset": "Entur RUT aggregated",
            "url": "https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_rut-aggregated-gtfs.zip",
            "routeId": route["route_id"],
            "shapeId": trip["shape_id"],
            "checkedDate": "2026-08-11",
        },
    }
    target = ROUTE_DIR / f"rut-metro-{line}-live.json"
    write_json(target, profile)
    profiles.append(profile)

line1_file = ROUTE_DIR / "rut-metro-1-live.json"
line1 = json.loads(line1_file.read_text(encoding="utf-8"))
for stop in line1["stops"]:
    stop["quayIds"] = sorted(quays_by_station_name[stop["name"]])
line1["line"]["color"] = "#" + LINE_COLORS["1"]
for direction in line1["directions"]:
    direction["color"] = "#" + LINE_COLORS["1"]
write_json(line1_file, line1)

registry_file = ROUTE_DIR / "routes.json"
registry = json.loads(registry_file.read_text(encoding="utf-8"))
existing = {entry["profile"] for entry in registry["routes"]}
for line in sorted(LINES):
    filename = f"rut-metro-{line}-live.json"
    if filename not in existing:
        registry["routes"].append({"profile": filename, "enabled": True})
write_json(registry_file, registry)

all_profiles = [line1] + profiles
existing_board = json.loads(BOARD_FILE.read_text(encoding="utf-8")) if BOARD_FILE.exists() else {"nodes": []}
existing_board_leds = {node["id"]: node["led"] for node in existing_board.get("nodes", [])}
nodes_by_name = {}
for profile in all_profiles:
    for stop in profile["stops"]:
        node = nodes_by_name.setdefault(stop["name"], {"id": slug(stop["name"]), "name": stop["name"], "stopIds": set(), "routes": set()})
        node["stopIds"].update(stop.get("quayIds", [stop["id"]]))
        node["routes"].add(profile["id"])
ordered_nodes = sorted(
    nodes_by_name.values(),
    key=lambda value: (0, existing_board_leds[value["id"]])
    if value["id"] in existing_board_leds
    else (1, value["name"]),
)
nodes = []
for led, node in enumerate(ordered_nodes):
    nodes.append({"id": node["id"], "name": node["name"], "led": led, "stopIds": sorted(node["stopIds"]), "routes": sorted(node["routes"])})
board = {
    "schemaVersion": 1,
    "id": "oslo-metro-board",
    "name": "Oslo T-bane",
    "layout": "station-network",
    "routes": [profile["id"] for profile in all_profiles],
    "leds": {"count": len(nodes), "dataPin": None, "brightnessLimit": 32},
    "nodes": nodes,
    "render": {"collisionMode": "alternate", "routePriority": [], "arrivalHoldSeconds": 45, "freshnessSeconds": 120},
    "status": "logical-map-ready-hardware-order-pending",
}
write_json(BOARD_FILE, board)

profile_by_route_id = {profile["line"]["id"]: profile for profile in all_profiles}
profile_stop_names = {profile["id"]: {stop["name"] for stop in profile["stops"]} for profile in all_profiles}
direction_nodes = {"0": {}, "1": {}}
for trip in trip_rows:
    profile = profile_by_route_id.get(trip["route_id"])
    direction_id = trip.get("direction_id", "")
    if not profile or direction_id not in direction_nodes:
        continue
    headsign = trip.get("trip_headsign", "").strip()
    for stop_time in trip_stops[trip["trip_id"]]:
        stop = stops_by_id.get(stop_time["stop_id"])
        if not stop or stop["stop_name"] not in profile_stop_names[profile["id"]]:
            continue
        node = direction_nodes[direction_id].setdefault(stop["stop_name"], {
            "id": slug(stop["stop_name"]), "name": stop["stop_name"],
            "stopIds": set(), "routes": set(), "routeDirections": {},
        })
        node["stopIds"].add(stop["stop_id"])
        node["routes"].add(profile["id"])
        route_direction = node["routeDirections"].setdefault(profile["id"], {
            "directionIds": [direction_id], "headsigns": set(), "destinationMatches": set(),
        })
        if headsign:
            route_direction["headsigns"].add(headsign)
            route_direction["destinationMatches"].add(terminal_match(headsign))

for direction_id, target in BOARD_DIRECTION_FILES.items():
    existing_direction_board = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {"nodes": []}
    existing_direction_leds = {
        node["id"]: node["led"] for node in existing_direction_board.get("nodes", [])
    }
    directional = []
    ordered_direction_nodes = sorted(
        direction_nodes[direction_id].values(),
        key=lambda value: (0, existing_direction_leds[value["id"]])
        if value["id"] in existing_direction_leds
        else (1, value["name"]),
    )
    for led, value in enumerate(ordered_direction_nodes):
        route_directions = {
            route: {
                "directionIds": details["directionIds"],
                "headsigns": sorted(details["headsigns"]),
                "destinationMatches": sorted(details["destinationMatches"]),
            }
            for route, details in sorted(value["routeDirections"].items())
        }
        directional.append({
            "id": value["id"], "name": value["name"], "led": led,
            "stopIds": sorted(value["stopIds"]), "routes": sorted(value["routes"]),
            "routeDirections": route_directions,
        })
    direction_board = {
        "schemaVersion": 1,
        "id": f"oslo-metro-board-direction-{'a' if direction_id == '0' else 'b'}",
        "name": f"Oslo T-bane – retning {'A' if direction_id == '0' else 'B'}",
        "layout": "station-network",
        "directionMode": {"source": "GTFS direction_id", "value": direction_id},
        "routes": [profile["id"] for profile in all_profiles],
        "leds": {"count": len(directional), "dataPin": None, "brightnessLimit": 32},
        "nodes": directional,
        "render": {"collisionMode": "alternate", "routePriority": [], "arrivalHoldSeconds": 45, "freshnessSeconds": 120},
        "status": "direction-filtered-logical-map-ready-hardware-order-pending",
    }
    write_json(target, direction_board)

print(f"Generated lines 2-5, shared Oslo board ({len(nodes)} LEDs) and direction boards "
      f"({len(direction_nodes['0'])}/{len(direction_nodes['1'])} LEDs)")

