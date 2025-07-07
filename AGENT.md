# use-mcp Project Guidelines

## Build, Lint, and Test Commands
- `pnpm dev`: Run development build with watch mode and start all examples/servers
  - Chat UI: http://localhost:5002
  - Inspector: http://localhost:5001
  - Hono MCP Server: http://localhost:5101
  - CF Agents MCP Server: http://localhost:5102
- `pnpm build`: Build the project
- `pnpm check`: Run prettier checks and TypeScript type checking

### Integration Tests (in /test directory)
- `cd test && pnpm test`: Run integration tests headlessly (default)
- `cd test && pnpm test:headed`: Run integration tests with visible browser
- `cd test && pnpm test:headless`: Run integration tests headlessly 
- `cd test && pnpm test:watch`: Run integration tests in watch mode
- `cd test && pnpm test:ui`: Run integration tests with interactive UI

## Code Style Guidelines

### Imports
- Use explicit .js extensions in imports (ES modules style)
- Group imports: SDK imports first, followed by React/external deps, then local imports

### Formatting
- Single quotes for strings
- No semicolons at line ends
- 140 character line width
- Use 2 space indentation

### Types and Naming
- Strong typing with TypeScript
- Descriptive interface names with camelCase for variables/functions and PascalCase for types
- Comprehensive JSDoc comments for public API functions and types

### Error Handling
- Use assertions with descriptive messages
- Log errors with appropriate levels (debug, info, warn, error)
- Defensive error handling with specific error types when available

## Development Workflow
- **Commit changes frequently** after each logical change or debugging step
- Use descriptive commit messages that explain what was changed and why

### React Patterns
- Use React hooks with useRef for mutable values
- Stable callbacks with useCallback and appropriate dependencies