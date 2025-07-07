# AI Chat Template - Development Guide

## Commands
- **Dev server**: `pnpm dev`
- **Build**: `pnpm build` (runs TypeScript compilation then Vite build)
- **Lint**: `pnpm lint` (ESLint)
- **Deploy**: `pnpm deploy` (builds and deploys with Wrangler)
- **Test**: `pnpm test` (Playwright E2E tests)
- **Test UI**: `pnpm test:ui` (Playwright test runner with UI)
- **Test headed**: `pnpm test:headed` (Run tests in visible browser)

## Code Style
- **Formatting**: Prettier with 2-space tabs, single quotes, no semicolons, 140 char line width
- **Imports**: Use `.tsx`/`.ts` extensions in imports, group by external/internal
- **Components**: React FC with explicit typing, PascalCase names
- **Hooks**: Custom hooks start with `use`, camelCase
- **Types**: Define interfaces in `src/types/index.ts`, use `type` for unions
- **Files**: Use PascalCase for components, camelCase for hooks/utilities
- **State**: Use proper TypeScript typing for all state variables
- **Error handling**: Use try/catch blocks with proper error propagation
- **Database**: IndexedDB with typed interfaces, async/await pattern
- **Styling**: Tailwind CSS classes, responsive design patterns

## Tech Stack
React 19, TypeScript, Vite, Tailwind CSS, Hono API, Cloudflare Workers, IndexedDB, React Router, use-mcp

## Chat UI Specific Guidelines

### Background Animation
- Use CSS `hue-rotate` filter for color cycling (more performant than gradient animation)
- Isolate animations to `::before` pseudo-elements with `z-index: -1` to prevent inheritance
- Use `background-size: 100% 100vh` and `background-repeat: repeat-y` for repeating patterns
- Initialize with random animation delay using CSS custom properties

### Modal Patterns
- Use `rgba(0,0,0,0.8)` for modal backdrops (avoid gradients that cause banding)
- Implement click-outside-to-dismiss with `onClick` on backdrop and `stopPropagation` on content
- Add `cursor-pointer` to all clickable elements including close buttons
- Use `document.body.style.overflow = 'hidden'` to prevent background scrolling

### MCP Server Management
- Store multiple servers in localStorage as JSON array (`mcpServers`)
- Track tool counts separately (`mcpServerToolCounts`) for disabled servers
- Use server-specific IDs for state management
- Each MCP server gets unique `useMcp` hook instance for proper isolation
- OAuth state parameter automatically handles multiple server differentiation

### State Persistence
- Use localStorage for user preferences (model selection, server configurations)
- Use sessionStorage for temporary state (single server URL in legacy components)
- Clear related data when removing servers or models

### UI Indicators
- Use emoji-based indicators (🧠 for models, 🔌 for MCP servers)
- Format counts as `enabled/total` (e.g., "1/2 servers, 3/5 tools")
- Place model selector on left, MCP servers on right for balance
- Show "none" instead of red symbols for cleaner unconfigured states

### Component Organization
- Keep disabled components in React tree but hidden with CSS (`{false && ...}`)
- This prevents MCP connections from being destroyed when modals close
- Use conditional rendering sparingly, prefer CSS visibility for stateful components

### Routing and OAuth
- Use React Router for OAuth callback routes (`/oauth/callback`)
- OAuth callback should match main app styling with loading indicators
- use-mcp library handles multiple server OAuth flows automatically via state parameters

### Performance Considerations
- Avoid animating gradients directly (causes repainting)
- Use transform and filter animations (hardware accelerated)
- Aggregate tools from multiple sources efficiently
- Minimize localStorage reads in render loops
