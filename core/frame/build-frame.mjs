import {createFrameContext, frameStage} from "./frame-context.mjs";
import {validateConfiguration} from "./mapping-support.mjs";
import {mapLedStates} from "./led-mapper.mjs";
import {interpretStationVehicles, interpretLinearVehicles} from "../engines/position-interpretation.mjs";
import {renderStationFrame, renderLinearFrame, renderArrivalFrame} from "./frame-renderer.mjs";
import {assertPixelFrame} from "./frame-validator.mjs";

/** Provider-neutral pipeline. Caller owns transport, cache and motion history. */
export function buildPixelFrame(input, {strategy = input.board.layout, validate = false} = {}) {
  const context = createFrameContext(input);
  let frame;
  if (strategy === "estimated-calls") {
    // Calls already selected/mapped by the legacy arrival interpreter.
    frame = frameStage("render", () => renderArrivalFrame(context));
  } else {
    frameStage("config", () => validateConfiguration(context.board, context.profiles, context.hardware));
    // Only malformed legacy observations carry this explicit compatibility view.
    // Neither mapping nor rendering reads raw/provider-shaped data.
    const vehicles = context.vehicles.map(v => v.frameCompatibility || v);
    const mappingContext = {...context, vehicles};
    const linear = strategy === "linear-route-vled";
    const interpreted = frameStage("interpretation", () =>
      (linear ? interpretLinearVehicles : interpretStationVehicles)(mappingContext));
    const mapped = frameStage("mapping", () => mapLedStates(context, interpreted));
    frame = frameStage("render", () =>
      (linear ? renderLinearFrame : renderStationFrame)(context, mapped));
  }
  if (validate) frameStage("validation", () => assertPixelFrame(frame, {
    expectedBoardProfile: context.board.id,
    expectedLedCount: context.hardware.leds?.count ?? context.board.leds.count,
    now: context.now
  }));
  return frame;
}
