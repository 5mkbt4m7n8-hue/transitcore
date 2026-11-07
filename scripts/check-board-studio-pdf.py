"""Independent checks of downloaded production files using pypdf and XML/CSV readers.

Usage: python scripts/check-board-studio-pdf.py /path/to/production-downloads
All expected geometry comes from the saved document, not the JavaScript exporter.
"""
import csv
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from pypdf import PdfReader

if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/check-board-studio-pdf.py /path/to/production-downloads')
root = Path(sys.argv[1])
source = json.loads((root / 'source.json').read_text())
k = 72 / 25.4
margin = 15
overlap = 10
w, h = source['board']['width'], source['board']['height']
expected = {}
for station in source['layout']['stations']:
    for hole in station['holes']:
        key = (hole['x'], hole['y'], hole.get('diameter', station['holeDiameter']))
        expected[key] = key
for hole in source['production'].get('mountingHoles', []):
    key = (hole['x'], hole['y'], hole['diameter'])
    expected[key] = key
assert len(expected) >= 18
labels = {f"H{i+1:03d}": key for i, key in enumerate(expected)}


def near(a, b, tolerance=1e-5):
    assert abs(a - b) <= tolerance, (a, b)


def verify_pdf(name, side, tiled, landscape=False):
    reader = PdfReader(root / name, strict=True)
    assert reader.trailer['/Root']['/ViewerPreferences']['/PrintScaling'] == '/None'
    pw, ph = ((297, 210) if landscape else (210, 297)) if tiled else (w + 2*margin, h + 2*margin)
    uw, uh = pw - 2*margin, ph - 2*margin
    cols = max(1, 1 + math.ceil(max(0, w - uw) / (uw - overlap))) if tiled else 1
    rows = max(1, 1 + math.ceil(max(0, h - uh) / (uh - overlap))) if tiled else 1
    assert len(reader.pages) == cols * rows
    seen = set()
    for page_index, page in enumerate(reader.pages):
        near(float(page.mediabox.width), pw * k)
        near(float(page.mediabox.height), ph * k)
        assert float(page.get('/UserUnit', 1)) == 1
        assert int(page.get('/Rotate', 0)) == 0
        properties = page['/Resources']['/Properties']
        layer_names = {str(key): value.get_object()['/Name'] for key, value in properties.items()}
        assert 'Fysiske hull' in layer_names.values()
        assert 'Senterkryss' in layer_names.values()
        layer, move, curves, controls = None, None, [], []
        hole_clip = False
        text_matrix = None
        ox, oy = (page_index % cols) * (uw - overlap), (page_index // cols) * (uh - overlap)
        if not tiled:
            ox = oy = 0
        for operands, operator in page.get_contents().operations:
            values = list(operands)
            assert operator != b'cm', 'Unexpected page-coordinate transform'
            if operator == b'Tm':
                text_matrix = [float(v) for v in values]
            elif operator == b'Tj' and layer == 'Hullnummer':
                label = str(values[0])
                assert label in labels
                sx, sy, diameter = labels[label]
                side_x = w-sx if side == 'back' else sx
                near(text_matrix[4]/k, side_x+margin-ox+diameter/2+.6)
                near(ph-text_matrix[5]/k, sy+margin-oy-.6)
            elif operator == b're' and layer == 'Fysiske hull':
                for a,b in zip([float(v) for v in values], [margin*k, margin*k, uw*k, uh*k]):
                    near(a,b)
            elif operator == b'W' and layer == 'Fysiske hull':
                hole_clip = True
            elif operator == b'BDC':
                layer = layer_names[str(values[1])]
            elif operator == b'EMC':
                layer = None
            elif operator == b'm':
                move, curves = [float(v) for v in values], []
            elif operator == b'c':
                curves.append([float(v) for v in values])
            elif operator == b'l' and layer == 'Side og kontrollmål':
                end = [float(v) for v in values]
                controls.append((abs(end[0] - move[0]) / k, abs(end[1] - move[1]) / k))
            elif operator == b'S' and layer == 'Fysiske hull':
                assert move is not None and len(curves) == 4
                cx = (move[0] + curves[1][-2]) / 2 / k
                cy = ph - move[1] / k
                diameter = (move[0] - curves[1][-2]) / k
                board_x, board_y = cx - margin + ox, cy - margin + oy
                front_x = w - board_x if side == 'back' else board_x
                match = next((key for key in expected if abs(key[0] - front_x) < 1e-5 and abs(key[1] - board_y) < 1e-5 and abs(key[2] - diameter) < 1e-5), None)
                assert match is not None, (name, page_index, front_x, board_y, diameter)
                x, y, radius = cx*k, move[1], diameter*k/2
                c = radius*.5522847498307936
                expected_curves = [[x+radius,y-c,x+c,y-radius,x,y-radius], [x-c,y-radius,x-radius,y-c,x-radius,y], [x-radius,y+c,x-c,y+radius,x,y+radius], [x+c,y+radius,x+radius,y+c,x+radius,y]]
                for actual, target in zip(curves, expected_curves):
                    for a,b in zip(actual,target):
                        near(a,b)
                near(curves[-1][-2], move[0])
                near(curves[-1][-1], move[1])
                if margin - 1e-5 <= cx <= pw - margin + 1e-5 and margin - 1e-5 <= cy <= ph - margin + 1e-5:
                    seen.add(match)
                move, curves = None, []
        assert hole_clip
        assert any(abs(dx - 100) < 1e-5 and dy < 1e-5 for dx, dy in controls)
        assert any(abs(dy - 100) < 1e-5 and dx < 1e-5 for dx, dy in controls)
        text = page.extract_text()
        assert ('FORSIDE' if side == 'front' else 'BAKSIDE') in text
        assert '100 %' in text
    assert seen == set(expected), (name, set(expected) - seen)


for name, side, tiled, landscape in [('front-a4.pdf', 'front', True, False), ('back-a4.pdf', 'back', True, False), ('front-board.pdf', 'front', False, False), ('front-landscape.pdf', 'front', True, True)]:
    verify_pdf(name, side, tiled, landscape)

for name, side in [('front.svg', 'front'), ('back.svg', 'back')]:
    document = ET.fromstring((root / name).read_text())
    assert document.attrib['width'] == '330mm'
    assert document.attrib['height'] == '430mm'
    found = []
    for element in document.iter():
        if 'data-hole' not in element.attrib:
            continue
        x = float(element.attrib['cx']) - margin
        y = float(element.attrib['cy']) - margin
        diameter = 2 * float(element.attrib['r'])
        found.append((w - x if side == 'back' else x, y, diameter))
    assert len(found) == len(expected)
    for point in found:
        assert any(all(abs(a - b) < 1e-8 for a, b in zip(point, key)) for key in expected)

machine = ET.fromstring((root / 'back-machine.svg').read_text())
assert machine.attrib['width'] == '300mm'
assert machine.attrib['height'] == '400mm'
assert machine.attrib['data-origin'] == 'board-top-left'
assert not any(element.tag.endswith('text') or element.tag.endswith('path') for element in machine.iter())
circles = [element for element in machine.iter() if 'data-hole' in element.attrib]
assert len(circles) == len(expected)
for element in circles:
    point = (w-float(element.attrib['cx']), float(element.attrib['cy']), 2*float(element.attrib['r']))
    assert any(all(abs(a-b) < 1e-8 for a,b in zip(point, key)) for key in expected)

with (root / 'back.csv').open(encoding='utf-8-sig', newline='') as file:
    rows = list(csv.DictReader(file, delimiter=';'))
assert len(rows) == sum(len(s['holes']) for s in source['layout']['stations']) + len(source['production'].get('mountingHoles', []))
for row in rows:
    if row['Type'] == 'mounting':
        hole = next(h for h in source['production']['mountingHoles'] if h['id'] == row['Hull-ID'])
        assert row['Navn'] == hole['name']
        assert not any(row[key] for key in ['Stasjons-ID','Punkt','Segment-ID','LED-ID','LED-indeks','Kontroller','Kjede'])
        for field, value in [('Forside_X_mm',hole['x']),('Forside_Y_mm',hole['y']),('X_mm',w-hole['x']),('Y_mm',hole['y']),('Diameter_mm',hole['diameter'])]:
            near(float(row[field]),value)
        assert labels[row['Hullnr']] == (hole['x'],hole['y'],hole['diameter'])
        continue
    station = next(s for s in source['layout']['stations'] if s['id'] == row['Stasjons-ID'])
    point_index = int(row['Punkt'])-1
    hole = station['holes'][point_index]
    assert row['Navn'] == station['name']
    assert row['Hull-ID'] == hole['id']
    near(float(row['Forside_X_mm']),hole['x'])
    near(float(row['Forside_Y_mm']),hole['y'])
    near(float(row['Diameter_mm']),hole.get('diameter',station['holeDiameter']))
    sx,sy,diameter = labels[row['Hullnr']]
    near(sx,hole['x'])
    near(sy,hole['y'])
    binding=next(b for b in source['ledLayout']['bindings'] if b['stationId']==station['id'] and b['pointIndex']==point_index)
    assert row['Segment-ID']==binding['segmentId'] and row['LED-ID']==binding['ledId']
    segment=next(s for s in source['ledLayout']['segments'] if s['id']==binding['segmentId'])
    slot=int(binding['ledId'].rsplit(':led:',1)[1])
    assert int(row['LED-indeks'])==segment['startIndex']+(slot if segment['direction']==1 else segment['count']-1-slot)
    assert row['Kontroller']==segment['controllerId'] and row['Kjede']==segment['chainId']
    near(float(row['X_mm']), w - float(row['Forside_X_mm']))
    near(float(row['Y_mm']), float(row['Forside_Y_mm']))
    assert row['Stasjons-ID'] and row['Hull-ID'] and row['LED-ID'] and row['Segment-ID']
print(f'Independent pypdf/XML/CSV PASS: 15 real PDF pages, exact MediaBox sizes, {len(expected)} source hole centres/diameters, mirrored back and A4 offsets/coverage, physical layers, X/Y 100 mm controls, side labels, SVG and identity-preserving CSV')
