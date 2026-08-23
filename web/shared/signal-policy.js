(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TransitCoreSignals = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const version = 1;

  const settings = Object.freeze({
    approachWindowSeconds: 30,
    atStopThresholdSeconds: 0,
    approachPulseSeconds: 1.8,
    reducedMotionPulseSeconds: 3.2,
    departureAfterglowSeconds: 10,
    collisionCycleSeconds: 1.2,
    fullBrightness: 32,
    afterglowBrightness: 8
  });

  const priorities = Object.freeze({OFF: 0, PASSED: 1, APPROACHING: 2, AT_STOP: 3});
  const aliases = Object.freeze({"": "OFF", OFF: "OFF", PASSED: "PASSED", AFTERGLOW: "PASSED", APPROACHING: "APPROACHING", AT_STOP: "AT_STOP", "AT-STOP": "AT_STOP"});

  function normalize(state) {
    return aliases[String(state || "").trim().toUpperCase()] || "OFF";
  }

  function priority(state) {
    return priorities[normalize(state)];
  }

  function highestState(items, stateOf = item => item.state) {
    return (items || []).reduce((best, item) => priority(stateOf(item)) > priority(best) ? normalize(stateOf(item)) : best, "OFF");
  }

  function resolveEta(etaSeconds) {
    const eta = Number(etaSeconds);
    if (!Number.isFinite(eta) || eta > settings.approachWindowSeconds) return "OFF";
    return eta <= settings.atStopThresholdSeconds ? "AT_STOP" : "APPROACHING";
  }

  function applyCssVariables(documentRef) {
    const style = documentRef?.documentElement?.style;
    if (!style) return;
    style.setProperty("--tc-approach-pulse", `${settings.approachPulseSeconds}s`);
    style.setProperty("--tc-reduced-motion-pulse", `${settings.reducedMotionPulseSeconds}s`);
    style.setProperty("--tc-afterglow-duration", `${settings.departureAfterglowSeconds}s`);
  }

  return Object.freeze({version, settings, priorities, normalize, priority, highestState, resolveEta, applyCssVariables});
});
