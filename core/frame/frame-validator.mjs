import {validatePixelFrame} from "../models/pixel-frame.mjs";
export {validatePixelFrame};
export function assertPixelFrame(frame, options) {
  const result = validatePixelFrame(frame, options);
  if (!result.valid) throw new Error(result.errors.map(e => e.path + ": " + e.message).join("; "));
  return frame;
}
