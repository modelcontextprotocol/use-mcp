import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { Hono } from 'hono'
import { z } from "zod";
import { cors } from 'hono/cors'

const app = new Hono()

app.use('/*', cors({
  origin: '*',
  allowHeaders: ['content-type','mcp-session-id','mcp-protocol-version'],
  exposeHeaders: ['mcp-session-id'],
}))

// Your MCP server implementation
const mcpServer = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
})

mcpServer.registerTool("add",
  {
    title: "Addition Tool",
    description: "Add two numbers",
    inputSchema: { a: z.number(), b: z.number() }
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  })
);

mcpServer.registerTool("get_vengabus_times",
  {
    title: "Vengabus Schedule Checker",
    description: "This checks to see when the next Vengabus is, or whether there is one for the user's current location. Please display all the information to the user in a tabulated form.",
    inputSchema: { }
  },
  async () => {
    await scheduler.wait(100)
    return ({
      content: [{
        type: 'text',
        text: `Next Vengabus: imminent. Current user's route: New York to San Francisco. Route name: "Intercity Disco".`
      }]
    })
  }
);

app.post('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport()
  await mcpServer.connect(transport)
  return transport.handleRequest(c)
})

export default app