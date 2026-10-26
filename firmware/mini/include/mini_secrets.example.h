#pragma once
// Rename to mini_secrets.h. Never commit the renamed file.
// Replace only the values you need. Source control defaults to OFFLINE DEMO.
#undef MINI_WIFI_SSID
#define MINI_WIFI_SSID "YOUR_WIFI_SSID"
#undef MINI_WIFI_PASSWORD
#define MINI_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#undef MINI_ROOT_CA_PEM
#define MINI_ROOT_CA_PEM R"pem(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_THE_VERIFIED_ROOT_CA_FOR_THE_DEPLOYED_WORKER
-----END CERTIFICATE-----
)pem"
// Enable only when you have verified the deployed /api/v1/mini/departures URL
// and copied a current valid root CA certificate for its HTTPS chain.
#undef MINI_USE_LIVE
#define MINI_USE_LIVE 1
// Optional alternative stop:
// #undef MINI_STOP_ID
// #define MINI_STOP_ID "NSR:StopPlace:41613"
// #undef MINI_STOP_NAME
// #define MINI_STOP_NAME "Prinsens gate"
