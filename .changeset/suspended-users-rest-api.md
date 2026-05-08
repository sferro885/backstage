---
'@backstage/plugin-catalog-backend-module-github': minor
'@backstage/plugin-catalog-backend-module-github-org': minor
---

Suspended users are now automatically excluded on GitHub Enterprise instances using the REST API, without requiring `site_admin` scope. Both account-level suspension and org-membership suspension are detected. This replaces the previous `excludeSuspendedUsers` option (which defaulted to off) with `dangerouslySkipSuspendedUserCheck` (which defaults to off, meaning the check runs by default). Set `dangerouslySkipSuspendedUserCheck: true` to disable the check if REST API rate limits are a concern.
