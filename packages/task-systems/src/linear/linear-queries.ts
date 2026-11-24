export const LINEAR_VIEWER_QUERY = `query RelayViewer {
  viewer { id name email assignedIssues(first: 1) { nodes { id } } }
  organization { name urlKey }
}`;

export const LINEAR_ASSIGNED_ISSUES_QUERY = `query RelayAssignedIssues($first: Int!, $after: String) {
  viewer {
    assignedIssues(
      first: $first
      after: $after
      filter: { state: { type: { nin: ["completed", "canceled", "duplicate"] } } }
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        url
        priority
        state { name type }
        team { name }
        project { name }
        dueDate
        updatedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
