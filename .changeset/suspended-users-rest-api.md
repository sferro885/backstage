---
'@backstage/plugin-catalog-backend-module-github': patch
---

Suspended user detection now uses the GitHub REST API instead of the GraphQL `suspendedAt` field when `excludeSuspendedUsers` is enabled, removing the requirement for `site_admin` scope on GitHub Enterprise instances. In addition to account-level suspension, org-level membership suspension is now also detected and excluded.
