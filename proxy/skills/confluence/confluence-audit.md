---
description: "Audit Confluence pages for inconsistencies and gaps on a topic"
---

Analyze all Confluence pages related to the topic {{ topic }}. Search for all pages whose title, content, labels, or metadata reference this topic.

Evaluate the full set of pages for inconsistencies, contradictions, outdated information, missing links, and terminology mismatches.

# Steps

- Identify all Confluence pages connected to the topic (by title, labels, keywords, and backlinks).
- Read and compare their content for:
  - Conflicting definitions or statements
  - Different terminology for the same concept
  - Architecture or workflow inconsistencies
  - Outdated versions, release numbers, or deprecated processes
  - Contradicting diagrams, tables, or steps
  - Gaps where documentation is missing or incomplete
- Highlight duplicated or overlapping content across pages.
- Cross-check references to Jira tickets or GitHub repos if mentioned.
- Suggest consolidation, restructuring, or cleanup where needed.

# Output Format

Provide a clear, structured report that includes:

- Pages analyzed
- Detected inconsistencies across pages
- Conflicting statements or mismatched terminology
- Outdated or superseded information
- Duplicated or overlapping documentation
- Missing links, gaps, or unclear explanations
- Recommended corrections or rewrites
- Pages that should ideally be merged or harmonized

Use bullet points for clarity. If multiple clusters of documents exist (e.g., architecture vs. operations), group results accordingly. Provide proposed improved phrasing where appropriate. Only analyze pages that are actually related to the topic.
