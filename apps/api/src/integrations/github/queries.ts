/**
 * Documento GraphQL de búsqueda de PRs (portado 1:1 de
 * workspace/team-board/github_reviews.py::QUERY).
 *
 * `search(type:ISSUE)` con fragmento `... on PullRequest` incluye reviews
 * (hasta 100) y timelineItems de READY_FOR_REVIEW / REVIEW_REQUESTED /
 * CONVERT_TO_DRAFT. `rateLimit` viaja en cada respuesta para poder frenar
 * antes de agotar la cuota.
 */
export const SEARCH_PRS_QUERY = `
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 50, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url state isDraft createdAt mergedAt closedAt updatedAt
        additions deletions changedFiles headRefName baseRefName
        commits(first: 1) { nodes { commit { authoredDate committedDate } } }
        repository { name }
        author { login }
        mergedBy { login }
        reviews(first: 100) {
          nodes { author { login } state submittedAt }
        }
        timelineItems(first: 100, itemTypes: [READY_FOR_REVIEW_EVENT, REVIEW_REQUESTED_EVENT, CONVERT_TO_DRAFT_EVENT]) {
          nodes {
            __typename
            ... on ReadyForReviewEvent { createdAt }
            ... on ConvertToDraftEvent { createdAt }
            ... on ReviewRequestedEvent {
              createdAt
              requestedReviewer {
                ... on User { login }
                ... on Team { name }
              }
            }
          }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}`;
