# use-mcp Project Guidelines

## Build, Lint, and Test Commands
- `pnpm dev`: Run development build with watch mode
- `pnpm build`: Build the project
- `pnpm check`: Run prettier checks and TypeScript type checking

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

### React Patterns
- Use React hooks with useRef for mutable values
- Stable callbacks with useCallback and appropriate dependencies