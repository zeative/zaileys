---
'zaileys': minor
---

Add `client.group.cachedMetadata(groupId)` and `client.group.invalidateMetadata(groupId?)`. Group metadata is now cached for up to five minutes, refreshed when `groups.update` or `group-participants.update` reports a change, after the bot itself edits the group, and on every reconnect. The cache is wired into baileys' `cachedGroupMetadata`, so sending to a group no longer queries its metadata first, and the inbound pipeline reuses it for room names. `group.metadata()` still asks WhatsApp every time, and the command `admin` guard keeps using it so authorization never relies on a cached copy.
