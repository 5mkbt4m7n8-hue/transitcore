import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "config" / "routes"
OUT = ROOT / "config" / "boards" / "trondheim-bus-board.json"
PROFILE_FILES = ["atb-bus-1-live.json", "atb-bus-3-live.json"]


def slug(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


profiles = [json.loads((ROUTES / name).read_text(encoding="utf-8")) for name in PROFILE_FILES]
nodes = {}
for profile in profiles:
    for stop in profile["stops"]:
        key = stop["name"].casefold()
        node = nodes.setdefault(key, {
            "id": slug(stop["name"]),
            "name": stop["name"],
            "lat": stop["lat"],
            "lon": stop["lon"],
            "stopIds": [],
            "routes": [],
        })
        if stop["id"] not in node["stopIds"]:
            node["stopIds"].append(stop["id"])
        if profile["id"] not in node["routes"]:
            node["routes"].append(profile["id"])

ordered = sorted(nodes.values(), key=lambda item: item["name"].casefold())
for led, node in enumerate(ordered):
    node["led"] = led

board = {
    "schemaVersion": 1,
    "id": "trondheim-bus-board",
    "name": "Trondheim buss",
    "layout": "station-network",
    "positioning": "vehicle-proximity",
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
    "status": "logical-map-ready-hardware-order-pending",
}

OUT.write_text(json.dumps(board, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"Wrote {OUT.relative_to(ROOT)} with {len(ordered)} shared stop LEDs")

