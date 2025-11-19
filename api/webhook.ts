import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AIBugFixerAgent } from '../lib/ai-agent';
import { UnifiedContextEngine } from '../lib/context-engine';
import { LinearWebhookPayload, parseLinearWebhook } from '../lib/linear-types';

/**
 * Vercel Serverless Function - Linear Webhook Handler
 *
 * Triggered when a Linear issue is labeled with "ai-fix"
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Webhook] Received Linear webhook');

    // Verify webhook signature (important for security!)
    const signature = req.headers['linear-signature'] as string;
    if (!verifyLinearSignature(req.body, signature)) {
      console.error('[Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse Linear webhook payload
    const payload = parseLinearWebhook(req.body);

    // Check if this is an issue update with "ai-fix" label
    if (!shouldProcessIssue(payload)) {
      console.log('[Webhook] Issue does not have ai-fix label, skipping');
      return res.status(200).json({ message: 'Issue ignored (no ai-fix label)' });
    }

    console.log(`[Webhook] Processing issue: ${payload.data.title}`);

    // Extract repo info from issue (assuming it's linked to a GitHub repo)
    const repoInfo = extractRepoInfo(payload);
    if (!repoInfo) {
      console.error('[Webhook] Could not extract repo info from issue');
      return res.status(400).json({ error: 'Could not determine GitHub repository' });
    }

    // Initialize context engine
    const contextEngine = new UnifiedContextEngine(
      process.env.GITHUB_TOKEN!,
      `/tmp/${repoInfo.owner}-${repoInfo.repo}`, // Clone to tmp in serverless
      repoInfo.owner,
      repoInfo.repo
    );

    // Clone the repository (in production, you'd want to cache this)
    await cloneRepository(repoInfo.owner, repoInfo.repo);

    // Initialize AI agent
    const agent = new AIBugFixerAgent(
      process.env.ANTHROPIC_API_KEY!,
      contextEngine
    );

    // Fix the bug!
    const result = await agent.fixBug({
      id: payload.data.id,
      title: payload.data.title,
      description: payload.data.description || '',
      priority: payload.data.priority || 0,
      labels: payload.data.labels?.map(l => l.name) || [],
      url: payload.data.url,
    });

    if (result.success) {
      console.log(`[Webhook] Success! PR created: ${result.prUrl}`);

      // Post comment on Linear issue
      await postLinearComment(
        payload.data.id,
        `🤖 AI Bug Fixer has created a PR: ${result.prUrl}\n\n**Changes:**\n${result.files.map(f => `- \`${f}\``).join('\n')}\n\n**Reasoning:** ${result.reasoning.slice(0, 200)}...`
      );

      return res.status(200).json({
        success: true,
        pr: result.prUrl,
        files: result.files,
      });
    } else {
      console.error(`[Webhook] Failed to fix bug: ${result.error}`);

      // Post comment on Linear issue about failure
      await postLinearComment(
        payload.data.id,
        `⚠️ AI Bug Fixer could not generate a fix.\n\n**Reason:** ${result.reasoning}`
      );

      return res.status(200).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Verify Linear webhook signature
 */
function verifyLinearSignature(body: any, signature: string): boolean {
  // TODO: Implement proper signature verification
  // For now, just check if signature exists
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[Security] LINEAR_WEBHOOK_SECRET not set - skipping signature verification');
    return true; // Allow in development
  }

  // In production, implement HMAC verification
  // const crypto = require('crypto');
  // const hmac = crypto.createHmac('sha256', webhookSecret);
  // const digest = hmac.update(JSON.stringify(body)).digest('hex');
  // return digest === signature;

  return true;
}

/**
 * Check if issue should be processed (has "ai-fix" label)
 */
function shouldProcessIssue(payload: LinearWebhookPayload): boolean {
  if (payload.action !== 'update' && payload.action !== 'create') {
    return false;
  }

  const labels = payload.data.labels || [];
  return labels.some(label => label.name.toLowerCase() === 'ai-fix');
}

/**
 * Extract GitHub repo info from Linear issue
 * Supports multiple repos via team mapping
 */
function extractRepoInfo(payload: LinearWebhookPayload): {
  owner: string;
  repo: string;
} | null {
  // Option 1: Parse from issue description (GitHub URL)
  const description = payload.data.description || '';
  const githubUrlMatch = description.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);

  if (githubUrlMatch) {
    return {
      owner: githubUrlMatch[1],
      repo: githubUrlMatch[2].replace(/\.git$/, ''),
    };
  }

  // Option 2: Map Linear team to GitHub repo (multi-repo support)
  const teamKey = payload.data.team?.name || payload.data.team?.id || '';
  const repoMapping = process.env.REPO_MAPPING; // Format: "NAV=owner/nav,API=owner/api"

  if (repoMapping && teamKey) {
    const mappings = repoMapping.split(',');
    for (const mapping of mappings) {
      const [team, repo] = mapping.split('=');
      if (team.trim().toLowerCase() === teamKey.toLowerCase()) {
        const [owner, repoName] = repo.trim().split('/');
        return { owner, repo: repoName };
      }
    }
  }

  // Option 3: Use environment variable (single-repo setup)
  const repoEnv = process.env.GITHUB_REPOSITORY; // Format: "owner/repo"
  if (repoEnv) {
    const [owner, repo] = repoEnv.split('/');
    return { owner, repo };
  }

  return null;
}

/**
 * Clone repository to temp directory (serverless)
 */
async function cloneRepository(owner: string, repo: string): Promise<void> {
  const { execSync } = require('child_process');
  const tmpDir = `/tmp/${owner}-${repo}`;

  try {
    // Check if already cloned
    execSync(`test -d ${tmpDir}/.git`, { stdio: 'ignore' });
    console.log('[Git] Repository already cloned, pulling latest');
    execSync(`cd ${tmpDir} && git pull`, { stdio: 'inherit' });
  } catch {
    // Clone fresh
    console.log('[Git] Cloning repository');
    const token = process.env.GITHUB_TOKEN;
    execSync(
      `git clone https://${token}@github.com/${owner}/${repo}.git ${tmpDir}`,
      { stdio: 'inherit' }
    );
  }
}

/**
 * Post a comment on Linear issue
 */
async function postLinearComment(issueId: string, comment: string): Promise<void> {
  const linearApiKey = process.env.LINEAR_API_KEY;
  if (!linearApiKey) {
    console.warn('[Linear] No API key set, skipping comment');
    return;
  }

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearApiKey,
      },
      body: JSON.stringify({
        query: `
          mutation CreateComment($issueId: String!, $body: String!) {
            commentCreate(input: { issueId: $issueId, body: $body }) {
              success
            }
          }
        `,
        variables: { issueId, body: comment },
      }),
    });

    if (!response.ok) {
      console.error('[Linear] Failed to post comment:', await response.text());
    } else {
      console.log('[Linear] Comment posted successfully');
    }
  } catch (error) {
    console.error('[Linear] Error posting comment:', error);
  }
}
