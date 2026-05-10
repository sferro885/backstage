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
  mockServices,
  registerMswTestHooks,
} from '@backstage/backend-test-utils';
import { CacheService } from '@backstage/backend-plugin-api';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createRestClient } from './github';

describe('createRestClient conditional request caching', () => {
  const server = setupServer();
  registerMswTestHooks(server);

  const logger = mockServices.logger.mock();
  const baseUrl = 'https://api.github.com';

  function createMockCache(): CacheService & {
    store: Map<string, unknown>;
  } {
    const store = new Map<string, unknown>();
    const cache: CacheService & { store: Map<string, unknown> } = {
      store,
      async get(key: string) {
        return store.get(key) as any;
      },
      async set(key: string, value: unknown) {
        store.set(key, value);
      },
      async delete(key: string) {
        store.delete(key);
      },
      withOptions() {
        return cache;
      },
    };
    return cache;
  }

  it('caches responses using last-modified header', async () => {
    let requestCount = 0;
    server.use(
      http.get(`${baseUrl}/users/testuser`, () => {
        requestCount++;
        return HttpResponse.json(
          { login: 'testuser', suspended_at: null },
          { headers: { 'Last-Modified': 'Thu, 01 Jan 2025 00:00:00 GMT' } },
        );
      }),
    );

    const cache = createMockCache();
    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    await client.request('GET /users/{username}', { username: 'testuser' });

    expect(requestCount).toBe(1);
    const cached = cache.store.get(`GET:${baseUrl}/users/testuser`) as any;
    expect(cached.lastModified).toBe('Thu, 01 Jan 2025 00:00:00 GMT');
    expect(cached.data).toEqual({ login: 'testuser', suspended_at: null });
  });

  it('sends if-modified-since on subsequent requests', async () => {
    let receivedHeaders: Record<string, string> = {};
    server.use(
      http.get(`${baseUrl}/users/testuser`, ({ request }) => {
        receivedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json(
          { login: 'testuser', suspended_at: null },
          { headers: { 'Last-Modified': 'Thu, 01 Jan 2025 00:00:00 GMT' } },
        );
      }),
    );

    const cache = createMockCache();
    cache.store.set(`GET:${baseUrl}/users/testuser`, {
      lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT',
      data: { login: 'testuser', suspended_at: null },
    });

    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    await client.request('GET /users/{username}', { username: 'testuser' });

    expect(receivedHeaders['if-modified-since']).toBe(
      'Wed, 01 Jan 2025 00:00:00 GMT',
    );
  });

  it('sends if-none-match when only etag is cached', async () => {
    let receivedHeaders: Record<string, string> = {};
    server.use(
      http.get(`${baseUrl}/users/testuser`, ({ request }) => {
        receivedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json(
          { login: 'testuser', suspended_at: null },
          { headers: { ETag: '"new-etag"' } },
        );
      }),
    );

    const cache = createMockCache();
    cache.store.set(`GET:${baseUrl}/users/testuser`, {
      etag: '"old-etag"',
      data: { login: 'testuser', suspended_at: null },
    });

    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    await client.request('GET /users/{username}', { username: 'testuser' });

    expect(receivedHeaders['if-none-match']).toBe('"old-etag"');
    expect(receivedHeaders['if-modified-since']).toBeUndefined();
  });

  it('returns cached data and headers on 304 response', async () => {
    const cachedData = { login: 'testuser', suspended_at: null };
    const cachedHeaders = {
      'x-github-enterprise-version': '3.12.0',
      'last-modified': 'Thu, 01 Jan 2025 00:00:00 GMT',
    };

    server.use(
      http.get(`${baseUrl}/users/testuser`, () => {
        return new HttpResponse(null, { status: 304 });
      }),
    );

    const cache = createMockCache();
    cache.store.set(`GET:${baseUrl}/users/testuser`, {
      lastModified: 'Thu, 01 Jan 2025 00:00:00 GMT',
      headers: cachedHeaders,
      data: cachedData,
    });

    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    const response = await client.request('GET /users/{username}', {
      username: 'testuser',
    });

    expect(response.data).toEqual(cachedData);
    expect(response.headers['x-github-enterprise-version']).toBe('3.12.0');
  });

  it('propagates non-304 errors', async () => {
    server.use(
      http.get(`${baseUrl}/users/testuser`, () => {
        return new HttpResponse(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const cache = createMockCache();
    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    await expect(
      client.request('GET /users/{username}', { username: 'testuser' }),
    ).rejects.toThrow();
  });

  it('prefers last-modified over etag for conditional headers', async () => {
    let receivedHeaders: Record<string, string> = {};
    server.use(
      http.get(`${baseUrl}/users/testuser`, ({ request }) => {
        receivedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ login: 'testuser' });
      }),
    );

    const cache = createMockCache();
    cache.store.set(`GET:${baseUrl}/users/testuser`, {
      lastModified: 'Thu, 01 Jan 2025 00:00:00 GMT',
      etag: '"some-etag"',
      data: { login: 'testuser' },
    });

    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    await client.request('GET /users/{username}', { username: 'testuser' });

    expect(receivedHeaders['if-modified-since']).toBe(
      'Thu, 01 Jan 2025 00:00:00 GMT',
    );
    expect(receivedHeaders['if-none-match']).toBeUndefined();
  });

  it('uses distinct cache keys per user', async () => {
    server.use(
      http.get(`${baseUrl}/users/:username`, ({ params }) => {
        return HttpResponse.json(
          { login: params.username, suspended_at: null },
          { headers: { 'Last-Modified': 'Thu, 01 Jan 2025 00:00:00 GMT' } },
        );
      }),
    );

    const cache = createMockCache();
    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
      cache,
    });

    await client.request('GET /users/{username}', { username: 'user-a' });
    await client.request('GET /users/{username}', { username: 'user-b' });

    expect(cache.store.has(`GET:${baseUrl}/users/user-a`)).toBe(true);
    expect(cache.store.has(`GET:${baseUrl}/users/user-b`)).toBe(true);
  });

  it('works without a cache', async () => {
    server.use(
      http.get(`${baseUrl}/users/testuser`, () => {
        return HttpResponse.json({ login: 'testuser' });
      }),
    );

    const client = createRestClient({
      token: 'test-token',
      baseUrl,
      logger,
    });

    const response = await client.request('GET /users/{username}', {
      username: 'testuser',
    });

    expect(response.data).toEqual({ login: 'testuser' });
  });
});
