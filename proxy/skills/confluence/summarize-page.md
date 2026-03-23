---
description: "Summarize a Confluence page"
agent: statistix-sensai
---

Summarize the following Confluence page: {{ pageUrl | url }}

Format the output as {{ format | choice "bullets" "prose" "table" }}.

Focus on changes from the last {{ days | number "7" }} days.
