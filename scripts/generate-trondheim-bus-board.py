import csv
import io
import json
import re
import sys
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "config" / "routes"
OUT = ROOT / "config" / "boards" / "trondheim-bus-board.json"
PROFILE_FILES = ["atb-bus-1-live.json", "atb-bus-2-live.json", "atb-bus-3-live.json"]


def slug(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def rows(archive, name):
    with archive.open(name) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")))


def terminal_match(headsign):
    return re.split(r"\s+via\s+", headsign, maxsplit=1, flags=re.IGNORECASE)[0].strip()


if len(sys.argv) != 2:
    raise SystemExit("Usage: generate-trondheim-bus-board.py path/to/atb.zip")

profiles = [json.loads((ROUTES / name).read_text(encoding="utf-8")) for name in PROFILE_FILES]
profile_by_route = {profile["line"]["id"]: profile for profile in profiles}
canonical_names = {stop["name"].casefold() for profile in profiles for stop in profile["stops"]}

with zipfile.ZipFile(sys.argv[1]) as archive:
    stops = {row["stop_id"]: row for row in rows(archive, "stops.txt")}
    trip_info = {
        row["trip_id"]: {
            "profile": profile_by_route[row["route_id"]]["id"],
            "headsign": row.get("trip_headsign", "").strip(),
            "directionId": row.get("direction_id", ""),
        }
        for row in rows(archive, "trips.txt")
        if row["route_id"] in profile_by_route
    }
    platforms = {}
    for stop_time in rows(archive, "stop_times.txt"):
        trip = trip_info.get(stop_time["trip_id"])
        stop = stops.get(stop_time["stop_id"])
        if not trip or not stop or stop["stop_name"].casefold() not in canonical_names:
            continue
        node = platforms.setdefault(stop["stop_id"], {
            "id": f"{slug(stop['stop_name'])}-{slug(stop['stop_id'])}",
            "stationId": slug(stop["stop_name"]),
            "name": stop["stop_name"],
            "lat": round(float(stop["stop_lat"]), 6),
            "lon": round(float(stop["stop_lon"]), 6),
            "quayId": stop["stop_id"],
            "stopIds": [stop["stop_id"]],
            "routes": [],
            "routeDirections": {},
        })
        if trip["profile"] not in node["routes"]:
            node["routes"].append(trip["profile"])
        direction = node["routeDirections"].setdefault(trip["profile"], {
            "directionIds": [], "headsigns": [], "destinationMatches": []
        })
        if trip["directionId"] not in direction["directionIds"]:
            direction["directionIds"].append(trip["directionId"])
        if trip["headsign"] and trip["headsign"] not in direction["headsigns"]:
            direction["headsigns"].append(trip["headsign"])
        match = terminal_match(trip["headsign"])
        if match and match not in direction["destinationMatches"]:
            direction["destinationMatches"].append(match)

ordered = sorted(platforms.values(), key=lambda item: (
    item["name"].casefold(),
    json.dumps(item["routeDirections"], ensure_ascii=False, sort_keys=True),
    item["quayId"],
))
station_groups = defaultdict(list)
for node in ordered:
    station_groups[node["stationId"]].append(node)
for group in station_groups.values():
    for track, node in enumerate(group, start=1):
        node["track"] = track
        node["platformCount"] = len(group)
for led, node in enumerate(ordered):
    node["led"] = led

board = {
    "schemaVersion": 2,
    "id": "trondheim-bus-board",
    "name": "Trondheim buss",
    "layout": "station-network",
    "positioning": "vehicle-proximity",
    "directionalPlatforms": True,
    "routes": [profile["id"] for profile in profiles],
    "leds": {"count": len(ordered), "dataPin": None, "brightnessLimit": 32},
    "nodes": ordered,
    "render": {
        "collisionMode": "alternate",
        "routePriority": [],
        "arrivalRadiusMeters": 85,
        "approachRadiusMeters": 250,
        "freshnessSeconds": 120,
    },
    "status": "directional-logical-map-ready-hardware-order-pending",
}

OUT.write_text(json.dumps(board, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
multi = sum(1 for group in station_groups.values() if len(group) > 1)
print(f"Wrote {OUT.relative_to(ROOT)} with {len(ordered)} directional LEDs across {len(station_groups)} stops ({multi} multi-platform)")

