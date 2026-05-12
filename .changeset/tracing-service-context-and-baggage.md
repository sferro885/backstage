---
'@backstage/backend-plugin-api': patch
'@backstage/backend-defaults': patch
'@backstage/backend-test-utils': patch
---

Added `withPropagatedContext` and `getActiveBaggage` to the alpha `TracingService`, enabling plugins to bridge OpenTelemetry context across async boundaries and read propagated baggage.
