---
description: "Detect duplicate tickets, dependencies, and patterns across Jira projects"
---

Search all Jira tickets in the projects {{ projects | text "STXAD, STXIO" }} related to the topic {{ topic }}.

Only include tickets that are not Closed and not Done.

Analyze these tickets to detect duplicates, near-duplicates, patterns, and dependency relationships.

# Steps

## 1. Topic Filtering

Identify all tickets related to the topic by scanning:
- Title
- Description
- Acceptance criteria
- Labels & components
- Comments
- Error messages/logs
- Linked GitHub commits
- Linked Confluence pages

## 2. Duplicate Detection

Compare all identified tickets using:
- Semantic similarity of titles
- Overlapping descriptions
- Similar acceptance criteria
- Same logs or stack traces
- Shared components or environments
- Same or equivalent business intent

Provide:
- Duplicate ticket pairs or clusters
- Similarity scores
- Short explanation of why they match
- A suggested "primary" ticket in each cluster

## 3. Blocker/Dependency Analysis

For each ticket:
- Identify tickets it blocks
- Identify tickets it is blocked by
- Summarize blocking reasons
- Highlight critical paths across projects

## 4. Additional Insights

Also analyse for:
- Tickets with unclear ownership
- Tickets missing acceptance criteria
- Tickets that should be merged
- Tickets that are outdated or partially implemented
- Gaps where no Jira ticket exists but the topic requires coverage

## 5. Final Output

Provide a structured report with:
- Topic Overview
- Active Tickets Found
- Duplicate/Similar Ticket Groups
- Blockers / Blocked-By Dependencies
- Hidden or emerging patterns
- Recommendations: what to merge, clarify, close, or escalate
- Suggested next steps for moving the topic forward

Use bullet points for clarity. Only include open/active tickets. If the topic is broad, auto-cluster tickets by themes. If you detect missing or outdated documentation, flag it. If any key information is ambiguous, highlight assumptions.
