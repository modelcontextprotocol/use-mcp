# Integration Test Suite

This directory contains integration tests for the use-mcp project that test the complete flow:

1. Building the use-mcp library
2. Building the inspector example 
3. Starting MCP server(s)
4. Testing browser connections to MCP servers

## Setup

Install test dependencies:

```bash
cd test
pnpm install
```

## Running Tests

Run all integration tests (shows browser window):

```bash
cd test
pnpm test
```

Run tests headlessly (no browser window):

```bash
cd test
pnpm test:headless
```

Run tests in watch mode (re-runs on file changes):

```bash
cd test
pnpm test:watch
```

Run tests with interactive UI:

```bash
cd test  
pnpm test:ui
```

## Test Architecture

- **Global Setup** (`setup/global-setup.ts`): 
  - Builds use-mcp library and inspector
  - Starts hono-mcp server on port 9901
  - Starts static file server for inspector dist files
  
- **Global Teardown** (`setup/global-teardown.ts`):
  - Stops all servers and cleans up resources

- **Integration Tests** (`integration/mcp-connection.test.ts`):
  - Uses Playwright to automate browser interactions
  - Tests connection to MCP servers defined in `MCP_SERVERS` array
  - Verifies successful connections and tool availability
  - Logs debug information on failures

## Adding New MCP Servers

To test additional MCP servers, add them to the `MCP_SERVERS` array in the test file:

```typescript
const MCP_SERVERS = [
  {
    name: 'hono-mcp',
    url: 'http://localhost:9901/mcp',
    expectedTools: 1,
  },
  {
    name: 'new-server',
    url: 'http://localhost:9902/mcp',
    expectedTools: 2,
  },
]
```

Make sure to also update the global setup to start the new server process.

## Test Output

Successful connections will log:
- ✅ Connection success message
- 📋 List of available tools with count

Failed connections will log:
- ❌ Failure message  
- 🐛 Debug log from the inspector interface

## Troubleshooting

If tests fail:

1. Check that all required dependencies are installed
2. Verify that ports 9901 and 8000+ are available
3. Look at the debug log output for MCP connection errors
4. Check browser console logs for JavaScript errors
5. Run tests with `--headed` flag to see browser interactions
