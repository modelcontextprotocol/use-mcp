import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: 'Authless Calculator',
    version: '1.0.0',
  })

  async init() {
    // Simple addition tool
    this.server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }],
    }))

    // Calculator tool with multiple operations
    this.server.tool(
      'calculate',
      {
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number(),
      },
      async ({ operation, a, b }) => {
        let result: number
        switch (operation) {
          case 'add':
            result = a + b
            break
          case 'subtract':
            result = a - b
            break
          case 'multiply':
            result = a * b
            break
          case 'divide':
            if (b === 0)
              return {
                content: [
                  {
                    type: 'text',
                    text: 'Error: Cannot divide by zero',
                  },
                ],
              }
            result = a / b
            break
        }
        return { content: [{ type: 'text', text: String(result) }] }
      },
    )
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    if (url.pathname === '/public/sse' || url.pathname === '/public/sse/message') {
      return MyMCP.serveSSE('/public/sse').fetch(request, env, ctx)
    }

    if (url.pathname === '/public/mcp') {
      return MyMCP.serve('/public/mcp').fetch(request, env, ctx)
    }
    //
    // if (url.pathname.startsWith('/authed')) {
    //   return new OAuthProvider({
    //     apiRoute: "/authed/mcp",
    //     // TODO: fix these types
    //     // @ts-expect-error
    //     apiHandler: MyMCP.mount("/sse"),
    //     // @ts-expect-error
    //     defaultHandler: app,
    //     authorizeEndpoint: "/authorize",
    //     tokenEndpoint: "/token",
    //     clientRegistrationEndpoint: "/register",
    //   }).fetch(request, env, ctx)
    // }

    return new Response('Not found', { status: 404 })
  },
}
