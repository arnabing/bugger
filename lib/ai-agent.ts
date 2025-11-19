import Anthropic from '@anthropic-ai/sdk';
import { BugContext, UnifiedContextEngine } from './context-engine';

export interface FixResult {
  success: boolean;
  branch: string;
  prUrl?: string;
  prNumber?: number;
  files: string[];
  description: string;
  reasoning: string;
  error?: string;
}

export class AIBugFixerAgent {
  private anthropic: Anthropic;
  private contextEngine: UnifiedContextEngine;
  private model: string;

  constructor(
    apiKey: string,
    contextEngine: UnifiedContextEngine,
    model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.contextEngine = contextEngine;
    this.model = model;
  }

  /**
   * Main entry point: Fix a bug from a Linear issue
   */
  async fixBug(issue: {
    id: string;
    title: string;
    description: string;
    priority: number;
    labels: string[];
    url: string;
  }): Promise<FixResult> {
    try {
      console.log(`[AI Agent] Starting bug fix for: ${issue.title}`);

      // 1. Gather context
      console.log('[AI Agent] Gathering context...');
      const context = await this.contextEngine.gatherContextForBug(issue);
      console.log(`[AI Agent] Context gathered: ${context.estimatedTokens} tokens`);

      // 2. Create branch
      const branchName = `fix/${issue.id.toLowerCase()}`;
      console.log(`[AI Agent] Creating branch: ${branchName}`);
      await this.contextEngine.createBranch(branchName);

      // 3. Run agent to analyze and fix
      console.log('[AI Agent] Running AI analysis and fix...');
      const fix = await this.analyzeAndFix(context);

      if (!fix.success) {
        return {
          success: false,
          branch: branchName,
          files: [],
          description: 'AI agent could not generate a fix',
          reasoning: fix.reasoning,
          error: fix.error,
        };
      }

      // 4. Apply changes
      console.log('[AI Agent] Applying changes...');
      for (const change of fix.changes) {
        await this.contextEngine.writeFile(change.path, change.content);
      }

      // 5. Commit changes
      console.log('[AI Agent] Committing changes...');
      const commitMessage = `Fix: ${issue.title}\n\n${fix.reasoning}\n\nLinear Issue: ${issue.url}`;
      await this.contextEngine.commit(
        commitMessage,
        fix.changes.map(c => c.path)
      );

      // 6. Push branch
      console.log('[AI Agent] Pushing branch...');
      await this.contextEngine.pushBranch(branchName);

      // 7. Create PR
      console.log('[AI Agent] Creating PR...');
      const pr = await this.contextEngine.createPR({
        branch: branchName,
        title: `Fix: ${issue.title}`,
        body: this.buildPRDescription(issue, fix),
      });

      console.log(`[AI Agent] Success! PR created: ${pr.url}`);

      return {
        success: true,
        branch: branchName,
        prUrl: pr.url,
        prNumber: pr.number,
        files: fix.changes.map(c => c.path),
        description: fix.description,
        reasoning: fix.reasoning,
      };
    } catch (error) {
      console.error('[AI Agent] Error:', error);
      return {
        success: false,
        branch: `fix/${issue.id.toLowerCase()}`,
        files: [],
        description: 'Failed to fix bug',
        reasoning: 'An error occurred during the fix process',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Use Claude to analyze the bug and generate a fix
   */
  private async analyzeAndFix(context: BugContext): Promise<{
    success: boolean;
    changes: Array<{ path: string; content: string }>;
    description: string;
    reasoning: string;
    error?: string;
  }> {
    const prompt = this.buildPrompt(context);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 8000,
        temperature: 0.2, // Lower temperature for more focused fixes
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse the response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const result = this.parseClaudeResponse(content.text);
      return result;
    } catch (error) {
      console.error('[AI Agent] Claude API error:', error);
      return {
        success: false,
        changes: [],
        description: 'Failed to get fix from Claude',
        reasoning: 'API error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build the prompt for Claude
   */
  private buildPrompt(context: BugContext): string {
    const { staticContext, issueDetails, relevantFiles, recentCommits, searchResults } = context;

    return `You are an expert software engineer tasked with fixing a bug. Your goal is to:
1. Analyze the bug thoroughly
2. Identify the root cause
3. Generate a complete, tested fix
4. Explain your reasoning

## Project Context
${staticContext}

## Bug Report
**Title:** ${issueDetails.title}
**Priority:** ${issueDetails.priority}
**Description:**
${issueDetails.description}

${relevantFiles.length > 0 ? `## Relevant Files

${relevantFiles.map(f => `### ${f.path} (${f.lineCount} lines)
\`\`\`
${f.content}
\`\`\`
`).join('\n')}` : ''}

${searchResults.length > 0 ? `## Code Search Results
Found ${searchResults.length} occurrences of error patterns:
${searchResults.slice(0, 10).map(r => `- ${r.file}:${r.line} - ${r.content}`).join('\n')}` : ''}

${recentCommits.length > 0 ? `## Recent Commits
${recentCommits.map(c => `- ${c.sha.slice(0, 7)} - ${c.message} (${c.author})`).join('\n')}` : ''}

## Your Task

Analyze the bug and provide a fix in the following JSON format:

{
  "reasoning": "Detailed explanation of the root cause and your fix approach",
  "description": "Brief summary of what the fix does",
  "changes": [
    {
      "path": "relative/path/to/file.ts",
      "content": "COMPLETE file content after the fix (not a diff, the full file)"
    }
  ],
  "testPlan": "How to verify this fix works"
}

IMPORTANT RULES:
1. Provide COMPLETE file contents, not diffs or patches
2. Only include files you're actually changing
3. Ensure the fix doesn't introduce new bugs
4. Follow the project's coding conventions
5. Be conservative - minimal changes that fix the issue
6. If you can't fix it confidently, explain why in reasoning and return empty changes array

Return ONLY valid JSON, no other text.`;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseClaudeResponse(text: string): {
    success: boolean;
    changes: Array<{ path: string; content: string }>;
    description: string;
    reasoning: string;
    error?: string;
  } {
    try {
      // Extract JSON from the response (in case Claude adds extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.reasoning || !parsed.description || !Array.isArray(parsed.changes)) {
        throw new Error('Invalid response structure');
      }

      // If no changes, the AI couldn't fix it
      if (parsed.changes.length === 0) {
        return {
          success: false,
          changes: [],
          description: parsed.description,
          reasoning: parsed.reasoning,
          error: 'AI could not generate a confident fix',
        };
      }

      return {
        success: true,
        changes: parsed.changes,
        description: parsed.description,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error('[AI Agent] Failed to parse Claude response:', error);
      return {
        success: false,
        changes: [],
        description: 'Failed to parse AI response',
        reasoning: text.slice(0, 500), // Include part of the response for debugging
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build the PR description
   */
  private buildPRDescription(
    issue: { id: string; title: string; description: string; url: string },
    fix: { description: string; reasoning: string; changes: Array<{ path: string }> }
  ): string {
    return `## 🤖 AI-Generated Bug Fix

**Linear Issue:** ${issue.url}

### Summary
${fix.description}

### Analysis
${fix.reasoning}

### Changes
${fix.changes.map(c => `- \`${c.path}\``).join('\n')}

### Testing
Please review the changes and test thoroughly before merging.

---
*This PR was automatically generated by the AI Bug Fixer agent*`;
  }
}
