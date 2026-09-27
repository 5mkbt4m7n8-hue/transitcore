/**
 * Provider.loadVehicles(context) -> Promise<TransitVehicle[]>.
 * Context identifies a source, never a board or LED. Observations may include
 * observationType ('vehicle-position' or, in a future adapter, 'estimated-call').
 * Providers do not filter stale vehicles, deduplicate IDs or render frames:
 * those decisions currently belong to existing board engines.
 * Missing source values are null, never inferred from request time or route.
 */
export class ProviderError extends Error {
  constructor(message,{provider,code='PROVIDER_ERROR',cause}={}) {
    super(message,{cause});
    this.name='ProviderError';this.provider=provider;this.code=code;
  }
}
