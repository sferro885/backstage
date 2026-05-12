---
id: tracing
title: Tracing Service (alpha)
sidebar_label: Tracing Service (alpha)
description: Documentation for the Tracing service
---

The Tracing Service provides a unified interface for emitting application-level [OpenTelemetry](https://opentelemetry.io/) trace spans from Backstage backend plugins. It scopes each plugin's spans automatically using the OpenTelemetry [Instrumentation Scope](https://opentelemetry.io/docs/concepts/instrumentation-scope/), wraps span lifecycle (auto-end, exception recording, error status) so plugins don't need to write that boilerplate, and transparently enriches spans with the authenticated principal's identity when an HTTP request or `BackstageCredentials` is supplied.

:::note
This service is currently in **alpha** and is imported from `@backstage/backend-plugin-api/alpha`. The API may change in future releases.
:::

## Setting up OpenTelemetry

The Tracing Service does **not** configure the OpenTelemetry SDK itself. You are responsible for initializing the OpenTelemetry Node SDK — including exporters, samplers, and resource attributes — before starting the Backstage backend. Follow the [tutorial](../../tutorials/setup-opentelemetry.md) for more information.

## How it Relates to OpenTelemetry Auto-Instrumentation

The Tracing Service **complements** auto-instrumentation rather than replacing it. Auto-instrumentation captures infrastructure-level spans like inbound HTTP requests, outbound HTTP calls, and database queries automatically — including all the standard HTTP / DB attributes. The Tracing Service is for **application-level spans** that only your plugin can produce, and child spans you want to attach to that infrastructure work.

Because HTTP spans are auto-instrumented, you typically should **not** set `http.*` attributes on Tracing Service spans yourself — the parent HTTP span already carries them. Spans you create are children of that HTTP span, in the same trace.

## Using the Service

Since the Tracing Service is an alpha API, the service reference is imported from `@backstage/backend-plugin-api/alpha` instead of `coreServices`.

```ts
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { tracingServiceRef } from '@backstage/backend-plugin-api/alpha';

createBackendPlugin({
  pluginId: 'todos',
  register(env) {
    env.registerInit({
      deps: { tracing: tracingServiceRef },
      async init({ tracing }) {
        // ... wire up your routes/handlers, holding onto `tracing` ...

        const result = await tracing.startActiveSpan(
          'process-todo',
          async span => {
            span.setAttribute('todo.category', 'personal');
            // ...do the work...
            return computeResult();
          },
        );
      },
    });
  },
});
```

`startActiveSpan(name, fn, options?)` runs `fn` inside a new active span. The span is finished automatically when `fn` resolves, and on a thrown error the exception is recorded, `error.type` is set from the error's `name`, and the span status is set to `ERROR` — you do not need to write a `try/catch/finally` for that.

Every span emitted through the service is automatically attributed to the calling plugin via `backstage.plugin.id` (matching `pluginMetadata.getId()`). Tracing backends can use this to filter all activity for a given plugin without inspecting the OpenTelemetry instrumentation scope. If your span represents work logically owned by a different plugin (for example, a wrapper that dispatches into another plugin's code), call `span.setAttribute('backstage.plugin.id', 'other-plugin')` from inside the callback to re-attribute it.

## Span Options

The third argument to `startActiveSpan` is an optional options object:

| Property      | Type                       | Description                                                                                          |
| ------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `attributes`  | `TracingServiceAttributes` | Attributes to attach to the span at creation time.                                                   |
| `kind`        | `TracingServiceSpanKind`   | Span kind. Defaults to OpenTelemetry's `internal`. See [Span Kinds](#span-kinds).                    |
| `credentials` | `BackstageCredentials`     | Authenticated principal source — adds principal-derived attributes to the span.                      |
| `request`     | `Request`                  | HTTP request to extract credentials from (used only for principal extraction, not HTTP attribution). |

### Span Kinds

| Kind         | Use Case                                                                          |
| ------------ | --------------------------------------------------------------------------------- |
| `'internal'` | Default. Internal application work — e.g. processing pipelines, scheduled tasks.  |
| `'server'`   | Protocol-level inbound request handlers (e.g. an MCP `tools/call` server).        |
| `'client'`   | Outbound calls. Usually auto-instrumented at the HTTP / RPC client layer instead. |
| `'producer'` | Sending a message to a queue or stream.                                           |
| `'consumer'` | Receiving a message from a queue or stream.                                       |

Most Backstage application-level spans are `internal` — leave `kind` unset and OpenTelemetry's default applies.

## Setting Attributes and Status from Inside the Callback

The callback receives a span object on which you can set additional attributes or status:

```ts
await tracing.startActiveSpan('refresh-entity', async span => {
  const entity = await fetchEntity(ref);
  span.setAttribute('catalog.entity.kind', entity.kind);

  if (entity.spec.deprecated) {
    span.setStatus({ code: 'error', message: 'entity is deprecated' });
  }
});
```

The span object exposes:

| Method                         | Description                                                          |
| ------------------------------ | -------------------------------------------------------------------- |
| `setAttribute(key, value)`     | Set a single attribute. Value is a primitive or array of primitives. |
| `setStatus({ code, message })` | Set the span status. `code` is `'ok'`, `'error'`, or `'unset'`.      |

## Context Propagation

When your plugin receives requests through a protocol layer that breaks automatic OpenTelemetry context propagation (e.g. a WebSocket handler), use `withPropagatedContext` to extract the trace parent and baggage from the incoming HTTP headers and run the handler within that context:

```ts
router.post('/', async (req, res) => {
  await tracing.withPropagatedContext(req.headers, () =>
    transport.handleRequest(req, res, req.body),
  );
});
```

Any spans created inside the callback — including those from `startActiveSpan` — will be children of the propagated trace and will have access to the propagated baggage.

## Reading Baggage

Use `getActiveBaggage()` to read baggage entries from the active context. This is useful for forwarding caller-set metadata onto your spans — for example, a request ID, tenant identifier, or feature-flag context that the caller propagated via baggage:

```ts
const baggage = tracing.getActiveBaggage();
const tenantId = baggage?.getEntry('app.tenant.id')?.value;
if (tenantId) {
  span.setAttribute('app.tenant.id', tenantId);
}
```

The returned object exposes:

| Method            | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `getEntry(key)`   | Returns `{ value: string }` for the key, or `undefined`. |
| `getAllEntries()` | Returns all entries as `[key, { value }][]`.             |

Returns `undefined` when no baggage is present in the active context.

## Principal Enrichment

When you supply either `credentials` or a `request`, the service adds principal-derived attributes to the span:

- `backstage.principal.type` is always set when a principal is present (`'user'`, `'service'`, or `'none'`). This is a Backstage-specific extension.
- `enduser.id` is set **only when** [`backend.tracing.capture.endUser`](#capturing-the-authenticated-end-user) is enabled at the backend level. For a user principal this is the user entity ref (e.g. `user:default/alice`); for a service principal it is the service subject (e.g. `external:my-service`).

If both `credentials` and `request` are supplied, `credentials` wins — the service does not extract from the request. The `request` is used only for credential extraction and does not influence other span attributes.

```ts
async ({ credentials }) => {
  await tracing.startActiveSpan(
    'process-tool-call',
    async span => {
      // ... span automatically has backstage.principal.type, and (if enabled)
      // enduser.id matching the credentials' principal ...
    },
    { credentials },
  );
};
```

### Capturing the authenticated end user

The `backend.tracing.capture.endUser` flag controls whether Tracing Service spans include the authenticated principal's identity as `enduser.id`. It defaults to `false` so identity is not exported by default.

```yaml title="app-config.yaml"
backend:
  tracing:
    capture:
      endUser: true # defaults to false
```

This is a backend-wide configuration honored by every plugin that creates spans through this service.

## Per-Plugin Tracer Configuration

Each plugin automatically receives a tracer named `backstage-plugin-<pluginId>`. Operators can override the OpenTelemetry Instrumentation Scope for a specific plugin without code changes:

```yaml title="app-config.yaml"
backend:
  tracing:
    plugin:
      catalog:
        tracer:
          name: 'custom-catalog-tracer'
          version: '2.0.0'
          schemaUrl: 'https://example.com/schema'
```

| Property    | Type     | Default                       | Description                      |
| ----------- | -------- | ----------------------------- | -------------------------------- |
| `name`      | `string` | `backstage-plugin-<pluginId>` | Name of the OpenTelemetry tracer |
| `version`   | `string` | —                             | Version string for the tracer    |
| `schemaUrl` | `string` | —                             | Schema URL for the tracer        |

:::tip
Most plugins won't need any of this — the defaults are designed to attribute every plugin's spans uniquely without configuration.
:::
