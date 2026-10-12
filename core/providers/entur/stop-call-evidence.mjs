// Experimental call adapter. Keep forecasts separate from TransitVehicle GPS.
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
export function normalizeStopCall(call, quayId, receivedAt) {
  const line = call.serviceJourney?.journeyPattern?.line;
  return {
    id:call.serviceJourney?.id, lineId:line?.id, publicCode:line?.publicCode,
    serviceDate:call.date, quayId, receivedAt,
    destination:call.destinationDisplay?.frontText || '',
    expectedArrival:time(call.expectedArrivalTime || call.aimedArrivalTime),
    expectedDeparture:time(call.expectedDepartureTime || call.aimedDepartureTime),
    actualArrival:time(call.actualArrivalTime), actualDeparture:time(call.actualDepartureTime),
    realtime:call.realtime === true, cancelled:call.cancellation === true,
    predictionInaccurate:call.predictionInaccurate === true
  };
}
