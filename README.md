# 🤖 AI Bug Fixer

An AI-powered agent that automatically fixes bugs from Linear issues and creates GitHub PRs for review.

## Overview

This tool integrates Linear, GitHub, and Claude AI to create an automated bug-fixing workflow:

1. Engineer triages a bug in Linear and adds the `ai-fix` label
2. Linear webhook triggers the AI agent (running on Vercel)
3. Agent gathers context, analyzes the bug, and generates a fix
4. Creates a GitHub PR with the fix
5. Posts a comment on the Linear issue with the PR link
6. Human reviews and merges the PR

## Key Features

- **Smart Context Gathering:** Automatically finds relevant files, recent commits, and code patterns
- **Unified Context Engine:** Combines file operations, git, code search, and GitHub API
- **Conservative Fixes:** AI makes minimal, targeted changes to fix the issue
- **Human-in-the-Loop:** All fixes require PR review before deployment
- **Simple Setup:** Just add `.ai/context.md` to your repo and deploy to Vercel

## Architecture

```
┌──────────┐
│  Linear  │ (Human labels issue "ai-fix")
└────┬─────┘
     │ webhook
     ▼
┌────────────────────────────────┐
│   Vercel Serverless Function   │
│                                 │
│  ┌──────────────────────────┐  │
│  │  Context Engine          │  │
│  │  - File operations       │  │
│  │  - Git operations        │  │
│  │  - Code search           │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  AI Agent (Claude)       │  │
│  │  - Analyze bug           │  │
│  │  - Generate fix          │  │
│  └──────────────────────────┘  │
└────────────┬───────────────────┘
             │
             ▼
     ┌──────────────┐
     │  GitHub PR   │ (Human reviews & merges)
     └──────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- Anthropic API key ([get one here](https://console.anthropic.com))
- GitHub Personal Access Token or GitHub App
- Linear account with webhook access
- Vercel account (free tier works)

### 1. Clone and Install

```bash
git clone <your-repo>
cd ai-bugfixer
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `ANTHROPIC_API_KEY` - Your Claude API key
- `GITHUB_TOKEN` - GitHub personal access token with `repo` scope
- `GITHUB_REPOSITORY` - Format: `owner/repo` (e.g., `acme/myapp`)
- `LINEAR_API_KEY` - Linear API key for posting comments
- `LINEAR_WEBHOOK_SECRET` - (Optional) For webhook signature verification

### 3. Add Project Context

Create `.ai/context.md` in your target repository:

```bash
# In your application repository (not this repo!)
cp .ai/TEMPLATE.md .ai/context.md
# Edit .ai/context.md with your project-specific information
```

This file helps the AI understand your project. Include:
- Architecture and tech stack
- Directory structure
- Common bug patterns
- Coding conventions
- Critical files to be careful with

See `.ai/TEMPLATE.md` for a complete example.

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel

# Add environment variables in Vercel dashboard
# Or use Vercel CLI:
vercel env add ANTHROPIC_API_KEY
vercel env add GITHUB_TOKEN
vercel env add LINEAR_API_KEY
vercel env add GITHUB_REPOSITORY
```

Your webhook URL will be: `https://your-project.vercel.app/api/webhook`

### 5. Configure Linear Webhook

In Linear:
1. Go to Settings → Webhooks
2. Create a new webhook
3. URL: `https://your-project.vercel.app/api/webhook`
4. Events: Subscribe to "Issue updated" and "Issue created"
5. Save the webhook secret (optional, for signature verification)

### 6. Test It!

1. Create a test issue in Linear
2. Add the label `ai-fix`
3. Watch the magic happen!

The agent will:
- Analyze the bug
- Create a branch `fix/issue-id`
- Generate and commit the fix
- Create a PR
- Comment on the Linear issue

## Usage

### Triggering the AI Agent

Simply add the `ai-fix` label to any Linear issue. The issue description should include:

- Clear bug description
- Error messages or stack traces (if applicable)
- Steps to reproduce
- Expected vs actual behavior

**Example Linear Issue:**

```
Title: TypeError in user profile page

Description:
Getting this error when loading /profile:

TypeError: Cannot read property 'name' of undefined
  at UserProfile.render (src/components/UserProfile.tsx:45)
  at renderComponent (src/lib/react.ts:123)

Steps to reproduce:
1. Log in as a user
2. Navigate to /profile
3. Error appears

Expected: Profile page loads
Actual: TypeError crashes the page
```

### Reviewing AI-Generated Fixes

