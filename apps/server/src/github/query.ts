/**
 * One GraphQL query per repo per poll (ADR 0006). Slice 3 reads open issues with assignees;
 * slice 4 adds sub-issues, blocked-by and pull requests to the same query.
 */
export const REPO_QUERY = /* GraphQL */ `
  query Repo($owner: String!, $name: String!, $after: String) {
    rateLimit { cost remaining limit resetAt }
    repository(owner: $owner, name: $name) {
      nameWithOwner
      issues(first: 100, after: $after, states: OPEN, orderBy: { field: CREATED_AT, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          createdAt
          assignees(first: 10) { nodes { login } }
        }
      }
    }
  }
`;

/** The shapes GitHub answers with (only the fields we ask for). */
export interface GqlIssue {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  assignees: { nodes: { login: string }[] };
}
export interface GqlRepoPage {
  rateLimit?: { cost: number; remaining: number; limit: number; resetAt: string } | null;
  repository: {
    nameWithOwner: string;
    issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlIssue[] };
  } | null;
}
/** Everything read for one repo in one poll (all pages joined). */
export interface RepoReply {
  nameWithOwner: string;
  issues: GqlIssue[];
}
