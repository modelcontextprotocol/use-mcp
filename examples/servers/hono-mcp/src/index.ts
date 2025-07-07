import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { Hono } from 'hono'
import { z } from 'zod'
import { cors } from 'hono/cors'

const app = new Hono()

app.use(
  '/*',
  cors({
    origin: '*',
    allowHeaders: ['content-type', 'mcp-session-id', 'mcp-protocol-version'],
    exposeHeaders: ['mcp-session-id'],
  }),
)

// Your MCP server implementation
const mcpServer = new McpServer({
  name: 'vengabus-mcp-server',
  version: '1.0.0',
})

mcpServer.registerTool(
  'calculate_party_capacity',
  {
    title: 'Party Bus Capacity Calculator',
    description: 'Calculate how many people can fit on the Vengabus',
    inputSchema: {
      busCount: z.number().describe('Number of Vengabuses'),
      peoplePerBus: z.number().describe('People per bus'),
    },
  },
  async ({ busCount, peoplePerBus }) => ({
    content: [
      {
        type: 'text',
        text: `🚌 ${busCount} Vengabuses can transport ${busCount * peoplePerBus} party people! The wheels of steel are turning! 🎉`,
      },
    ],
  }),
)

mcpServer.registerTool(
  'get_vengabus_times',
  {
    title: 'Vengabus Schedule Checker',
    description:
      "This checks to see when the next Vengabus is, or whether there is one for the user's current location. Please display all the information to the user in a tabulated form.",
    inputSchema: {},
  },
  async () => {
    // Simulate some async work
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 100))
    return {
      content: [
        {
          type: 'text',
          text: `🚌 BOOM BOOM BOOM BOOM! Next Vengabus: IMMINENT! 🎉
          
Current Route: "Intercity Disco Express"
From: New York
To: IBIZA - THE MAGIC ISLAND! ✨

Schedule:
- Departure: When the beat drops
- Via: San Francisco (quick party stop)
- Arrival: When the sun comes up

Status: The party bus is jumping! 
Passengers: Maximum capacity!
BPM: 142 and rising!

We're going to Ibiza! Back to the island! 🏝️`,
        },
      ],
    }
  },
)

// Register sample resources
mcpServer.registerResource(
  'config',
  'config://vengabus',
  {
    title: 'Vengabus Fleet Configuration',
    description: 'Current Vengabus fleet settings and party parameters',
    mimeType: 'application/json',
  },
  async (uri: URL) => {
    const normalizedUri = uri.href.replace(/\/$/, '')
    return {
      contents: [
        {
          uri: normalizedUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              version: '1.0.0',
              fleet: 'intercity-disco',
              features: {
                bassBoost: true,
                strobeEnabled: true,
                maxBPM: 160,
                wheelsOfSteel: 'turning',
              },
              routes: ['New York to Ibiza', 'Back to the Magic Island', 'Like an Intercity Disco', 'The place to be'],
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

mcpServer.registerResource(
  'readme',
  'docs://party-manual.md',
  {
    title: 'Vengabus Party Manual',
    description: 'Official guide to the Vengabus experience',
    mimeType: 'text/markdown',
  },
  () => ({
    contents: [
      {
        uri: 'docs://party-manual.md',
        mimeType: 'text/markdown',
        text: "# 🚌 Vengabus MCP Server\n\nBOOM BOOM BOOM BOOM! Welcome aboard the Vengabus! We like to party!\n\n## Features\n- 🎉 Party capacity calculator - How many can we take to Ibiza?\n- 🕐 Vengabus schedule checker - Next stop: The Magic Island!\n- 🎵 Fleet configuration with maximum bass boost\n- 🌟 Party statistics tracker (BPM, passengers, energy levels)\n\n## Routes\n- New York to Ibiza (via San Francisco)\n- Back to the Magic Island\n- Like an Intercity Disco\n- The place to be\n\n## Current Status\nThe wheels of steel are turning, and traffic lights are burning!\nWe're going to Ibiza! Woah! We're going to Ibiza!\n\n*Up, up and away we go!*",
      },
    ],
  }),
)

// Register a resource template
mcpServer.registerResource(
  'stats',
  new ResourceTemplate('party://stats/{metric}', { list: undefined }),
  {
    title: 'Vengabus Party Statistics',
    description: 'Get party metrics (bpm, passengers, energy)',
    mimeType: 'application/json',
  },
  async (uri: URL, { metric }) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              metric: metric,
              value:
                metric === 'bpm'
                  ? 140 + Math.floor(Math.random() * 20)
                  : metric === 'passengers'
                    ? Math.floor(Math.random() * 50) + 20
                    : metric === 'energy'
                      ? Math.floor(Math.random() * 100)
                      : 0,
              unit:
                metric === 'bpm'
                  ? 'beats per minute'
                  : metric === 'passengers'
                    ? 'party people'
                    : metric === 'energy'
                      ? 'party power %'
                      : 'unknown',
              status: 'The party is jumping!',
              lastUpdated: new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

// Register sample prompts
mcpServer.registerPrompt(
  'party_invitation',
  {
    title: 'Vengabus Party Invitation',
    description: 'Generate a party invitation for the Vengabus',
    argsSchema: {
      name: z.string().describe('Name of the party person'),
      destination: z.string().optional().describe('Where the Vengabus is heading'),
    },
  },
  ({ name, destination }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Create a party invitation for ${name} to join the Vengabus${destination ? ` heading to ${destination}` : ''}`,
        },
      },
    ],
  }),
)

mcpServer.registerPrompt(
  'party_announcement',
  {
    title: 'Party Bus Announcement',
    description: 'Generate party-themed announcements for various occasions',
    argsSchema: {
      event: z.string().describe('Type of event (deployment, release, milestone, etc.)'),
      details: z.string().optional().describe('Additional details about the event'),
    },
  },
  ({ event, details }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Create a party bus announcement for a ${event}${details ? `: ${details}` : ''}`,
        },
      },
    ],
  }),
)

app.post('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport()
  await mcpServer.connect(transport)
  return transport.handleRequest(c)
})

export default app
