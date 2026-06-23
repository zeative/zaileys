# MCP integration — wiring a Model Context Protocol server into a zaileys AI bot

zaileys is the WhatsApp transport. When you build an **AI bot** on top of it (LLM replies via the
Vercel AI SDK), you can give the model extra capabilities by connecting **MCP (Model Context
Protocol)** servers — e.g. a scraper catalog like zpi (`mcp.zpi.web.id`). This recipe shows the
pattern: connect an MCP server, expose its tools to the model, and keep the per-turn tool payload
small with a lazy router.

> Scope: this is **app-level** (AI SDK + MCP SDK), not a zaileys API. zaileys only handles
> sending/receiving the WhatsApp messages; the MCP tools are wired into your LLM call.

## Concepts (quick)

- **MCP** exposes **tools** (callable functions w/ JSON Schema), **resources**, and **prompts**.
- **Transport:** `stdio` (local process), `SSE` (legacy remote), `Streamable HTTP` (modern remote, POST + optional SSE stream). Remote catalogs like zpi use Streamable HTTP.
- **Handshake (Streamable HTTP):** POST `initialize` → server returns `protocolVersion`/`capabilities`/`serverInfo` + `mcp-session-id` header → client sends `notifications/initialized` → then `tools/list` / `tools/call`. `Accept` header must be `application/json, text/event-stream`.
- **Auth:** header (`Authorization: Bearer <key>` or a custom header). Some clients are OAuth-only and need the `mcp-remote` bridge.

## Install

```bash
npm i @modelcontextprotocol/sdk ai
```

## Connect + expose tools to the model

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { dynamicTool, jsonSchema, type ToolSet } from 'ai'

export async function loadMcpTools(url: string, headers: Record<string, string>): Promise<ToolSet> {
  const client = new Client({ name: 'my-bot', version: '1.0.0' })
  const requestInit = { headers }
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit }))
  } catch {
    await client.connect(new SSEClientTransport(new URL(url), { requestInit })) // fallback
  }

  const { tools } = await client.listTools()
  const out: ToolSet = {}
  for (const t of tools) {
    out[t.name] = dynamicTool({
      description: t.description ?? t.name,
      inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (args) => {
        const res = await client.callTool({ name: t.name, arguments: args as Record<string, unknown> })
        // IMPORTANT: real data is often in structuredContent, not content[].text
        const structured = (res as { structuredContent?: unknown }).structuredContent
        const text = (res.content as { type: string; text?: string }[])
          .filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim()
        return structured != null ? { summary: text, data: structured } : (text || '(empty)')
      },
    })
  }
  return out
}
```

Then pass them into your model call alongside zaileys:

```ts
import { streamText } from 'ai'
import { Client as Zaileys } from 'zaileys'

const mcpTools = await loadMcpTools('https://mcp.zpi.web.id/mcp', {
  Authorization: `Bearer ${process.env.ZPI_API_KEY}`,
})

const wa = new Zaileys({ /* ...zaileys options... */ })
wa.on('messages', async (ctx) => {
  const res = streamText({ model, system, messages, tools: { ...mcpTools /*, ...yourTools */ } })
  // stream res.text back via the zaileys send builder
  // await wa.send(ctx.roomId).text(finalText)
})
```

## Gotchas (learned in production)

1. **Read `structuredContent`.** Many servers put the actual payload in `result.structuredContent`; `content[].text` may be just a summary (e.g. `"Success: ..."`). Returning only the text starves the model of data.
2. **Path params go in `params`.** For endpoints like `/:username`, pass `params: { username }` to the server's run/call tool — don't bake the value into the endpoint string.
3. **Don't dump every tool as always-active.** A catalog can expose dozens of tools. Use a **lazy router**: keep tools defined but inactive, expose one `find_tools(query)` meta-tool that ranks them (semantic + keyword) and activates only the matches for the next step. Mark a few "primary" tools always-active.
4. **find_tools ranking: merge semantic + keyword.** Pure embedding similarity misses exact-name hits (query `"instagram"` vs a generic tool description can score < 0.3). Union keyword matches so exact hits always surface.
5. **Keep reflexive/expensive tools lazy.** A model will reach for `web_search` first if it's always on. Make it discoverable instead, so cheaper/primary tools win by default.
6. **Accept header + session.** Streamable HTTP needs `Accept: application/json, text/event-stream` and you must carry the `mcp-session-id` from `initialize` on subsequent calls.

## Example: zpi scraper catalog

- Endpoint `https://mcp.zpi.web.id/mcp` (Streamable HTTP), auth `Authorization: Bearer <key>`.
- Tools: `search_scrapers`, `list_categories`, `get_scraper_schema`, `run_scraper`, `get_account`, `get_usage`, `bulk_submit`, `bulk_status`.
- Flow (2 hop): `search_scrapers` (natural-language query) → `run_scraper` (skip schema when params are obvious).
- Public scraper page URL: `https://zpi.web.id/api/<category>/<slug>`.

## Sources

- MCP docs: <https://modelcontextprotocol.io>
- MCP TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
- Vercel AI SDK tools: <https://ai-sdk.dev/docs>
