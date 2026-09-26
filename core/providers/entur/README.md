# Entur provider

See [provider contract and compatibility](../../../docs/PROVIDER_LAYER_V1.md)
and [position versus estimates](../../../docs/PROVIDER_DATA_SEMANTICS.md).

Inject the existing bounded JSON transport. Reuse one provider instance per
Worker isolate. `loadVehicles({endpoint,codespaceId})` returns normalized
position observations; `toLegacyEnturVehicles` is the temporary bridge to
unchanged frame engines. No board mapping or LED policy belongs here.
