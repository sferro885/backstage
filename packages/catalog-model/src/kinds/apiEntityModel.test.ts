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

import { compileCatalogModel } from '../model/compileCatalogModel';
import { defaultCatalogEntityModel } from '../model/defaultCatalogEntityModel';

describe('apiEntityModel v1alpha2 dispatch', () => {
  const model = compileCatalogModel([defaultCatalogEntityModel]);

  it('routes mcp-server and non-mcp-server v1alpha2 entities to different schemas', () => {
    const mcp = model.getKind({
      kind: 'API',
      apiVersion: 'backstage.io/v1alpha2',
      spec: { type: 'mcp-server' },
    });
    const openapi = model.getKind({
      kind: 'API',
      apiVersion: 'backstage.io/v1alpha2',
      spec: { type: 'openapi' },
    });

    expect(mcp).toBeDefined();
    expect(openapi).toBeDefined();
    expect(mcp!.description).not.toBe(openapi!.description);

    const mcpSpecRequired = (mcp!.jsonSchema.properties as any).spec
      .required as string[];
    const openapiSpecRequired = (openapi!.jsonSchema.properties as any).spec
      .required as string[];

    expect(mcpSpecRequired).toContain('remotes');
    expect(mcpSpecRequired).not.toContain('definition');
    expect(openapiSpecRequired).toContain('definition');
    expect(openapiSpecRequired).not.toContain('remotes');
  });

  it('routes a v1alpha1 entity to the existing v1alpha1 schema', () => {
    const kind = model.getKind({
      kind: 'API',
      apiVersion: 'backstage.io/v1alpha1',
      spec: { type: 'openapi' },
    });
    expect(kind).toBeDefined();
    const required = (kind!.jsonSchema.properties as any).spec
      .required as string[];
    expect(required).toContain('definition');
  });
});
