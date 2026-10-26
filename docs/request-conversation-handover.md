# Request conversation handover

Requests initialize three separate writable conversations: Business Jira Review,
STXAD Jira Ticket Preparation, and STXAD Review. Existing request discussions are retained.
The one-time initialization marker prevents renamed working conversations from
being recreated on each visit. Drafts do not receive these conversations.

After successful official request creation, the submission integration must call
`handOverDraftIntake(requestName, draftId)` from
`src/storage/request-conversations.ts` before opening the request workspace.
Use the same request identity passed to `RequestConversationsWorkspace`.

The function copies the source draft intake history, creates the three working
conversations, and records the source draft. Repeating the same handover is a
no-op, even if the draft subsequently changes. A different source draft or an
existing nonempty request intake is rejected rather than overwriting history.
The source draft remains unchanged. Other draft discussions are not transferred.

Only Intake & Discovery Conversation is displayed as a read-only audit record.
Working conversations remain writable and renameable without audit badges.

The Jira submission integration is not implemented. Submit still saves the draft
and reports that no Jira ticket or lifecycle process was created. The handover
function is available and tested by the request regression test, but is not yet
called by a production submission callback. Storage and read-only restrictions
are browser-local, not a server-enforced immutable audit trail.