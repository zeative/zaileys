---
"zaileys": minor
---

Add status audience metadata support for group status posts (`client.send(groupJid).groupStatus(...)`).

Supports close friends (`audience: 'close-friends'`), public / everyone (`audience: 'everyone'`), and custom status audience metadata (`audience: { audienceType, listEmoji, listName }`) across text, media, and message reposts.
