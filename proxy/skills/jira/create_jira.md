---
description: "Create a Jira issue with the given details"
agent: agent
---

Create a Jira issue via MCP with the following details.

Summary: {{ summary }}
Description: {{ description | multiline }}

Use this exact JSON payload:

```json
{
	"fields": {
		"project": { "key": "STXAD" },
		"summary": "<substitute summary>",
		"description": "<substitute description>",
		"issuetype": { "name": "Task" },
		"fixVersions": [ { "id": "34936" } ],
		"customfield_10001": "STXAD-5229"
	}
}
```

Validate that the generated JSON contains `fields.fixVersions` as a non-empty array and `fields.customfield_10001` as a non-empty string before calling the MCP Jira API.

If create fails, return the Jira error message and indicate which field id needs to change or what shape is expected. Always double check if fixVersions and customfield_10001 are set before sending it.

On success: return the created issue key (e.g., `STXAD-12345`) and URL in format `https://devopsjira.deutsche-boerse.com/browse/STXAD-12345`.
On failure: the Jira error payload and a short hint which field id or payload shape to correct.
