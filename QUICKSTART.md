# Quick Start Guide

Get the AI Bug Fixer running in 10 minutes.

## Step 1: Get API Keys (5 min)

### Anthropic API Key
1. Go to https://console.anthropic.com
2. Create account / sign in
3. Go to API Keys
4. Create new key
5. Copy it (starts with `sk-ant-...`)

### GitHub Token
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo` (full access)
4. Generate and copy token

### Linear API Key
1. Go to Linear Settings → API
2. Create Personal API Key
3. Copy it (starts with `lin_api_...`)

## Step 2: Deploy to Vercel (3 min)

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Add environment variables
vercel env add ANTHROPIC_API_KEY
# Paste your Claude API key

vercel env add GITHUB_TOKEN
# Paste your GitHub token

vercel env add LINEAR_API_KEY
# Paste your Linear API key

vercel env add GITHUB_REPOSITORY
# Enter: owner/repo (e.g., acme/myapp)

# Redeploy with env vars
vercel --prod
```

Your webhook URL: `https://your-project.vercel.app/api/webhook`

## Step 3: Configure Linear (2 min)

1. Open Linear → Settings → Webhooks
2. Click "New webhook"
3. Enter details:
   - **URL**: `https://your-project.vercel.app/api/webhook`
   - **Events**: Check "Issues" → "Issue updated" and "Issue created"
4. Click "Create webhook"
5. (Optional) Copy the signing secret and add as `LINEAR_WEBHOOK_SECRET` in Vercel

## Step 4: Add Context File (2 min)

In your application repository:

```bash
mkdir -p .ai
cat > .ai/context.md << 'EOF'
# Project Context

## Architecture
- [Your framework: Next.js, Express, etc]
- [Your database: PostgreSQL, etc]

## Key Directories
- `/src` - Main application code
- `/api` - API routes

## Common Bug Patterns
- TypeScript errors → Check type definitions
- Runtime errors → Check null handling

## Coding Conventions
- TypeScript with strict mode
- ESLint + Prettier

EOF

git add .ai/context.md
git commit -m "Add AI context file"
git push
```

## Step 5: Test It! (1 min)

1. Create a Linear issue with a simple bug
2. Add label `ai-fix`
3. Wait ~30 seconds
4. Check for:
   - New branch in GitHub
   - New PR in GitHub
   - Comment on Linear issue

## Example Test Issue

```
Title: Fix typo in welcome message

Description:
There's a typo in src/components/Welcome.tsx line 10.
It says "Welcom" but should say "Welcome".

File: src/components/Welcome.tsx
```

Add the `ai-fix` label and watch it work!

## Troubleshooting

**Nothing happens after labeling:**
- Check Vercel logs: `vercel logs`
- Verify webhook is configured in Linear
- Check environment variables are set

**"Could not determine repository":**
- Make sure `GITHUB_REPOSITORY` is set in Vercel
- Format must be: `owner/repo`

**AI creates wrong fix:**
- Improve your `.ai/context.md` file
- Add more specific bug details in Linear issue
- Include stack traces and error messages

## Next Steps

- [ ] Add `.ai/context.md` to all your repos
- [ ] Create `ai-fix` label in Linear
- [ ] Test with real bugs
- [ ] Improve context file based on results
- [ ] Share with your team

## Tips for Better Fixes

1. **Be specific** - Include file paths, line numbers, error messages
2. **Add context** - Stack traces help a lot
3. **One bug per issue** - Don't combine multiple bugs
4. **Update context.md** - The AI learns from it
5. **Review PRs carefully** - AI is smart but not perfect

---

Questions? Check the full README.md or open an issue!
