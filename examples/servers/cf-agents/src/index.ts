import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import OAuthProvider, { type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'

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

    // Register sample resources using the agents framework API
    this.server.resource('calc://history', 'Calculation History', async () => ({
      contents: [
        {
          uri: 'calc://history',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              calculations: [
                { operation: 'add', a: 5, b: 3, result: 8, timestamp: '2024-01-01T10:00:00Z' },
                { operation: 'multiply', a: 4, b: 7, result: 28, timestamp: '2024-01-01T10:01:00Z' },
              ],
            },
            null,
            2,
          ),
        },
      ],
    }))

    this.server.resource('calc://settings', 'Calculator Settings', async () => ({
      contents: [
        {
          uri: 'calc://settings',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              precision: 2,
              allowNegative: true,
              maxValue: 1000000,
            },
            null,
            2,
          ),
        },
      ],
    }))

    // Register a dynamic resource
    this.server.resource('calc://stats', 'Calculation Statistics', async () => ({
      contents: [
        {
          uri: 'calc://stats',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              totalCalculations: Math.floor(Math.random() * 100),
              lastUpdated: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    }))

    // Register sample prompts using the agents framework API
    this.server.prompt(
      'math_problem',
      'Generate a math problem',
      {
        difficulty: z.string(),
        topic: z.string().optional(),
      },
      async ({ difficulty, topic }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a ${difficulty} math problem${topic ? ` about ${topic}` : ''}`,
            },
          },
        ],
      }),
    )

    this.server.prompt('explain_calculation', 'Explain a calculation', { operation: z.string() }, async ({ operation }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please explain how to perform ${operation} step by step with examples`,
          },
        },
      ],
    }))
  }
}

export type Bindings = Env & {
  OAUTH_PROVIDER: OAuthHelpers
}

const app = new Hono<{
  Bindings: Bindings
}>()

app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
  const email = 'example@dotcom.com'
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: email,
    metadata: {
      label: 'Test User',
    },
    scope: oauthReqInfo.scope,
    props: {
      userEmail: email,
    },
  })
  return Response.redirect(redirectTo)
})

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    if (url.pathname === '/public/sse' || url.pathname === '/public/sse/message') {
      return MyMCP.serveSSE('/public/sse').fetch(request, env, ctx)
    }

    if (url.pathname === '/public/mcp') {
      return MyMCP.serve('/public/mcp').fetch(request, env, ctx)
    }

    return new OAuthProvider({
      apiRoute: ['/sse', '/mcp'],
      apiHandler: {
        // @ts-ignore
        fetch: (request, env, ctx) => {
          const { pathname } = new URL(request.url)
          if (pathname.startsWith('/sse')) return MyMCP.serveSSE('/sse').fetch(request as any, env, ctx)
          if (pathname === '/mcp') return MyMCP.serve('/mcp').fetch(request as any, env, ctx)
          return new Response('Not found', { status: 404 })
        },
      },
      // @ts-ignore
      defaultHandler: app,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
    }).fetch(request, env, ctx)
  },
}
