/**
 * FrameContext keeps vehicle positions and selected estimated-call candidates
 * separate. No IO, cache, cloning or time inference is performed here.
 * board/profiles/hardware are existing compatible BoardConfig components.
 * @typedef {Object} FrameContext
 * @property {Object} board Compatible BoardConfig (legacy field names retained).
 * @property {Object[]} profiles Route geometry, colors and direction configuration.
 * @property {Object} hardware Logical/physical assignments and brightness limit.
 * @property {import('../models/transit-vehicle.mjs').TransitVehicle[]} vehicles GPS observations.
 * @property {EstimatedCallCandidate[]} estimatedCalls Selected forecasts, never GPS.
 * @property {number} now Epoch milliseconds fixed by the request.
 * @property {Object} signalPolicy Existing Worker policy, injected unchanged.
 * @property {number} [atStopConfirmationSeconds] Legacy strategy default.
 * @property {Object} [providerMetadata] Reserved context; not emitted.
 * @property {Object} [freshnessMetadata] Reserved context; does not override TTL.
 *
 * @typedef {Object} EstimatedCallCandidate
 * @property {number} id Already resolved physical LED (legacy arrival interpreter).
 * @property {Object} profile Route configuration, not a raw provider record.
 * @property {string} destination
 * @property {string} vehicleId Journey identity, not proof of a GPS vehicle.
 * @property {'AT_STOP'|'APPROACHING'} state Forecast-based display state.
 * @property {number} deltaSeconds Forecast time relative to now.
 */
export function createFrameContext({board, profiles = [], hardware, vehicles = [],
  estimatedCalls = [], now = Date.now(), signalPolicy, atStopConfirmationSeconds,
  providerMetadata, freshnessMetadata}) {
  return {board, profiles, hardware, vehicles, estimatedCalls, now, signalPolicy,
    atStopConfirmationSeconds, providerMetadata, freshnessMetadata};
}

export class FramePipelineError extends Error {
  constructor(stage, cause) {
    super(cause.message, {cause});
    this.name = "FramePipelineError";
    this.stage = stage;
    this.code = cause.code || "FRAME_" + stage.toUpperCase();
  }
}
export function frameStage(stage, operation) {
  try { return operation(); }
  catch (error) {
    if (error instanceof FramePipelineError) throw error;
    throw new FramePipelineError(stage, error);
  }
}
