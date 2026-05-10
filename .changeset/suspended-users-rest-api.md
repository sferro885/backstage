---
'@backstage/plugin-catalog-backend-module-github': minor
'@backstage/plugin-catalog-backend-module-github-org': minor
---

Suspended users are now automatically excluded on GitHub Enterprise instances using the REST API, without requiring `site_admin` scope. Both account-level suspension and org-membership suspension are detected. This replaces the previous `excludeSuspendedUsers` option (which defaulted to off) with `dangerouslySkipSuspendedUserCheck` (which defaults to off, meaning the check runs by default). Set `dangerouslySkipSuspendedUserCheck: true` to disable the check if needed. REST API responses are cached in order to leverage GitHub conditional requests via `last-modified`/`etag` headers, so unchanged responses from GitHub don't count against the rate limit. To enable caching, pass a `cache` option when creating the provider.
