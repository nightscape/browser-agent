# Draft Workspace

A draft represents one prospective request. It has one confirmed intent, one
shared submission template, and any number of supporting conversations.

## Intake and Conversations

- New drafts open Intake & Discovery automatically.
- Intake & Discovery cannot be renamed or deleted. It is restored when missing
  from an older draft.
- Only intake offers intent selection. The requester can select directly or
  discuss the need with the assistant first.
- AI recommendations are proposals. Confirm intent is required before an AI
  proposal selects the draft intent or opens a template.
- Supporting conversations can be renamed or deleted. They inherit the confirmed
  intent and never offer a separate intent picker.
- Switching or deleting supporting conversations does not change or delete the
  shared template. Its submission confirmation belongs to the template, not a
  conversation.

## AI Assistance

Draft chat uses `/api/draft-intake` with the configured provider and model.
The endpoint returns a reply and an optional structured intent proposal. It has
no tools and cannot submit requests, create Jira tickets, or trigger processes.
Supporting conversations and drafts with a confirmed intent cannot receive a
new actionable proposal from the endpoint. Provider failures leave the user's
saved messages intact and display an error.

## Persistence and Existing Drafts

The shared selection is stored under `dpl-draft-template:draft:<thread-id>`.
Existing form storage keys remain unchanged. Older conversation-specific
templates are retained; intake's template, or a single unambiguous legacy
template, is promoted to the shared selection. Multiple legacy templates without
an intake template require a fresh intake selection; their stored content is not
deleted or merged automatically.

Renamed legacy intake conversations are restored to the fixed name while keeping
their messages. Legacy string messages are loaded as user messages. New messages
retain their user or assistant role. Deleting the entire draft removes both
legacy and shared template storage.

## Submission Boundary

Draft submission still requires explicit confirmation. Jira ticket creation,
official request IDs, the submitted snapshot, and the lifecycle transition are
not connected yet. The existing confirmation reports this rather than claiming
successful submission.

## Regression Tests

Run `npx playwright test tests/draft-workspace.spec.ts` from the project root.
Tests mock AI responses and cover protected intake, shared template persistence,
supporting conversations, explicit AI proposal confirmation, and legacy intake
migration.