#!/usr/bin/env node
/**
 * CLI tool for testing the AI Bug Fixer locally
 *
 * Usage:
 *   npm run cli -- --issue LIN-123
 *   npm run cli -- --description "Bug description here"
 */

import { AIBugFixerAgent } from './lib/ai-agent';
import { UnifiedContextEngine } from './lib/context-engine';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const issueIdIndex = args.indexOf('--issue');
  const descriptionIndex = args.indexOf('--description');

  if (issueIdIndex === -1 && descriptionIndex === -1) {
    console.error('Usage: npm run cli -- --issue LIN-123');
    console.error('   or: npm run cli -- --description "Bug description"');
    process.exit(1);
  }

  // Validate env vars
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  if (!process.env.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN not set in .env');
    process.exit(1);
  }

  if (!process.env.GITHUB_REPOSITORY) {
    console.error('Error: GITHUB_REPOSITORY not set in .env (format: owner/repo)');
    process.exit(1);
  }

  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

  // Create mock issue
  const issue = {
    id: issueIdIndex !== -1 ? args[issueIdIndex + 1] : 'CLI-TEST',
    title: descriptionIndex !== -1 ? 'Manual CLI Test' : `Fix issue ${args[issueIdIndex + 1]}`,
    description:
      descriptionIndex !== -1
        ? args[descriptionIndex + 1]
        : 'Testing AI bug fixer from CLI',
    priority: 1,
    labels: ['ai-fix'],
    url: 'https://linear.app/test',
  };

  console.log('🤖 AI Bug Fixer CLI\n');
  console.log(`Issue: ${issue.title}`);
  console.log(`Description: ${issue.description}\n`);

  // Initialize context engine (use current directory)
  const contextEngine = new UnifiedContextEngine(
    process.env.GITHUB_TOKEN,
    process.cwd(),
    owner,
    repo
  );

  // Initialize AI agent
  const agent = new AIBugFixerAgent(process.env.ANTHROPIC_API_KEY, contextEngine);

  // Fix the bug
  console.log('Analyzing and fixing bug...\n');
  const result = await agent.fixBug(issue);

  if (result.success) {
    console.log('✅ Success!\n');
    console.log(`Branch: ${result.branch}`);
    console.log(`PR: ${result.prUrl}`);
    console.log(`\nFiles changed:`);
    result.files.forEach(f => console.log(`  - ${f}`));
    console.log(`\nReasoning:\n${result.reasoning}`);
  } else {
    console.log('❌ Failed to fix bug\n');
    console.log(`Error: ${result.error}`);
    console.log(`\nReasoning:\n${result.reasoning}`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
