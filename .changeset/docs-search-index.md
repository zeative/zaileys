---
'zaileys': patch
---

Fix the docs site search: the Pagefind index was never generated, so the search box failed with "Failed to load search index. TypeError: Importing a module script failed." The docs build now indexes the static export into `_pagefind/` after `next build`.
