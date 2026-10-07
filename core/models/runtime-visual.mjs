// Provisional candidate limits; physical comfort/power validation is still required.
export const VISUAL_DEFAULTS = Object.freeze({pulsePeriodMs:1800,pulseMinBrightness:0,pulseMaxBrightness:255,backgroundBrightness:9});
export const VISUAL_RANGES = Object.freeze({pulsePeriodMs:[1000,5000],pulseMinBrightness:[0,255],pulseMaxBrightness:[0,255],backgroundBrightness:[0,32]});
export function validateVisual(value) {
  if(value===undefined)return [];
  if(!value||typeof value!=="object"||Array.isArray(value))return [{path:"visual",message:"Expected object"}];
  const errors=[];
  for(const [key,n] of Object.entries(value)) {
    const range=VISUAL_RANGES[key];
    if(!range||!Number.isInteger(n)||n<range[0]||n>range[1])errors.push({path:"visual."+key,message:"Invalid visual setting"});
  }
  if(value.pulseMinBrightness!==undefined&&value.pulseMaxBrightness!==undefined&&value.pulseMinBrightness>value.pulseMaxBrightness)
    errors.push({path:"visual",message:"Pulse minimum exceeds maximum"});
  return errors;
}
export function resolveVisual(board,device) {
  const errors=[...validateVisual(board),...validateVisual(device)];
  const value={...VISUAL_DEFAULTS,...board,...device};
  errors.push(...validateVisual(value));
  if(errors.length)throw new TypeError("Invalid visual configuration");
  return value;
}
