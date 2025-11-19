# AI Bug Fixer - Project Context

This file helps the AI understand your project structure and common patterns.
Customize this file for each repository where you deploy the AI Bug Fixer.

## Architecture

**Tech Stack:**
- TypeScript + Node.js
- Vercel serverless functions
- Anthropic Claude API for AI reasoning
- GitHub API for PR creation
- Linear API for issue tracking

**Key Components:**
1. `lib/context-engine.ts` - Unified context gathering (file ops, git, search)
2. `lib/ai-agent.ts` - Claude-powered bug analysis and fixing
3. `api/webhook.ts` - Linear webhook handler (Vercel function)
4. `lib/linear-types.ts` - Linear webhook payload types

## Directory Structure

```
/api           - Vercel serverless functions
/lib           - Core libraries (context engine, AI agent)
/.ai           - AI context files (this file!)
```

## Common Bug Patterns

### TypeScript Errors
- Usually in `.ts` or `.tsx` files
- Check type definitions and imports
- Common fixes: add type annotations, fix import paths

### Runtime Errors
- Look at stack traces to identify files
- Check for null/undefined handling
- Verify async/await usage

### API Errors
- Check API endpoint handlers
- Verify request/response types
- Look for missing error handling

## Coding Conventions

- **TypeScript:** Strict mode enabled
- **Formatting:** Prettier with 2-space indents
- **Imports:** Absolute imports from `lib/` and `api/`
- **Error handling:** Always use try-catch for async operations
- **Types:** Prefer interfaces over types for object shapes

## Files to Be Careful With

- `.env` files - Never commit, contains secrets
- `package.json` - Changes require npm install
- `vercel.json` - Deployment configuration

## Testing

Currently no automated tests (manual testing required).
Always verify fixes by:
1. Type checking: `npm run type-check`
2. Building: `npm run build`
3. Manual testing of the specific bug

## Don't Touch (Without Human Review)

- Deployment configs (`vercel.json`)
- Package dependencies (unless explicitly needed for fix)
- Environment variable handling

## Helpful Context for AI

When fixing bugs:
1. **Read error messages carefully** - they usually point to the exact issue
2. **Check recent commits** - bugs often come from recent changes
3. **Look for similar patterns** - codebase has consistent patterns
4. **Be conservative** - minimal changes are better than large refactors
5. **Verify types** - TypeScript errors are your friend, fix them properly

---

*Update this file as your project evolves to help the AI make better fixes!*
