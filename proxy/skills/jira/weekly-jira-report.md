---
description: "Weekly Jira activity report for a topic across projects"
---

Analyze the past {{ days | number "7" }} days of Jira activity related to {{ topic }} across the projects {{ projects | text "STXAD, STXIO" }}. Focus on tickets that are not Closed and not Done (but show closures in the "changes" section).

# Scope

- New tickets created
- Status changes (e.g., In Progress → Review → Done)
- Priority changes
- Assignee changes
- Comments or decision notes mentioning the topic
- New links to GitHub PRs/commits or Confluence pages
- Duplicates identified or merged
- Blockers added/removed

# Steps

1. Collect all tickets referencing the topic (title, description, labels, components, comments).
2. Filter by activity within the specified time window.
3. Summarize changes by category: Created, Progressed, Resolved, Reopened, Re-prioritized, Reassigned, New Links, Duplicates, Blockers.
4. Flag risks (stalled items, high-priority with no movement, unresolved blockers).
5. Propose next actions for the coming week (who, what, by when).

# Output Format

Provide a structured weekly report:

- **Overview** (1-2 paragraphs)
- **Highlights & Decisions** (bullets)
- **Changes by Category**
  - Created: [KEY - title - owner - status - link]
  - Progressed: [...]
  - Resolved/Done: [...]
  - Reopened: [...]
  - Re-prioritized: [...]
  - Reassigned: [...]
  - New Links (GitHub/Confluence): [...]
  - Duplicates/Consolidations: [...]
  - Blockers Added/Removed: [...]
- **Risks & Dependencies**
- **Recommended Actions for Next Week** (owners + due dates)
- **Appendix**: full change log (optional)

Include Jira links and assignees. If the topic is broad, auto-cluster by theme. Use current timezone for the time window.
