# mcp-diffbot

Diffbot MCP — Knowledge Graph company enrichment + web content extraction (diffbot.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `diffbot_company` | Look up company details (employees, revenue, industry) for <name> — enrich a company from the Diffbot Knowledge Graph. Returns description, homepage, employee count, revenue, industries, founding date, HQ location, CEO, and Twitter. Example: diffbot_company({ name: "Stripe", _apiKey: "your-token" }) |
| `diffbot_extract` | Extract the structured content (title, text, author) from <url> — Diffbot analyzes any web page and returns its type, title, cleaned body text, author, publish date, site name, and language. Example: diffbot_extract({ url: "https://example.com/article", _apiKey: "your-token" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "diffbot": {
      "url": "https://gateway.pipeworx.io/diffbot/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Diffbot data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
