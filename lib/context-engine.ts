import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface LinearIssue {
  id: string;
  title: string;
  description: string;
  priority: number;
  labels: string[];
  url: string;
}

export interface FileContext {
  path: string;
  content: string;
  lineCount: number;
}

export interface BugContext {
  staticContext: string;
  issueDetails: LinearIssue;
  relevantFiles: FileContext[];
  recentCommits: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
  searchResults: Array<{
    file: string;
    line: number;
    content: string;
  }>;
  estimatedTokens: number;
}

/**
 * Unified Context Engine - combines file ops, git ops, code search, and GitHub API
 * This replaces the need for multiple separate MCP servers
 */
export class UnifiedContextEngine {
  private octokit: Octokit;
  private repoPath: string;
  private owner: string;
  private repo: string;

  constructor(
    githubToken: string,
    repoPath: string,
    owner: string,
    repo: string
  ) {
    this.octokit = new Octokit({ auth: githubToken });
    this.repoPath = repoPath;
    this.owner = owner;
    this.repo = repo;
  }

  // ============================================================
  // FILE OPERATIONS
  // ============================================================

  async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.repoPath, filePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.repoPath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(pattern: string = '**/*'): Promise<string[]> {
    // Simple implementation - in production, use glob library
    const files: string[] = [];

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, .git, etc.
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          files.push(path.relative(dir, fullPath));
        }
      }
    }

    await walk(this.repoPath);
    return files;
  }

  // ============================================================
  // CODE SEARCH (grep-like functionality)
  // ============================================================

  async searchCode(pattern: string, fileExtensions?: string[]): Promise<Array<{
    file: string;
    line: number;
    content: string;
  }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const files = await this.listFiles();

    for (const file of files) {
      // Filter by extension if provided
      if (fileExtensions && !fileExtensions.some(ext => file.endsWith(ext))) {
        continue;
      }

      try {
        const content = await this.readFile(file);
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          if (line.includes(pattern)) {
            results.push({
              file,
              line: index + 1,
              content: line.trim()
            });
          }
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  }

  async findSymbol(symbolName: string): Promise<Array<{
    file: string;
    line: number;
    context: string;
  }>> {
    // Search for function/class definitions
    const patterns = [
      `function ${symbolName}`,
      `const ${symbolName}`,
      `class ${symbolName}`,
      `export function ${symbolName}`,
      `export const ${symbolName}`,
      `export class ${symbolName}`,
    ];

    const results: Array<{ file: string; line: number; context: string }> = [];

    for (const pattern of patterns) {
      const matches = await this.searchCode(pattern, ['.ts', '.tsx', '.js', '.jsx']);
      results.push(...matches.map(m => ({ ...m, context: m.content })));
    }

    return results;
  }

  // ============================================================
  // GIT OPERATIONS
  // ============================================================

  async createBranch(branchName: string): Promise<void> {
    try {
      execSync(`git checkout -b ${branchName}`, { cwd: this.repoPath });
    } catch (error) {
      throw new Error(`Failed to create branch ${branchName}: ${error}`);
    }
  }

  async commit(message: string, files: string[]): Promise<string> {
    try {
      // Stage files
      for (const file of files) {
        execSync(`git add "${file}"`, { cwd: this.repoPath });
      }

      // Commit
      execSync(`git commit -m "${message}"`, { cwd: this.repoPath });

      // Get commit SHA
      const sha = execSync('git rev-parse HEAD', { cwd: this.repoPath })
        .toString()
        .trim();

      return sha;
    } catch (error) {
      throw new Error(`Failed to commit: ${error}`);
    }
  }

  async getRecentCommits(filePath?: string, limit: number = 10): Promise<Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>> {
    try {
      const fileArg = filePath ? `-- "${filePath}"` : '';
      const output = execSync(
        `git log -${limit} --pretty=format:"%H|%s|%an|%ai" ${fileArg}`,
        { cwd: this.repoPath }
      ).toString();

      return output.split('\n').filter(Boolean).map(line => {
        const [sha, message, author, date] = line.split('|');
        return { sha, message, author, date };
      });
    } catch (error) {
      return [];
    }
  }

  async getDiff(filePath?: string): Promise<string> {
    try {
      const fileArg = filePath || '';
      return execSync(`git diff ${fileArg}`, { cwd: this.repoPath }).toString();
    } catch (error) {
      return '';
    }
  }

  // ============================================================
  // GITHUB OPERATIONS
  // ============================================================

  async createPR(options: {
    branch: string;
    title: string;
    body: string;
    base?: string;
  }): Promise<{ url: string; number: number }> {
    const { data: pr } = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: options.title,
      head: options.branch,
      base: options.base || 'main',
      body: options.body,
    });

    return {
      url: pr.html_url,
      number: pr.number,
    };
  }

  async commentOnIssue(issueNumber: number, comment: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: comment,
    });
  }

  async pushBranch(branchName: string): Promise<void> {
    try {
      execSync(`git push -u origin ${branchName}`, { cwd: this.repoPath });
    } catch (error) {
      throw new Error(`Failed to push branch ${branchName}: ${error}`);
    }
  }

  // ============================================================
  // SMART CONTEXT GATHERING
  // ============================================================

  /**
   * The magic function that gathers all relevant context for a bug
   * This is what makes the AI agent effective
   */
  async gatherContextForBug(issue: LinearIssue): Promise<BugContext> {
    const context: BugContext = {
      staticContext: '',
      issueDetails: issue,
      relevantFiles: [],
      recentCommits: [],
      searchResults: [],
      estimatedTokens: 0,
    };

    // Token budget management
    const TOKEN_BUDGET = 100000; // Reserve half of Claude's context for response
    let tokensUsed = 0;

    // 1. Load static context (.ai/context.md)
    try {
      context.staticContext = await this.readFile('.ai/context.md');
      tokensUsed += this.estimateTokens(context.staticContext);
    } catch (error) {
      console.warn('No .ai/context.md found - consider creating one!');
      context.staticContext = 'No project context file found.';
    }

    // 2. Extract signals from the issue
    const signals = this.extractSignalsFromIssue(issue);

    // 3. Find files mentioned in stack traces
    for (const filePath of signals.files) {
      if (tokensUsed >= TOKEN_BUDGET * 0.7) break;

      try {
        const content = await this.readFile(filePath);
        const tokens = this.estimateTokens(content);

        if (tokensUsed + tokens < TOKEN_BUDGET * 0.7) {
          context.relevantFiles.push({
            path: filePath,
            content,
            lineCount: content.split('\n').length,
          });
          tokensUsed += tokens;
        }
      } catch (error) {
        console.warn(`Could not read file ${filePath}`);
      }
    }

    // 4. Search for error messages in codebase
    if (signals.errors.length > 0 && tokensUsed < TOKEN_BUDGET * 0.8) {
      const searchResults = await this.searchCode(
        signals.errors[0],
        ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']
      );

      context.searchResults = searchResults.slice(0, 20); // Limit to top 20 matches
      tokensUsed += this.estimateTokens(JSON.stringify(context.searchResults));
    }

    // 5. Get recent commits for context
    if (tokensUsed < TOKEN_BUDGET * 0.85) {
      context.recentCommits = await this.getRecentCommits(undefined, 5);
      tokensUsed += this.estimateTokens(JSON.stringify(context.recentCommits));
    }

    context.estimatedTokens = tokensUsed;
    return context;
  }

  /**
   * Extract useful signals from a Linear issue description
   */
  private extractSignalsFromIssue(issue: LinearIssue): {
    files: string[];
    errors: string[];
    functions: string[];
    stackTrace: string[];
  } {
    const text = `${issue.title}\n${issue.description}`;

    // Extract file paths (common patterns)
    const filePattern = /(?:[\w-]+\/)*[\w-]+\.\w+(?::\d+)?/g;
    const files = [...new Set((text.match(filePattern) || []).map(f => f.split(':')[0]))];

    // Extract error messages (lines with "Error", "Exception", etc.)
    const errorPattern = /(?:Error|Exception|Failed|TypeError|ReferenceError).*$/gm;
    const errors = [...new Set(text.match(errorPattern) || [])];

    // Extract function names (simplified)
    const functionPattern = /(?:at|in) (\w+)/g;
    const functions = [...new Set(
      Array.from(text.matchAll(functionPattern)).map(m => m[1])
    )];

    // Extract stack trace lines
    const stackTracePattern = /^\s*at .+$/gm;
    const stackTrace = text.match(stackTracePattern) || [];

    return { files, errors, functions, stackTrace };
  }

  /**
   * Rough token estimation (Claude uses ~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
