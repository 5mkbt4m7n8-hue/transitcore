// Generic logical -> physical mapping. No provider or GPS interpretation.
export function mapLedStates({hardware}, interpreted) {
  const physical = new Map(hardware.assignments.map(item => [item.logicalLed, item.physicalLed]));
  const mapCandidate = item => {
    const id = physical.get(item.id);
    if (id === undefined) throw new Error("Unmapped logical LED " + item.id);
    const mapped = {...item, id};
    if (item.nearestStationLed != null) mapped.nearestStationLed = physical.get(item.nearestStationLed);
    return mapped;
  };
  return {...interpreted,
    strongest: new Map([...interpreted.strongest].map(([id,item]) => [physical.get(id),mapCandidate(item)])),
    occupantsByLed: new Map([...interpreted.occupantsByLed].map(([id,items]) =>
      [physical.get(id),items.map(mapCandidate)]))
  };
}
