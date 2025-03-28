# use-mcp React Integration

This package provides the `useMcp` hook for easily integrating the Model Context Protocol (MCP) into your React applications.

## Installation

Ensure you have `use-mcp`, `@modelcontextprotocol/sdk`, `react`, and `react-dom` installed:

```bash
npm install use-mcp @modelcontextprotocol/sdk react react-dom
# or
yarn add use-mcp @modelcontextprotocol/sdk react react-dom
# or
pnpm add use-mcp @modelcontextprotocol/sdk react react-dom
```

useMcp Hook

The useMcp hook manages the connection to an MCP server, handles authentication (including OAuth), and provides the list of available tools and functions to interact with the server.

## Importing

```tsx
import { useMcp } from 'use-mcp/react';
// Optional: Import types if needed
import type { UseMcpOptions, UseMcpResult, Tool } from 'use-mcp/react';
```

## Basic Usage

```tsx
import React from 'react';
import { useMcp } from 'use-mcp/react';
import { useChat } from 'ai/react'; // Example integration with Vercel AI SDK

function MyChatComponent() {
  const mcp = useMcp({
    // Replace with your MCP server's SSE endpoint URL
    url: 'http://localhost:8080/sse',
    // Optional: Configure OAuth parameters if your server requires auth
    // clientName: 'My Awesome App',
    // clientUri: window.location.origin,
    // callbackUrl: `${window.location.origin}/oauth/callback`, // Must match your callback route
    // storageKeyPrefix: 'my_app_mcp_auth', // Customize localStorage keys
    debug: process.env.NODE_ENV === 'development', // Enable debug logs in dev
    autoReconnect: true, // Automatically reconnect if connection drops
    autoRetry: 5000, // Retry connection every 5s if initial connection fails
  });

  // Example: Using MCP tools with Vercel AI SDK's useChat
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat', // Your backend endpoint that talks to the LLM
    // Pass MCP tools to the AI SDK if the connection is ready
    tools: mcp.state === 'ready' ? mcp.tools : undefined,
    // Example: Handling tool calls made by the LLM
    async onToolCall({ toolCall }) {
      if (mcp.state !== 'ready') {
        console.error('MCP not ready, cannot handle tool call:', toolCall);
        // Return an error or indication that the tool cannot be called
        return {
           toolCallId: toolCall.toolCallId,
           result: { error: 'Tool provider not available' }
        };
      }
      try {
        console.log('Handling tool call via MCP:', toolCall);
        const result = await mcp.callTool(
          toolCall.toolName,
          toolCall.args,
        );
        return {
          toolCallId: toolCall.toolCallId,
          result,
        };
      } catch (error) {
        console.error('Error calling MCP tool:', error);
        return {
           toolCallId: toolCall.toolCallId,
           result: { error: error instanceof Error ? error.message : String(error) }
        };
      }
    },
  });

  return (
    <div>
      <h1>MCP Status: {mcp.state}</h1>
      {mcp.state === 'failed' && (
        <div style={{ color: 'red' }}>
          Error: {mcp.error}
          {/* Show manual auth link if popup was blocked */}
          {mcp.authUrl && (
            <p>
              Popup blocked?{' '}
              <a href={mcp.authUrl} target="_blank" rel="noopener noreferrer">
                Authenticate manually
              </a>
              {' or '}
              <button onClick={() => mcp.authenticate()}>Retry Auth</button>
            </p>
          )}
           {/* Show retry button for general failures */}
           {!mcp.authUrl && <button onClick={mcp.retry}>Retry Connection</button>}
        </div>
      )}
      {mcp.state === 'authenticating' && <p>Waiting for authentication...</p>}
      {mcp.state === 'ready' && <p>Connected! Tools available: {mcp.tools.length}</p>}

      {/* Your Chat UI */}
      <div>
        {messages.map((m) => (
          <div key={m.id}>
            <strong>{m.role}:</strong> {m.content}
            {/* Render tool calls/results if needed */}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something..."
          // Disable input if MCP is not ready and tools might be needed
          disabled={mcp.state !== 'ready' && mcp.state !== 'loading'}
        />
        <button type="submit" disabled={mcp.state !== 'ready'}>Send</button>
      </form>

      {/* Optional: Display logs for debugging */}
      {mcp.debug && (
        <pre style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8em', background: '#eee', padding: '5px' }}>
          {mcp.log.map((l, i) => <div key={i}>[{l.level}] {new Date(l.timestamp).toLocaleTimeString()}: {l.message}</div>)}
        </pre>
      )}
       {/* Button to clear stored auth data */}
       <button onClick={mcp.clearStorage} style={{marginTop: '10px'}}>Clear Stored Auth</button>
    </div>
  );
}

export default MyChatComponent;
```

Hook Options (UseMcpOptions)

* url (required): The /sse URL of your MCP server.
* clientName: Name used for OAuth dynamic client registration (if applicable). Defaults to "MCP React Client".
* clientUri: Client URI used for OAuth registration. Defaults to window.location.origin.
* callbackUrl: The absolute URL of your OAuth callback page. Must match the redirect URI registered with your OAuth server and the route where you call onMcpAuthorization. Defaults to /oauth/callback on the current origin.
* storageKeyPrefix: Prefix for keys used in localStorage (e.g., tokens, client info). Defaults to "mcp:auth". Useful to avoid conflicts if multiple MCP instances/apps run on the same origin.
* clientConfig: Information about the client application sent during the MCP handshake. Includes name (default: "mcp-react-client") and version (default: "0.1.0").
* debug: Enable verbose logging to the console and the log state array. Defaults to false.
* autoRetry: If true or a number (milliseconds), automatically tries to reconnect if the initial connection fails. Defaults to false. Uses a 5000ms delay if set to true.
* autoReconnect: If true or a number (milliseconds), automatically tries to reconnect if an established connection is lost. Defaults to 3000 (3 seconds). Set to false to disable.
* popupFeatures: The features string passed to window.open for the OAuth popup. Defaults to "width=600,height=700,resizable=yes,scrollbars=yes,status=yes".

Hook Return Value (UseMcpResult)

* tools: An array of Tool objects provided by the server. Empty until state is 'ready'.
* state: The current connection state ('discovering', 'authenticating', 'connecting', 'loading', 'ready', 'failed'). Use this to conditionally render UI or enable/disable features.
* error: An error message if state is 'failed'.
* authUrl: If authentication is required and the popup was potentially blocked, this URL string can be used to let the user manually open the auth page (e.g., <a href={authUrl} target="_blank">...</a>).
* log: An array of log messages { level, message, timestamp }. Useful for debugging when debug option is true.
* callTool(name, args): An async function to execute a tool on the MCP server. Throws an error if the client isn't ready or the call fails.
* retry(): Manually triggers a reconnection attempt if the state is 'failed'.
* disconnect(): Disconnects the client from the server.
* authenticate(): Manually attempts to start the authentication flow. Useful for triggering the popup via a user click if it was initially blocked.
* clearStorage(): Removes all authentication-related data (tokens, client info, code verifier, state) for the configured server URL from localStorage. Useful for development or allowing users to "log out". Automatically disconnects the client.

Setting up the OAuth Callback Route

Remember to create the callback route (e.g., /oauth/callback) specified in callbackUrl and have it execute the onMcpAuthorization function exported from the main use-mcp package. See the root README for an example.