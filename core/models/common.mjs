export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isId = value => typeof value === 'string' && /^[a-z0-9-]{3,120}$/.test(value);
export const positiveInteger = value => Number.isInteger(value) && value > 0;
export const byte = value => Number.isInteger(value) && value >= 0 && value <= 255;
export const hexColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export const STATES = ['OFF', 'APPROACHING', 'AT_STOP', 'PASSED', 'PARKED'];
export function result(errors, warnings = []) { return {valid: errors.length === 0, errors, warnings}; }
export function issue(list, path, message) { list.push({path, message}); }
