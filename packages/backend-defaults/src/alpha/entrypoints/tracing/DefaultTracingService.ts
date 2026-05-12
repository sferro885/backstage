/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  SpanKind,
  SpanStatusCode,
  Tracer,
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import {
  BackstageCredentials,
  HttpAuthService,
} from '@backstage/backend-plugin-api';
import {
  TracingService,
  TracingServiceAttributes,
  TracingServiceSpan,
  TracingServiceSpanKind,
  TracingServiceSpanOptions,
  TracingServiceSpanStatus,
} from '@backstage/backend-plugin-api/alpha';

/**
 * Options for creating a {@link DefaultTracingService}.
 *
 * @alpha
 */
export interface DefaultTracingServiceOptions {
  name: string;
  version?: string;
  schemaUrl?: string;
  pluginId: string;
  captureEndUser: boolean;
  httpAuth: HttpAuthService;
}

/**
 * Default implementation of the {@link TracingService} interface.
 *
 * @alpha
 */
export class DefaultTracingService implements TracingService {
  private readonly tracer: Tracer;
  private readonly pluginId: string;
  private readonly captureEndUser: boolean;
  private readonly httpAuth: HttpAuthService;

  private constructor(opts: DefaultTracingServiceOptions) {
    this.tracer = trace
      .getTracerProvider()
      .getTracer(opts.name, opts.version, { schemaUrl: opts.schemaUrl });
    this.pluginId = opts.pluginId;
    this.captureEndUser = opts.captureEndUser;
    this.httpAuth = opts.httpAuth;
  }

  static create(opts: DefaultTracingServiceOptions): TracingService {
    return new DefaultTracingService(opts);
  }

  async startActiveSpan<T>(
    name: string,
    fn: (span: TracingServiceSpan) => T | Promise<T>,
    options: TracingServiceSpanOptions = {},
  ): Promise<T> {
    let credentials = options.credentials;
    if (!credentials && options.request) {
      credentials = await this.httpAuth.credentials(options.request);
    }

    const principalAttributes = this.getPrincipalAttributes(credentials);
    const attributes: TracingServiceAttributes = {
      'backstage.plugin.id': this.pluginId,
      ...options.attributes,
      ...principalAttributes,
    };

    return this.tracer.startActiveSpan(
      name,
      { kind: toSpanKind(options.kind), attributes },
      async span => {
        try {
          const wrapped: TracingServiceSpan = {
            setAttribute(key, value) {
              span.setAttribute(key, value);
            },
            setStatus(status) {
              span.setStatus({
                code: toSpanStatusCode(status.code),
                message: status.message,
              });
            },
          };
          const result = await fn(wrapped);
          span.end();
          return result;
        } catch (err) {
          const error = err as Error;
          span.recordException(error);
          span.setAttribute('error.type', error.name || 'Error');
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message || String(error),
          });
          span.end();
          throw err;
        }
      },
    );
  }

  async withPropagatedContext<T>(
    headers: Record<string, string | string[] | undefined>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const otelCtx = propagation.extract(context.active(), headers);
    return context.with(otelCtx, fn);
  }

  getActiveBaggage() {
    const baggage = propagation.getActiveBaggage();
    if (!baggage) return undefined;
    return {
      getEntry: (key: string) => {
        const entry = baggage.getEntry(key);
        return entry ? { value: entry.value } : undefined;
      },
      getAllEntries: (): Array<[string, { value: string }]> =>
        baggage
          .getAllEntries()
          .map(([key, entry]) => [key, { value: entry.value }]),
    };
  }

  private getPrincipalAttributes(
    credentials: BackstageCredentials | undefined,
  ): TracingServiceAttributes {
    if (!credentials) return {};
    const principal = credentials.principal as
      | { type?: string; userEntityRef?: string; subject?: string }
      | undefined;
    if (!principal?.type) return {};
    const attrs: TracingServiceAttributes = {
      'backstage.principal.type': principal.type,
    };
    if (!this.captureEndUser) return attrs;
    if (principal.type === 'user' && principal.userEntityRef) {
      attrs['enduser.id'] = principal.userEntityRef;
    } else if (principal.type === 'service' && principal.subject) {
      attrs['enduser.id'] = principal.subject;
    }
    return attrs;
  }
}

function toSpanKind(
  kind: TracingServiceSpanKind | undefined,
): SpanKind | undefined {
  switch (kind) {
    case 'internal':
      return SpanKind.INTERNAL;
    case 'server':
      return SpanKind.SERVER;
    case 'client':
      return SpanKind.CLIENT;
    case 'producer':
      return SpanKind.PRODUCER;
    case 'consumer':
      return SpanKind.CONSUMER;
    default:
      return undefined;
  }
}

function toSpanStatusCode(
  code: TracingServiceSpanStatus['code'],
): SpanStatusCode {
  switch (code) {
    case 'ok':
      return SpanStatusCode.OK;
    case 'error':
      return SpanStatusCode.ERROR;
    default:
      return SpanStatusCode.UNSET;
  }
}
