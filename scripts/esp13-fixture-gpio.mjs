// Compile coverage only. This must not be used by production package generation.
export const CI_ONLY_LED_DATA_PIN = 14;

export function resolveFixtureGpio(dataPin) {
  if (dataPin === null || dataPin === undefined) {
    return { pin: CI_ONLY_LED_DATA_PIN, synthetic: true };
  }
  // Numeric bounds cover ESP32/S3 identifiers, not electrical suitability.
  // Hardware-specific pin availability remains a provisioning responsibility.
  if (!Number.isInteger(dataPin) || dataPin < 0 || dataPin > 48) {
    throw new Error("Invalid hardware dataPin: expected an integer GPIO or an unassigned null/missing value");
  }
  return { pin: dataPin, synthetic: false };
}
