# use-mcp

**⚠️ Experimental: This library is new and under active development. Expect breaking changes. Please report all issues to [https://github.com/geelen/use-mcp/issues](https://github.com/geelen/use-mcp/issues).**

`use-mcp` provides browser-based utilities for connecting to servers implementing the [Model Context Protocol (MCP)](https://github.com/modelcontext/protocol). It simplifies handling connections, managing authentication (including OAuth 2.0 Authorization Code Flow with PKCE suitable for public clients like web apps), and accessing resources like Tools provided by the MCP server.

This library is designed to be used alongside the Vercel AI SDK (`ai`) or similar libraries, allowing you to easily integrate MCP tools into your LLM application's frontend.

## Features

*   Connects to MCP servers via Server-Sent Events (SSE).
*   Handles MCP JSON-RPC messaging.
*   Implements browser-friendly OAuth 2.0 authentication (Authorization Code with PKCE) using popups and `localStorage`.
*   Provides framework-agnostic auth utilities.
*   Includes a React hook (`useMcp`) for easy integration into React applications (via `use-mcp/react`).

## Installation

You need to install this library and the official MCP SDK:

```bash
npm install use-mcp @modelcontextprotocol/sdk
# or
yarn add use-mcp @modelcontextprotocol/sdk
# or
pnpm add use-mcp @modelcontextprotocol/sdk
```

## Core Exports

This main package (use-mcp) exports utilities primarily for handling OAuth in the browser:

* BrowserOAuthClientProvider: An implementation of the OAuthClientProvider interface from @modelcontextprotocol/sdk. It uses localStorage to store client information and tokens and handles the popup-based authorization flow. It's used internally by the useMcp hook but can be used independently if needed.

* onMcpAuthorization: A function designed to be called on your OAuth callback page (e.g., /oauth/callback). It handles exchanging the authorization code (received from the auth server) for tokens, validating the state parameter, storing tokens using localStorage, and communicating success or failure back to the original application window that initiated the auth flow.

React Integration (use-mcp/react)

For React applications, the easiest way to use this library is via the useMcp hook.

See the React README for detailed usage instructions and examples.
Basic OAuth Callback Setup

You need an endpoint in your application (e.g., /oauth/callback) that the OAuth server redirects the user back to after they approve the authorization request. This endpoint should call onMcpAuthorization.

Example (Conceptual - using a simple script in HTML or a framework handler):

```tsx
// pages/oauth/callback.js (or similar route file)
import { useEffect } from 'react'; // Or framework equivalent
import { onMcpAuthorization } from 'use-mcp';

export default function OAuthCallbackPage() {
  useEffect(() => {
    // Extract query parameters from window.location.search
    const queryParams = Object.fromEntries(
      new URLSearchParams(window.location.search).entries()
    );

    // Call the handler
    onMcpAuthorization(queryParams, {
      // Optional: specify storage key prefix if not using default 'mcp:auth'
      // storageKeyPrefix: 'my_custom_prefix'
    }).then(result => {
      if (!result.success) {
        // Error already logged and displayed by onMcpAuthorization
        console.error("OAuth callback failed:", result.error);
        // Optionally show a persistent error message or redirect
      }
      // On success, onMcpAuthorization closes the window or redirects
    }).catch(err => {
      // Catch unexpected errors during the handler execution itself
      console.error("Unexpected error in OAuth callback handler:", err);
      // Display error in the popup/page
      document.body.innerHTML = `<h1>Error</h1><p>An unexpected error occurred during authentication.</p><pre>${err.message}</pre>`;
    });

  }, []); // Run only once on component mount

  // Render a loading state while the exchange happens
  return <div>Processing authentication...</div>;
}
```

Future Plans

* Support for other frameworks (Vue, Svelte, etc.).
* Improved error handling and recovery.
* Support for different OAuth flows if necessary.

Contributions and feedback are welcome!