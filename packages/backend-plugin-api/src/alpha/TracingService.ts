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

import type { Request } from 'express';
import { BackstageCredentials } from '@backstage/backend-plugin-api';

/**
 * Attribute values that can be attached to spans.
 *
 * @alpha
 */
export type TracingServiceAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>;

/**
 * A set of key-value pairs that can be attached to spans.
 *
 * @alpha
 */
export interface TracingServiceAttributes {
  [key: string]: TracingServiceAttributeValue | undefined;
}

/**
 * The kind of operation a span represents.
 *
 * @alpha
 */
export type TracingServiceSpanKind =
  | 'internal'
  | 'server'
  | 'client'
  | 'producer'
  | 'consumer';

/**
 * The status of a span.
 *
 * @alpha
 */
export interface TracingServiceSpanStatus {
  code: 'unset' | 'ok' | 'error';
  message?: string;
}

/**
 * A trace span. Provided to `startActiveSpan` so
 * additional attributes or status can be set from within the callback.
 *
 * @alpha
 */
export interface TracingServiceSpan {
  setAttribute(key: string, value: TracingServiceAttributeValue): void;
  setStatus(status: TracingServiceSpanStatus): void;
}

/**
 * Options for `startActiveSpan`.
 *
 * @alpha
 */
export interface TracingServiceSpanOptions {
  /** Attributes to attach to the span. */
  attributes?: TracingServiceAttributes;
  /** The kind of span. */
  kind?: TracingServiceSpanKind;
  /**
   * Authenticated principal source for span enrichment. Preferred when
   * both `credentials` and `request` are supplied.
   */
  credentials?: BackstageCredentials;
  /** HTTP request to extract credentials from for span enrichment. */
  request?: Request<any, any, any, any, any>;
}

/**
 * A service for emitting trace spans from a backend plugin.
 *
 * @alpha
 */
export interface TracingService {
  /**
   * Runs `fn` inside a new active span. The span is finished when `fn`
   * resolves or throws.
   */
  startActiveSpan<T>(
    name: string,
    fn: (span: TracingServiceSpan) => T | Promise<T>,
    options?: TracingServiceSpanOptions,
  ): Promise<T>;

  /**
   * Extracts propagated context from HTTP headers and runs `fn` within
   * it. Use this to bridge context across async boundaries where
   * automatic propagation is lost.
   */
  withPropagatedContext<T>(
    headers: Record<string, string | string[] | undefined>,
    fn: () => T | Promise<T>,
  ): Promise<T>;

  /**
   * Returns the active baggage from the current context, or `undefined`
   * when none is present.
   */
  getActiveBaggage(): TracingServiceBaggage | undefined;
}

/**
 * A read-only view of propagated baggage entries.
 *
 * @alpha
 */
export interface TracingServiceBaggage {
  getEntry(key: string): TracingServiceBaggageEntry | undefined;
  getAllEntries(): Array<[string, TracingServiceBaggageEntry]>;
}

/**
 * A single baggage entry.
 *
 * @alpha
 */
export interface TracingServiceBaggageEntry {
  value: string;
}
