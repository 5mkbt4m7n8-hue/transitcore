(function(root) {
  'use strict';
  function selectItems(frame, visibleIds, selectedLine, allRoutes) {
    return (frame.leds || []).filter(item => visibleIds.has(String(item.id))).flatMap(item => {
      const source = item.occupants?.length ? item.occupants : [{ ...item.vehicle, state: item.lifecycle || item.state, rgb: item.rgb }];
      const occupants = source.filter(value => allRoutes || String(value.line) === String(selectedLine)).map(value => ({ ...value,
        state: item.lifecycle === 'PASSED' ? 'PASSED' : item.lifecycle === 'PARKED' ? 'PARKED' : value.state || item.state }));
      if (!occupants.length) return [];
      // Re-evaluate priority after filtering, so another route cannot hide the selected one.
      const effective = occupants.reduce((best, value) => root.TransitCoreSignals.priority(value.state) > root.TransitCoreSignals.priority(best.state) ? value : best);
      return [{ ...item, state: effective.state, lifecycle: effective.state === 'PASSED' ? 'PASSED' : undefined,
        vehicle: effective, rgb: effective.rgb || item.rgb, occupants }];
    });
  }
  root.TransitCoreOccupancy = { selectItems };
})(globalThis);

