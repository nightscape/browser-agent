---
description: "Create a weekly productivity plan from active Jira tickets"
---

Retrieve all Jira tickets in the projects {{ projects | text "STXAD, STXIO" }} that are assigned to me and are not Closed or Done.

Using these active tickets, create a detailed plan or summary for a {{ period | choice "1 week" "2 weeks" "sprint" }} period to help me be maximally productive.

# Steps

- Analyze all active tickets assigned to me and identify the primary goal(s) for the upcoming period.
- Break down these goals into daily tasks or key milestones.
- Identify any resources, dependencies, or blockers that affect these tickets.
- Arrange tasks in a logical, time-efficient sequence optimized for focus, flow, and impact.
- Include checkpoints or review moments to track progress throughout the period.

# Output Format

Provide a clear, structured weekly plan outlining:

- Weekly objectives
- Daily activities (Mon-Fri)
- Priorities
- Milestones
- Dependencies or blockers
- Recommended next steps

Use bullet points or numbered lists for clarity and readability. If any ticket information is incomplete or ambiguous, highlight assumptions or ask for clarification.
