"""Read-only, bounded SIRI VM/ET identity audit. Standard library only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import xml.etree.ElementTree as XML
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENDPOINTS = {k: f'https://api.entur.io/realtime/v1/rest/{k}?datasetId=ATB&maxSize=10000' for k in ('vm', 'et')}
SITES = {'1': {'Tonstadkrysset': ['NSR:Quay:102733'], 'Lerkendal': ['NSR:Quay:73729', 'NSR:Quay:102720']},
         '11': {'Lerkendal': ['NSR:Quay:73420', 'NSR:Quay:73421']}}


def stamp(value):
    try:
        if not re.search(r'(Z|[+-]\d\d:\d\d)$', value or ''):
            return None
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def one(node, name):
    values = node.findall('./' + name)
    return (values[0].text or '').strip() if len(values) == 1 else None


def parse(raw, kind):
    if len(raw) > 30_000_000 or re.search(br'<!\s*(DOCTYPE|ENTITY)', raw, re.I):
        raise ValueError('unsafe-or-oversize-xml')
    root = XML.fromstring(raw)
    for el in root.iter():
        el.tag = el.tag.split('}')[-1]
    deliveries = root.findall('.//' + ('VehicleMonitoringDelivery' if kind == 'vm' else 'EstimatedTimetableDelivery'))
    if not deliveries or any(one(d, 'Status') == 'false' for d in deliveries):
        raise ValueError('missing-or-failed-delivery')
    partial = any((el.text or '').strip().lower() == 'true' for el in root.iter('MoreData'))
    records = []
    for el in root.iter('VehicleActivity' if kind == 'vm' else 'EstimatedVehicleJourney'):
        journey = el.find('./MonitoredVehicleJourney') if kind == 'vm' else el
        if journey is None:
            continue
        frame = journey.find('./FramedVehicleJourneyRef')
        records.append(dict(line=one(journey, 'LineRef'),
                            trip=one(frame, 'DatedVehicleJourneyRef') if frame is not None else one(journey, 'DatedVehicleJourneyRef'),
                            day=one(frame, 'DataFrameRef') if frame is not None else one(journey, 'OperatingDayRef'),
                            recordedAt=one(el, 'RecordedAtTime'), direction=one(journey, 'DirectionRef'),
                            cancelled=one(journey, 'Cancellation') == 'true',
                            complete=one(journey, 'IsCompleteStopSequence') == 'true',
                            calls=[dict(quay=one(c, 'StopPointRef'), order=one(c, 'Order'),
                                        aimed=one(c, 'AimedDepartureTime') or one(c, 'AimedArrivalTime'))
                                   for c in journey.iter() if c.tag in ('RecordedCall', 'EstimatedCall')]))
    return records, partial


def classify(vm, ets, patterns, now):
    result = {k: vm.get(k) for k in ('line', 'trip', 'day', 'recordedAt')}
    result.update(status='INSUFFICIENT_EVIDENCE', reason='missing-exact-dated-ET-match', etRecordedAt=None,
                  sourceIds={'vmTrip': vm.get('trip'), 'etTrip': None}, orderedCalls=[], sites={},
                  gpsV217Comparison='INSUFFICIENT_EVIDENCE', physicalStopConfirmed=False)
    def finish(reason, status='INSUFFICIENT_EVIDENCE'):
        result.update(reason=reason, status=status)
        return result
    at = stamp(vm.get('recordedAt'))
    if at is None or not -5 <= now - at <= 60:
        return finish('stale-or-invalid-VM-time')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', vm.get('day') or '') or not vm.get('trip'):
        return finish('missing-explicit-operating-day-or-trip')
    matches = [e for e in ets if e['trip'] == vm['trip'] and e['day'] == vm['day']]
    # Identical duplicate records are harmless; disagreeing versions are not guessed away.
    matches = list({json.dumps(e, sort_keys=True): e for e in matches}.values())
    if len(matches) != 1:
        return finish('ambiguous-ET-match' if matches else 'missing-exact-dated-ET-match')
    et = matches[0]
    result.update(etRecordedAt=et['recordedAt'], sourceIds={'vmTrip': vm['trip'], 'etTrip': et['trip']}, orderedCalls=et['calls'])
    at = stamp(et['recordedAt'])
    if at is None or not -5 <= now - at <= 300:
        return finish('stale-or-invalid-ET-time')
    if et['line'] != vm['line']:
        return finish('exact-trip-line-conflict', 'CONFLICT')
    if et['cancelled']:
        return finish('ET-cancelled-trip', 'CONFLICT')
    if vm.get('direction') and et.get('direction') and vm['direction'] != et['direction']:
        return finish('VM-ET-direction-conflict', 'CONFLICT')
    calls = et['calls']
    if not et['complete'] or len(calls) < 3:
        return finish('incomplete-stop-sequence')
    orders = [int(c['order']) if re.fullmatch(r'[1-9]\d*', c.get('order') or '') else None for c in calls]
    if None in orders or orders != sorted(set(orders)):
        return finish('missing-duplicate-or-unordered-call-order')
    if any(not re.fullmatch(r'NSR:Quay:\d+', c.get('quay') or '') for c in calls):
        return finish('unsupported-stop-reference')
    times = [stamp(c.get('aimed')) for c in calls]
    if None in times or times != sorted(times):
        return finish('missing-or-unordered-aimed-times')
    if not times[0] - 3600 <= now <= times[-1] + 3600:
        return finish('departure-outside-observation-window')
    quays = [c['quay'] for c in calls]
    # Full ET sequence must match the frozen V2.17 reference, never reverse it.
    candidates = [p for p in patterns if p['quays'] == quays]
    if not candidates:
        return finish('ET-sequence-differs-from-V217-reference', 'CONFLICT')
    directions = {p['directionType'] for p in candidates}
    if len(directions) != 1:
        return finish('ambiguous-reference-direction')
    result.update(patternIds=[p['id'] for p in candidates], direction=next(iter(directions)))
    code = vm['line'].removeprefix('ATB:Line:2_')
    for site, ids in SITES[code].items():
        contexts = [quays[i-1:i+2] for i, q in enumerate(quays) if q in ids and 0 < i < len(quays)-1]
        result['sites'][site] = {'status': 'CONFIRMED' if contexts else 'INSUFFICIENT_EVIDENCE', 'orderedNeighbours': contexts}
    return finish('exact-dated-trip-and-ordered-source-sequence', 'CONFIRMED')


def audit(raws, catalogue, now):
    sources, parsed, errors = {}, {}, []
    for kind in ('vm', 'et'):
        sources[kind] = {'url': ENDPOINTS[kind], 'sha256': hashlib.sha256(raws[kind]).hexdigest()}
        try:
            parsed[kind], partial = parse(raws[kind], kind)
            if partial:
                errors.append(kind + ':MoreData=true')
        except (ValueError, XML.ParseError) as e:
            parsed[kind] = []
            errors.append(kind + ':' + str(e))
    rows = []
    for code in ('1', '11'):
        vehicles = [v for v in parsed['vm'] if v['line'] == 'ATB:Line:2_' + code]
        for vm in vehicles:
            row = classify(vm, parsed['et'], catalogue['lines'][code]['patterns'], now)
            if errors:
                row.update(status='INSUFFICIENT_EVIDENCE', reason='incomplete-source-snapshot')
            rows.append(row)
        if not vehicles:
            rows.append(dict(line='ATB:Line:2_' + code, status='INSUFFICIENT_EVIDENCE', reason='no-pilot-VM-observations', sites={}))
    coverage = []
    for code, sites in SITES.items():
        for site in sites:
            statuses = [r.get('sites', {}).get(site, {}).get('status') for r in rows if r['line'] == 'ATB:Line:2_' + code and r['status'] == 'CONFIRMED']
            coverage.append(dict(line=code, site=site, status='CONFIRMED' if 'CONFIRMED' in statuses else 'INSUFFICIENT_EVIDENCE'))
    return dict(schemaVersion=1, observedAt=datetime.fromtimestamp(now, timezone.utc).isoformat(),
                baseline='GPS V2.17 / diagnosticRevision 217', sources=sources, errors=errors, rows=rows, coverage=coverage,
                scope='Source identity and planned sequence only; no individual production GPS lock join or physical validation.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='work/siri-trip-audit.json')
    parser.add_argument('--vm-file')
    parser.add_argument('--et-file')
    args = parser.parse_args()
    raws, failures = {}, []
    for kind in ('vm', 'et'):
        file = getattr(args, kind + '_file')
        try:
            if file:
                raws[kind] = Path(file).read_bytes()
            else:
                req = Request(ENDPOINTS[kind], headers={'Accept': 'application/xml', 'ET-Client-Name': 'intransit-v217-trip-audit'})
                with urlopen(req, timeout=30) as response:
                    raws[kind] = response.read(30_000_001)
        except Exception as e:
            raws[kind] = b''
            failures.append(kind + ':' + type(e).__name__)
    catalogue = json.loads((ROOT / 'config/gps/atb-journey-patterns-1-11.json').read_text())
    report = audit(raws, catalogue, datetime.now(timezone.utc).timestamp())
    report['errors'].extend(failures)
    report['reference'] = {'path': 'config/gps/atb-journey-patterns-1-11.json', 'observedAt': catalogue['observedAt']}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2), encoding='utf-8')
    summary = '## SIRI VM/ET — GPS V2.17 source audit\n\n' + report['observedAt'] + '\n\n'
    summary += '\n'.join('- ' + c['line'] + ' / ' + c['site'] + ': ' + c['status'] for c in report['coverage'])
    summary += '\n\n' + report['scope'] + '\n\nErrors: ' + json.dumps(report['errors']) + '\n'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(summary)


if __name__ == '__main__':
    main()
