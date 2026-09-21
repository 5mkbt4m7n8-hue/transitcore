#!/usr/bin/env python3
"""Generate the Trondheim airport-bus FB73 profile from Entur's national GTFS."""

import csv
import io
import json
import math
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "config" / "routes" / "flybuss-trondheim-fb73-live.json"
ROUTE_ID = "UNI:Line:FB73"


def rows(archive, name):
    with archive.open(name) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")))


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


if len(sys.argv) != 2:
    raise SystemExit("Usage: generate-flybussen-trondheim-profile.py path/to/rb_norway-aggregated-gtfs.zip")

source = Path(sys.argv[1])
with zipfile.ZipFile(source) as archive:
    routes = {row["route_id"]: row for row in rows(archive, "routes.txt")}
    trips = {row["trip_id"]: row for row in rows(archive, "trips.txt") if row["route_id"] == ROUTE_ID}
    stops = {row["stop_id"]: row for row in rows(archive, "stops.txt")}
    sequences = defaultdict(list)
    for item in rows(archive, "stop_times.txt"):
        if item["trip_id"] in trips:
            sequences[item["trip_id"]].append((int(item["stop_sequence"]), item["stop_id"]))

if not trips:
    raise SystemExit(f"Route {ROUTE_ID} was not found")

by_direction = defaultdict(Counter)
for trip_id, sequence in sequences.items():
    direction = trips[trip_id].get("direction_id", "")
    by_direction[direction][tuple(stop_id for _, stop_id in sorted(sequence))] += 1

# Direction 0 runs from Trondheim to the airport and contains the full city branch.
outbound = list(by_direction["0"].most_common(1)[0][0])
canonical = list(reversed(outbound))
distance_meters = 0.0
profile_stops = []
shape = []
for stop_id in canonical:
    stop = stops[stop_id]
    point = {"lat": round(float(stop["stop_lat"]), 6), "lon": round(float(stop["stop_lon"]), 6)}
    if shape:
        distance_meters += distance(shape[-1], point)
    shape.append(point)
    profile_stops.append({
        "id": stop_id,
        "name": stop["stop_name"],
        **point,
        "shapeDistanceMeters": round(distance_meters),
    })

route = routes[ROUTE_ID]
profile = {
    "schemaVersion": 1,
    "id": "flybuss-trondheim-fb73-live",
    "name": "Værnesekspressen FB73",
    "provider": {
        "codespaceId": "UNI",
        "vehicleEndpoint": "https://api.entur.io/realtime/v2/vehicles/graphql",
    },
    "positioning": {
        "strategy": "estimated-station-calls",
        "endpoint": "https://api.entur.io/journey-planner/v3/graphql",
        "pollIntervalMs": 30000,
        "lookBehindSeconds": 75,
        "lookAheadSeconds": 600,
        "stationWindowSeconds": 45,
    },
    "line": {
        "id": ROUTE_ID,
        "publicCode": "FB73",
        "mode": "bus",
        "longName": route["route_long_name"],
        "color": "#f4a024",
    },
    "directions": [
        {
            "id": "airport",
            "label": "mot Værnes",
            "destinationMatches": ["Flybuss Værnes", "Trondheim lufthavn", "Værnes"],
            "color": "#f4a024",
            "reverseShape": True,
        },
        {
            "id": "city",
            "label": "mot Trondheim/Nidarvoll",
            "destinationMatches": ["Flybuss Ekspress Trondheim", "Nidarvoll skole", "Trondheim"],
            "color": "#42a5f5",
            "reverseShape": False,
        },
    ],
    "stops": profile_stops,
    "shape": shape,
    "display": {"layout": "route-live"},
    "serviceVariants": {
        "canonical": "Trondheim lufthavn - Trondheim sentrum - Moholt - Nidarvoll",
        "supportedShortTurns": ["Trondheim lufthavn - Hesthagen"],
    },
    "source": {
        "format": "GTFS",
        "dataset": "Entur Norway aggregated",
        "url": "https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip",
        "routeId": ROUTE_ID,
    },
}

OUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"Wrote {OUT.relative_to(ROOT)} with {len(profile_stops)} stops")
