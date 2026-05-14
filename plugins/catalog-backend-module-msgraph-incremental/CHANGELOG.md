# @backstage/plugin-catalog-backend-module-msgraph-incremental

## 0.1.0

### Minor Changes

- f1279ea: Introduces a cursor-based incremental ingestion provider for Microsoft Graph that processes users and groups one page at a time. Unlike `MicrosoftGraphOrgEntityProvider`, this module never holds the full dataset in memory — each burst processes a single page (up to 999 users or 100 groups). The `@odata.nextLink` cursor is persisted so a pod restart resumes from the last completed page rather than starting over.

### Patch Changes

- Updated dependencies
  - @backstage/backend-plugin-api@1.9.1
  - @backstage/catalog-model@1.8.1
  - @backstage/plugin-catalog-node@2.2.1
  - @backstage/plugin-catalog-backend-module-incremental-ingestion@0.7.12
  - @backstage/plugin-catalog-backend-module-msgraph@0.9.3
  - @backstage/config@1.3.8

## 0.1.0-next.0

### Minor Changes

- f1279ea: Introduces a cursor-based incremental ingestion provider for Microsoft Graph that processes users and groups one page at a time. Unlike `MicrosoftGraphOrgEntityProvider`, this module never holds the full dataset in memory — each burst processes a single page (up to 999 users or 100 groups). The `@odata.nextLink` cursor is persisted so a pod restart resumes from the last completed page rather than starting over.
