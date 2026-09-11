#!/usr/bin/env python3
"""Build a non-published Trondheim city-line catalog with shared stop identities."""

import csv
import io
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES_DIR = ROOT / "config" / "routes"
OUT = ROOT / "config" / "boards" / "trondheim-city-lines-catalog.json"


def rows(archive, name):
    with archive.open(name) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")))


def terminal(headsign):
    return re.split(r"\s+via\s+", headsign, maxsplit=1, flags=re.IGNORECASE)[0].strip()


if len(sys.argv) != 2:
    raise SystemExit("Usage: generate-trondheim-city-catalog.py path/to/atb.zip")

registry = json.loads((ROUTES_DIR / "routes.json").read_text(encoding="utf-8"))
profile_files = [
    item["profile"] for item in registry["routes"]
    if item.get("enabled") and re.fullmatch(r"atb-bus-\d+-live\.json", item.get("profile", ""))
]
profiles = [json.loads((ROUTES_DIR / name).read_text(encoding="utf-8")) for name in profile_files]
profiles.sort(key=lambda profile: int(profile["line"]["publicCode"]))
profile_by_gtfs_route = {profile["line"]["id"]: profile for profile in profiles}

with zipfile.ZipFile(sys.argv[1]) as archive:
    stops = {row["stop_id"]: row for row in rows(archive, "stops.txt")}
    trip_info = {
        row["trip_id"]: {
            "profile": profile_by_gtfs_route[row["route_id"]]["id"],
            "headsign": row.get("trip_headsign", "").strip(),
            "directionId": row.get("direction_id", ""),
        }
        for row in rows(archive, "trips.txt")
        if row["route_id"] in profile_by_gtfs_route
    }
    quays = {}
    for stop_time in rows(archive, "stop_times.txt"):
        trip = trip_info.get(stop_time["trip_id"])
        stop = stops.get(stop_time["stop_id"])
        if not trip or not stop:
            continue
        parent_id = stop.get("parent_station") or stop["stop_id"]
        parent = stops.get(parent_id, stop)
        node = quays.setdefault(stop["stop_id"], {
            "id": stop["stop_id"],
            "stationId": parent_id,
            "name": parent.get("stop_name") or stop["stop_name"],
            "quayName": stop["stop_name"],
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
        destination = terminal(trip["headsign"])
        if destination and destination not in direction["destinationMatches"]:
            direction["destinationMatches"].append(destination)

nodes = sorted(quays.values(), key=lambda node: (node["name"].casefold(), node["quayId"]))
station_groups = defaultdict(list)
for node in nodes:
    node["routes"].sort(key=lambda value: int(value.split("-")[2]))
    station_groups[node["stationId"]].append(node)
for group in station_groups.values():
    for track, node in enumerate(group, start=1):
        node["track"] = track
        node["platformCount"] = len(group)
for led, node in enumerate(nodes):
    node["led"] = led

catalog = {
    "schemaVersion": 2,
    "id": "trondheim-city-lines-catalog",
    "name": "Trondheim · alle bylinjer",
    "layout": "station-network",
    "positioning": "vehicle-proximity",
    "generatedForEditor": True,
    "directionalPlatforms": True,
    "routes": [profile["id"] for profile in profiles],
    "leds": {"count": len(nodes), "dataPin": None, "brightnessLimit": 32},
    "nodes": nodes,
    "render": {"collisionMode": "alternate", "routePriority": [], "arrivalRadiusMeters": 85, "approachRadiusMeters": 250, "freshnessSeconds": 120},
    "status": "catalog-only-select-lines-before-publishing",
}
OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
shared = sum(1 for group in station_groups.values() if len({route for node in group for route in node["routes"]}) > 1)
print(f"Wrote {OUT.relative_to(ROOT)}: {len(profiles)} lines, {len(station_groups)} stops, {len(nodes)} quays, {shared} shared stops")