1. Check the PR created by the bot
2. Review the code changes carefully
3. Run tests locally or wait for CI
4. Merge if the fix looks good, or:
   - Comment on the PR with feedback
   - Close and manually fix
   - Re-label the Linear issue to try again

### Best Practices

- **Be specific in bug descriptions** - Include error messages, file paths, and stack traces
- **One bug per issue** - Don't combine multiple unrelated bugs
- **Use `.ai/context.md`** - The better the context, the better the fixes
- **Review thoroughly** - AI is smart but not perfect
- **Iterate on the context file** - Update it as you learn what helps the AI

## How It Works

### Context Gathering

The AI agent uses a "token budget" approach to gather the most relevant context:

1. **Static context** (Priority 1): `.ai/context.md` - Always included
2. **Issue details** (Priority 1): Title, description, labels
3. **Relevant files** (Priority 2): Files mentioned in stack traces
4. **Code search** (Priority 3): Search for error messages in codebase
5. **Recent commits** (Priority 4): Git history for affected files

Total context stays under ~100K tokens to leave room for AI reasoning.

### AI Analysis

Claude analyzes the bug with:
- Project architecture understanding (from context.md)
- Actual source code of relevant files
- Error patterns and stack traces
- Recent changes (git history)
- Similar code patterns (search results)

### Fix Generation

The AI generates:
- **Root cause analysis** - What's actually wrong
- **Fix strategy** - How to solve it
- **Complete file contents** - Modified files (not diffs)
- **Test plan** - How to verify the fix

### Safety Rails

- Only files explicitly changed are modified
- TypeScript compilation is expected to pass
- No destructive git operations
- All changes go through PR review
- Conservative approach - minimal changes only

## Development

### Local Development

```bash
# Type checking
npm run type-check

# Build
npm run build

# Run webhook locally (with ngrok or similar)
npm run dev
```

### Testing

Currently manual testing. To test:

1. Set up a test Linear workspace
2. Point webhook to local server (use ngrok)
3. Create test issues with various bug types
4. Verify fixes are correct

### Extending

Want to add features? Some ideas:

- **Custom labels**: Support multiple fix strategies (`ai-fix-quick`, `ai-fix-thorough`)
- **Test execution**: Run tests before creating PR
- **Multiple file formats**: Support Python, Go, Rust, etc.
- **Slack notifications**: Alert team when PRs are ready
- **Fix history**: Track success rate and learn from past fixes

## Cost Estimation

Typical costs per bug fix:

- **Claude API**: $3-15 per fix (depending on context size)
  - Input: ~100K tokens @ $3/MTok = $0.30
  - Output: ~8K tokens @ $15/MTok = $0.12
  - Total: ~$0.50 per fix on average
- **Vercel**: Free tier covers most usage (300s timeout with Pro)
- **GitHub/Linear**: Included in existing plans

For 100 bugs/month: ~$50 in AI costs

## Limitations

Current limitations:

- Single-repo only (no monorepo support yet)
- No test execution (PR review required)
- Limited to text-based code (no binary files)
- 200K token context limit (very large files may be truncated)
- No iterative fixing (one-shot approach)

## Troubleshooting

### "Could not determine GitHub repository"

Make sure either:
- Your Linear issue description includes a GitHub URL, or
- You set `GITHUB_REPOSITORY` environment variable

### "Invalid signature"

Set `LINEAR_WEBHOOK_SECRET` in your environment variables.

### "API rate limit exceeded"

GitHub API has rate limits. Consider:
- Using a GitHub App instead of personal token
- Caching repository clones
- Implementing request throttling

### "Fix failed - AI could not generate confident fix"

The AI couldn't solve it automatically. This happens when:
- Bug description is unclear
- Required context is missing
- Fix requires architectural changes
- Bug is in unfamiliar territory

Solution: Add more context to `.ai/context.md` or fix manually.

## Contributing

Contributions welcome! Areas that need work:

- [ ] Test coverage
- [ ] Monorepo support
- [ ] Better error handling
- [ ] Webhook signature verification
- [ ] Fix success rate tracking
- [ ] Integration tests

## License

MIT License - see LICENSE file

## Credits

Built with:
- [Claude AI](https://anthropic.com) by Anthropic
- [Linear](https://linear.app)
- [Vercel](https://vercel.com)
- [Octokit](https://github.com/octokit)

---

**Note:** This is an AI agent that writes code. Always review its changes carefully before merging. The AI is a tool to assist developers, not replace them.
