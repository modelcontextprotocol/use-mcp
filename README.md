<div class="oranda-hide">

# 🦑 use-mcp 🦑

</div>

A lightweight React hook for connecting to [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) servers. Simplifies authentication and tool calling for AI systems implementing the MCP standard.

## Installation

```bash
npm install use-mcp
# or
pnpm add use-mcp
# or
yarn add use-mcp
```

## Features

- 🔄 Automatic connection management with reconnection and retries
- 🔐 OAuth authentication flow handling with popup and fallback support
- 📦 Simple React hook interface for MCP integration
- 🧰 TypeScript types for editor assistance and type checking
- 📝 Comprehensive logging for debugging
- 🌐 Works with both HTTP and SSE (Server-Sent Events) transports

## Quick Start

```ts
import { useMcp } from 'use-mcp/react'

function MyAIComponent() {
  const {
    state,          // Connection state: 'discovering' | 'authenticating' | 'connecting' | 'loading' | 'ready' | 'failed'
    tools,          // Available tools from MCP server
    error,          // Error message if connection failed
    callTool,       // Function to call tools on the MCP server
    retry,          // Retry connection manually
    authenticate,   // Manually trigger authentication
    clearStorage,   // Clear stored tokens and credentials
  } = useMcp({
    url: 'https://your-mcp-server.com',
    clientName: 'My App',
    autoReconnect: true,
  })

  // Handle different states
  if (state === 'failed') {
    return (
      <div>
        <p>Connection failed: {error}</p>
        <button onClick={retry}>Retry</button>
        <button onClick={authenticate}>Authenticate Manually</button>
      </div>
    )
  }

  if (state !== 'ready') {
    return <div>Connecting to AI service...</div>
  }

  // Use available tools
  const handleSearch = async () => {
    try {
      const result = await callTool('search', { query: 'example search' })
      console.log('Search results:', result)
    } catch (err) {
      console.error('Tool call failed:', err)
    }
  }

  return (
    <div>
      <h2>Available Tools: {tools.length}</h2>
      <ul>
        {tools.map(tool => (
          <li key={tool.name}>{tool.name}</li>
        ))}
      </ul>
      <button onClick={handleSearch}>Search</button>
    </div>
  )
}
```

## Setting Up OAuth Callback

To handle the OAuth authentication flow, you need to set up a callback endpoint in your app:

```ts
// pages/oauth/callback.tsx or equivalent
import { useEffect } from 'react'
import { onMcpAuthorization } from 'use-mcp'

export default function OAuthCallbackPage() {
  useEffect(() => {
    onMcpAuthorization()
  }, [])

  return (
    <div>
      <h1>Authenticating...</h1>
      <p>This window should close automatically.</p>
    </div>
  )
}
```

## API Reference

### `useMcp` Hook

```ts
function useMcp(options: UseMcpOptions): UseMcpResult
```

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | **Required**. URL of your MCP server |
| `clientName` | `string` | Name of your client for OAuth registration |
| `clientUri` | `string` | URI of your client for OAuth registration |
| `callbackUrl` | `string` | Custom callback URL for OAuth redirect (defaults to `/oauth/callback` on the current origin) |
| `storageKeyPrefix` | `string` | Storage key prefix for OAuth data in localStorage (defaults to "mcp:auth") |
| `clientConfig` | `object` | Custom configuration for the MCP client identity |
| `debug` | `boolean` | Whether to enable verbose debug logging |
| `autoRetry` | `boolean \| number` | Auto retry connection if initial connection fails, with delay in ms |
| `autoReconnect` | `boolean \| number` | Auto reconnect if an established connection is lost, with delay in ms (default: 3000) |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `state` | `string` | Current connection state: 'discovering', 'authenticating', 'connecting', 'loading', 'ready', 'failed' |
| `tools` | `Tool[]` | Available tools from the MCP server |
| `error` | `string \| undefined` | Error message if connection failed |
| `authUrl` | `string \| undefined` | Manual authentication URL if popup is blocked |
| `log` | `{ level: 'debug' \| 'info' \| 'warn' \| 'error'; message: string; timestamp: number }[]` | Array of log messages |
| `callTool` | `(name: string, args?: Record<string, unknown>) => Promise<any>` | Function to call a tool on the MCP server |
| `retry` | `() => void` | Manually attempt to reconnect |
| `disconnect` | `() => void` | Disconnect from the MCP server |
| `authenticate` | `() => void` | Manually trigger authentication |
| `clearStorage` | `() => void` | Clear all stored authentication data |

## License

MIT