/**
 * One GraphQL query per repo per poll (ADR 0006): open issues with assignees, the `Blocked by:` body,
 * native blocked-by and sub-issues (closed children included); on the first page only, open pull
 * requests and the last 20 closed ones, each with GitHub's own list of issues it closes.
 *
 * Cost: GitHub charges about one point per 100 connections requested. A full page asks for
 * 1 + 100 × 3 (assignees, blockedBy, subIssues) + 1 + 100 (open PRs' refs) + 1 + 20 (closed PRs' refs),
 * so about 4 points for the first page and 3 for each further page of 100 issues.
 */
export const REPO_QUERY = /* GraphQL */ `
  query Repo($owner: String!, $name: String!, $after: String, $withPrs: Boolean!) {
    rateLimit { cost remaining limit resetAt }
    repository(owner: $owner, name: $name) {
      nameWithOwner
      issues(first: 100, after: $after, states: OPEN, orderBy: { field: CREATED_AT, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          body
          createdAt
          assignees(first: 10) { nodes { login } }
          blockedBy(first: 20) { nodes { number state repository { nameWithOwner } } }
          subIssues(first: 50) {
            totalCount
            nodes { number title url state createdAt closedAt repository { nameWithOwner } }
          }
        }
      }
      pullRequests(first: 100, states: OPEN, orderBy: { field: CREATED_AT, direction: ASC }) @include(if: $withPrs) {
        nodes {
          number
          title
          url
          isDraft
          createdAt
          closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } }
        }
      }
      closedPullRequests: pullRequests(first: 20, states: [CLOSED, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) @include(if: $withPrs) {
        nodes {
          number
          title
          url
          merged
          mergedAt
          closedAt
          closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } }
        }
      }
    }
  }
`;

/** The shapes GitHub answers with (only the fields we ask for). */
export interface GqlRef {
  number: number;
  repository: { nameWithOwner: string };
}
export interface GqlSubIssue extends GqlRef {
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  closedAt: string | null;
}
export interface GqlIssue {
  number: number;
  title: string;
  url: string;
  body?: string | null;
  createdAt: string;
  assignees: { nodes: { login: string }[] };
  blockedBy?: { nodes: (GqlRef & { state: "OPEN" | "CLOSED" })[] } | null;
  subIssues?: { totalCount: number; nodes: GqlSubIssue[] } | null;
}
export interface GqlPullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  closingIssuesReferences?: { nodes: GqlRef[] } | null;
}
export interface GqlClosedPullRequest {
  number: number;
  title: string;
  url: string;
  merged: boolean;
  mergedAt: string | null;
  closedAt: string | null;
  closingIssuesReferences?: { nodes: GqlRef[] } | null;
}
export interface GqlRepoPage {
  rateLimit?: { cost: number; remaining: number; limit: number; resetAt: string } | null;
  repository: {
    nameWithOwner: string;
    issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlIssue[] };
    pullRequests?: { nodes: GqlPullRequest[] } | null;
    closedPullRequests?: { nodes: GqlClosedPullRequest[] } | null;
  } | null;
}
/** Everything read for one repo in one poll (all pages joined). */
export interface RepoReply {
  nameWithOwner: string;
  issues: GqlIssue[];
  /** Open pull requests (absent in replies saved before slice 4). */
  prs?: GqlPullRequest[];
  /** The last 20 closed pull requests, merged or not. */
  closedPrs?: GqlClosedPullRequest[];
}
