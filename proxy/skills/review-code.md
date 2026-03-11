---
description: "Review a GitHub pull request"
---

Review the following pull request: {{ prUrl | url }}

Focus areas: {{ focus | multiline }}

Severity threshold: {{ severity | choice "all" "major" "critical" }}.
