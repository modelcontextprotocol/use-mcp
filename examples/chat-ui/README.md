# AI Chat with MCP

A React-based AI chat application demonstrating [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) integration with multiple AI providers.

This static web application showcases how to use the [`use-mcp`](../../) library to connect to MCP servers, providing extensible AI capabilities through external tools and services. The app supports multiple AI models, stores conversations locally in IndexedDB, and includes OAuth authentication for MCP server connections.

**Live demo**: [chat.use-mcp.dev](https://chat.use-mcp.dev)

## Features

- **MCP Integration**: Connect to MCP servers with OAuth authentication support
- **Multi-model Support**: Anthropic (Claude) and Groq (Llama) models with API key authentication
- **Local Storage**: Conversations stored in browser's IndexedDB
- **Static Deployment**: Builds to static assets for deployment anywhere
- **Modern Stack**: React 19, TypeScript, Tailwind CSS, Vite

## Get started

```sh
pnpm install
pnpm dev
```

Build and deploy:

```sh
pnpm build
pnpm run deploy  # deploys to Cloudflare Pages
```

## Development

- **Dev server**: `pnpm dev` (runs on port 5002)
- **Build**: `pnpm build`
- **Lint**: `pnpm lint`
- **Test**: `pnpm test` (Playwright E2E tests)
