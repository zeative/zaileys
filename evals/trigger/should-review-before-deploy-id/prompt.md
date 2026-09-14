---
description: "Review request with pasted zaileys code."
tags: [trigger]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

tolong review bot whatsapp saya sebelum deploy ya:

```ts
import { Client } from 'zaileys'
const client = new Client()
const numbers = ['6281111111111', '6282222222222']
client.on('connect', async () => {
  for (const n of numbers) await client.send(`${n}@s.whatsapp.net`).text('Promo hari ini!')
})
```
