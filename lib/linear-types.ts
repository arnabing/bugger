/**
 * Linear webhook payload types
 */

export interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: 'Issue' | 'Comment' | 'Project';
  data: {
    id: string;
    title: string;
    description?: string;
    priority?: number;
    url: string;
    state?: {
      name: string;
      type: string;
    };
    labels?: Array<{
      id: string;
      name: string;
    }>;
    assignee?: {
      id: string;
      name: string;
    };
    team?: {
      id: string;
      name: string;
    };
  };
  createdAt: string;
  updatedAt?: string;
}

/**
 * Parse and validate Linear webhook payload
 */
export function parseLinearWebhook(body: any): LinearWebhookPayload {
  // Basic validation
  if (!body || !body.action || !body.type || !body.data) {
    throw new Error('Invalid Linear webhook payload');
  }

  return body as LinearWebhookPayload;
}

/**
 * Linear API GraphQL client for posting comments
 */
export class LinearClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createComment(issueId: string, body: string): Promise<boolean> {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({
        query: `
          mutation CreateComment($issueId: String!, $body: String!) {
            commentCreate(input: { issueId: $issueId, body: $body }) {
              success
              comment {
                id
              }
            }
          }
        `,
        variables: { issueId, body },
      }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data?.commentCreate?.success || false;
  }

  async updateIssue(
    issueId: string,
    updates: { stateId?: string; assigneeId?: string; labelIds?: string[] }
  ): Promise<boolean> {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({
        query: `
          mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $issueId, input: $input) {
              success
            }
          }
        `,
        variables: {
          issueId,
          input: updates,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data?.issueUpdate?.success || false;
  }
}
