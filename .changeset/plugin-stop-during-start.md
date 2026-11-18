---
'zaileys': patch
---

Disconnecting while plugins are still loading no longer leaves them running. Plugins that finished loading after `client.disconnect()` used to stay registered with a file watcher nobody closed, so after the next `connect()` every plugin ran twice and handled each event twice. The loader now stops loading once it is stopped and unloads any plugin that was still in `setup()` at that moment.
