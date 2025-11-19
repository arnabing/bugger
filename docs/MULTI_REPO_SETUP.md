# Multi-Repo Setup Guide

Use one AI Bug Fixer deployment for multiple projects (nav, api, web, etc.)

## How It Works

The webhook automatically determines which GitHub repo to use based on (in priority order):

1. **GitHub URL in issue** - Parse from Linear issue description
2. **Linear Team mapping** - Map Linear teams to repos
3. **Default repo** - Fall back to `GITHUB_REPOSITORY` env var

## Setup Options

### Option 1: Team-Based Mapping (Recommended)

Map Linear teams to GitHub repos automatically.

**Example:**
- Linear team "NAV" → GitHub repo `acme/nav`
- Linear team "API" → GitHub repo `acme/api-server`
- Linear team "Web" → GitHub repo `acme/web-app`

**Setup:**

1. **Add Vercel env var:**
   ```bash
   vercel env add REPO_MAPPING
   # Enter: NAV=acme/nav,API=acme/api-server,WEB=acme/web-app
   ```

2. **Organize Linear teams:**
   - Ensure each project has its own Linear team
   - Team names should match the keys in `REPO_MAPPING`

3. **Test:**
   - Create issue in Linear team "NAV"
   - Add `ai-fix` label
   - Verify PR is created in `acme/nav` repo

### Option 2: GitHub URL in Issues

Include GitHub repo URL in Linear issue descriptions.

**Example Linear issue:**
```
Title: Fix login bug

Description:
Repo: https://github.com/acme/nav

Error in src/auth.ts:
TypeError: Cannot read property 'token' of undefined
```

The webhook will parse the GitHub URL and use that repo.

### Option 3: Single Default Repo

Simple setup for one primary repo with occasional other repos.

**Setup:**
```bash
vercel env add GITHUB_REPOSITORY
# Enter: acme/nav  (your main repo)
```

For other repos, include GitHub URL in issue description.

## Complete Multi-Repo Example

### 1. Vercel Configuration

```bash
# Deploy once
vercel

# Add credentials (shared across all repos)
vercel env add ANTHROPIC_API_KEY
vercel env add GITHUB_TOKEN
vercel env add LINEAR_API_KEY

# Add repo mapping
vercel env add REPO_MAPPING
# Value: NAV=acme/nav,API=acme/api,WEB=acme/web
```

### 2. Linear Configuration

**One webhook for all teams:**
- URL: `https://your-project.vercel.app/api/webhook`
- Events: Issue created, Issue updated
- All teams share the same webhook

### 3. Repository Setup

**In each repo (nav, api, web), add `.ai/context.md`:**

```bash
# In acme/nav repo
mkdir -p .ai
cat > .ai/context.md << 'EOF'
# NAV Project Context

## Architecture
- Next.js 14 with App Router
- tRPC API
- PostgreSQL database

## Key Directories
- /app - Next.js pages
- /server - tRPC routers
...
EOF

git add .ai/context.md
git commit -m "Add AI context for bug fixer"
git push
```

Repeat for each repo with project-specific context.

### 4. Usage

**For NAV project:**
1. Create issue in Linear "NAV" team
2. Add `ai-fix` label
3. PR created in `acme/nav`

**For API project:**
1. Create issue in Linear "API" team
2. Add `ai-fix` label
3. PR created in `acme/api`

## Team Name Matching

The code matches teams case-insensitively:
- `NAV` = `nav` = `Nav`
- Team ID also works if name isn't set

## Troubleshooting

### "Could not determine GitHub repository"

**Cause:** No repo found via URL, team mapping, or default.

**Fix:**
1. Check `REPO_MAPPING` is set correctly in Vercel
2. Verify Linear team name matches mapping key
3. Or, add GitHub URL to issue description
4. Or, set `GITHUB_REPOSITORY` as fallback

### Wrong repo selected

**Check priority:**
1. GitHub URL in description (highest priority)
2. Team mapping
3. Default repo (lowest priority)

**Fix:** Make sure the right method is being used, or adjust issue/config.

### Multiple teams map to same repo

That's fine! Multiple teams can share one repo:
```
BACKEND=acme/api,API=acme/api,SERVER=acme/api
```

## Cost Implications

**One deployment handles all repos:**
- Single Vercel instance
- Shared API costs (~$0.50 per fix across all projects)
- Linear webhook quota shared

**Scales easily:**
- 10 repos, 100 fixes/month = ~$50
- Same cost as single-repo setup

## Best Practices

1. **Use team mapping for owned repos** - Cleanest approach
2. **Use GitHub URLs for external/client repos** - More flexible
3. **Keep `.ai/context.md` updated** - Each repo needs its own context
4. **Monitor costs per-repo** - Check Vercel logs to track usage
5. **Test each repo** - Verify fixes work for each codebase

## Example: 3-Repo Setup

```bash
# Your repos:
# - acme/nav (Next.js navigation app)
# - acme/api (Node.js API server)
# - acme/mobile (React Native app)

# Vercel env:
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
LINEAR_API_KEY=lin_api_...
REPO_MAPPING=NAV=acme/nav,API=acme/api,MOBILE=acme/mobile

# Linear teams:
# - NAV team (for nav bugs)
# - API team (for API bugs)
# - Mobile team (for mobile bugs)

# Each repo has .ai/context.md

# Result: One webhook → all repos supported
```

---

Questions? See main [README.md](../README.md) or open an issue.
