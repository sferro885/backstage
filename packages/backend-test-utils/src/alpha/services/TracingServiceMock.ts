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
  createServiceFactory,
  ServiceFactory,
} from '@backstage/backend-plugin-api';
import {
  TracingService,
  TracingServiceAttributeValue,
  TracingServiceSpan,
  TracingServiceSpanStatus,
  tracingServiceRef,
} from '@backstage/backend-plugin-api/alpha';
import { tracingServiceFactory } from '@backstage/backend-defaults/alpha';

/**
 * A jest-mocked span captured by {@link TracingServiceMock}.
 *
 * @alpha
 */
export interface MockedTracingServiceSpan extends TracingServiceSpan {
  setAttribute: jest.Mock<void, [string, TracingServiceAttributeValue]>;
  setStatus: jest.Mock<void, [TracingServiceSpanStatus]>;
}

/**
 * Mock for the `TracingService`. Captures every span created via
 * `startActiveSpan` so tests can assert on the options passed in and the
 * methods called on the span inside the callback.
 *
 * @alpha
 */
export interface TracingServiceMock extends TracingService {
  startActiveSpan: jest.MockedFunction<TracingService['startActiveSpan']>;
  withPropagatedContext: jest.MockedFunction<
    TracingService['withPropagatedContext']
  >;
  getActiveBaggage: jest.MockedFunction<TracingService['getActiveBaggage']>;
  /** Spans created by `startActiveSpan` calls, in order. */
  spans: MockedTracingServiceSpan[];
  factory: ServiceFactory<TracingService>;
}

/**
 * @alpha
 */
export namespace tracingServiceMock {
  /**
   * Returns the real `tracingServiceFactory` from `@backstage/backend-defaults`,
   * for tests that want the full default implementation.
   */
  export const factory = () => tracingServiceFactory;

  /**
   * Builds a mock `TracingService` backed by jest mocks.
   */
  export const mock = (): TracingServiceMock => {
    const spans: MockedTracingServiceSpan[] = [];
    const startActiveSpan = jest.fn(async (_name, fn, _options) => {
      const span: MockedTracingServiceSpan = {
        setAttribute: jest.fn(),
        setStatus: jest.fn(),
      };
      spans.push(span);
      return await fn(span);
    }) as TracingServiceMock['startActiveSpan'];

    const withPropagatedContext = jest.fn(async (_headers, fn) =>
      fn(),
    ) as TracingServiceMock['withPropagatedContext'];
    const getActiveBaggage = jest.fn(
      () => undefined,
    ) as TracingServiceMock['getActiveBaggage'];

    const service: TracingService = {
      startActiveSpan,
      withPropagatedContext,
      getActiveBaggage,
    };

    return Object.assign(service as TracingServiceMock, {
      spans,
      factory: createServiceFactory({
        service: tracingServiceRef,
        deps: {},
        factory: () => service,
      }),
    });
  };
}
