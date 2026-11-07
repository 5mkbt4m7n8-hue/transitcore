import copy
import unittest
from audit_siri_trip import audit, classify, parse, stamp

NOW = stamp('2026-11-02T12:00:00Z')
VM = dict(line='ATB:Line:2_1', trip='ATB:ServiceJourney:exact', day='2026-11-02', recordedAt='2026-11-02T11:59:50Z', direction='inbound')
QUAYS = ['NSR:Quay:71518', 'NSR:Quay:102733', 'NSR:Quay:103404']
PATTERNS = [dict(id='ATB:JourneyPattern:in', directionType='inbound', quays=QUAYS)]
ET = dict(**VM, cancelled=False, complete=True, calls=[dict(quay=q, order=str(i+1), aimed=f'2026-11-02T12:0{i}:00Z') for i, q in enumerate(QUAYS)])


class AuditTests(unittest.TestCase):
    def check(self, expected, reason=None, vm=None, et=None, patterns=None):
        result = classify(vm or VM, [et or ET], patterns or PATTERNS, NOW)
        self.assertEqual(result['status'], expected)
        if reason:
            self.assertEqual(result['reason'], reason)
        return result

    def test_exact_trip_and_neighbours(self):
        r = self.check('CONFIRMED')
        self.assertEqual(r['sites']['Tonstadkrysset']['orderedNeighbours'], [QUAYS])
        self.assertEqual(r['sourceIds']['vmTrip'], r['sourceIds']['etTrip'])
        self.assertFalse(r['physicalStopConfirmed'])
        self.assertEqual(r['gpsV217Comparison'], 'INSUFFICIENT_EVIDENCE')

    def test_wrong_trip_or_day_never_fuzzy_matches(self):
        for key, value in [('trip', 'ATB:ServiceJourney:other'), ('day', '2026-11-01'), ('day', None)]:
            with self.subTest(key=key, value=value):
                self.check('INSUFFICIENT_EVIDENCE', vm={**VM, key: value})

    def test_stale_future_missing_time(self):
        for t in ['2026-11-02T11:00:00Z', '2026-11-02T12:01:00Z', '2026-11-02T12:00:00', None]:
            self.check('INSUFFICIENT_EVIDENCE', vm={**VM, 'recordedAt': t})
            self.check('INSUFFICIENT_EVIDENCE', et={**ET, 'recordedAt': t})

    def test_explicit_conflicts(self):
        for patch in [dict(line='ATB:Line:2_11'), dict(cancelled=True), dict(direction='outbound')]:
            self.check('CONFLICT', et={**ET, **patch})
        e = copy.deepcopy(ET)
        for c, q in zip(e['calls'], reversed(QUAYS)):
            c['quay'] = q
        self.check('CONFLICT', et=e)

    def test_partial_unordered_duplicate_and_unknown_stops(self):
        self.check('INSUFFICIENT_EVIDENCE', et={**ET, 'complete': False})
        for key, value in [('order', '1'), ('order', None), ('quay', 'NSR:StopPlace:1'), ('aimed', None), ('aimed', '2026-11-01T12:00:00Z')]:
            e = copy.deepcopy(ET)
            e['calls'][1][key] = value
            self.check('INSUFFICIENT_EVIDENCE', et=e)

    def test_multiple_versions_and_duplicates(self):
        self.assertEqual(classify(VM, [ET, ET], PATTERNS, NOW)['status'], 'CONFIRMED')
        self.assertEqual(classify(VM, [ET, {**ET, 'cancelled': True}], PATTERNS, NOW)['status'], 'INSUFFICIENT_EVIDENCE')

    def test_shared_quay_needs_order(self):
        p = PATTERNS + [dict(id='other', directionType='outbound', quays=list(reversed(QUAYS)))]
        self.assertEqual(self.check('CONFIRMED', patterns=p)['direction'], 'inbound')
        self.check('INSUFFICIENT_EVIDENCE', patterns=PATTERNS + [{**PATTERNS[0], 'directionType': 'outbound'}])

    def test_line_11_lerkendal(self):
        for q in ['NSR:Quay:73420', 'NSR:Quay:73421']:
            quays = ['NSR:Quay:1', q, 'NSR:Quay:2']
            e = copy.deepcopy(ET)
            e['line'] = 'ATB:Line:2_11'
            for c, quay in zip(e['calls'], quays):
                c['quay'] = quay
            r = self.check('CONFIRMED', vm={**VM, 'line': e['line']}, et=e, patterns=[{**PATTERNS[0], 'quays': quays}])
            self.assertEqual(r['sites']['Lerkendal']['status'], 'CONFIRMED')

    def test_xml_namespaces_entities_and_fail_closed(self):
        xml = b'<Siri xmlns="http://www.siri.org.uk/siri"><ServiceDelivery><VehicleMonitoringDelivery><VehicleActivity><RecordedAtTime>2026-11-02T11:59:50Z</RecordedAtTime><MonitoredVehicleJourney><LineRef>ATB:Line:2_1</LineRef><FramedVehicleJourneyRef><DataFrameRef>2026-11-02</DataFrameRef><DatedVehicleJourneyRef>A&amp;B</DatedVehicleJourneyRef></FramedVehicleJourneyRef></MonitoredVehicleJourney></VehicleActivity></VehicleMonitoringDelivery></ServiceDelivery></Siri>'
        records, partial = parse(xml, 'vm')
        self.assertEqual(records[0]['trip'], 'A&B')
        self.assertFalse(partial)
        for bad in [b'<!DOCTYPE x><x/>', b'<x/>', b'<Siri><VehicleMonitoringDelivery><Status>false</Status></VehicleMonitoringDelivery></Siri>']:
            with self.assertRaises(ValueError):
                parse(bad, 'vm')

    def test_no_data_is_not_zero_buses_or_success(self):
        report = audit({'vm': b'', 'et': b''}, {'lines': {'1': {'patterns': []}, '11': {'patterns': []}}}, NOW)
        self.assertEqual(len(report['errors']), 2)
        self.assertTrue(all(r['status'] == 'INSUFFICIENT_EVIDENCE' for r in report['rows']))
        self.assertTrue(all(c['status'] == 'INSUFFICIENT_EVIDENCE' for c in report['coverage']))

    def test_et_xml_and_partial_snapshot(self):
        calls = ''.join('<EstimatedCall><StopPointRef>' + c['quay'] + '</StopPointRef><Order>' + c['order'] + '</Order><AimedDepartureTime>' + c['aimed'] + '</AimedDepartureTime></EstimatedCall>' for c in ET['calls'])
        body = '<RecordedAtTime>' + VM['recordedAt'] + '</RecordedAtTime><LineRef>' + VM['line'] + '</LineRef><FramedVehicleJourneyRef><DataFrameRef>' + VM['day'] + '</DataFrameRef><DatedVehicleJourneyRef>' + VM['trip'] + '</DatedVehicleJourneyRef></FramedVehicleJourneyRef><IsCompleteStopSequence>true</IsCompleteStopSequence><EstimatedCalls>' + calls + '</EstimatedCalls>'
        xml = ('<Siri><EstimatedTimetableDelivery><EstimatedJourneyVersionFrame><EstimatedVehicleJourney>' + body + '</EstimatedVehicleJourney></EstimatedJourneyVersionFrame></EstimatedTimetableDelivery><MoreData>true</MoreData></Siri>').encode()
        records, partial = parse(xml, 'et')
        self.assertTrue(partial)
        self.assertEqual(classify(VM, records, PATTERNS, NOW)['status'], 'CONFIRMED')
        vm_xml = ('<Siri><VehicleMonitoringDelivery><VehicleActivity><RecordedAtTime>' + VM['recordedAt'] + '</RecordedAtTime><MonitoredVehicleJourney>' + body + '</MonitoredVehicleJourney></VehicleActivity></VehicleMonitoringDelivery></Siri>').encode()
        cat = {'lines': {'1': {'patterns': PATTERNS}, '11': {'patterns': []}}}
        report = audit({'vm': vm_xml, 'et': xml}, cat, NOW)
        self.assertTrue(all(r['status'] == 'INSUFFICIENT_EVIDENCE' for r in report['rows']))
        self.assertTrue(all(c['status'] == 'INSUFFICIENT_EVIDENCE' for c in report['coverage']))


if __name__ == '__main__':
    unittest.main()
