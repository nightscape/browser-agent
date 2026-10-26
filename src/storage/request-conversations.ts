const intakeTitle = "Intake & Discovery Conversation (audit record)";

export const requestWorkingConversations = [
  "Business Jira Review",
  "STXAD Jira Ticket Preparation",
  "STXAD Review",
];

export function handOverDraftIntake(requestName: string, draftId: string) {
  if (!requestName || requestName.startsWith("draft:") || !draftId) {
    throw new Error("A request name and source draft ID are required.");
  }
  const storage = window.localStorage;
  const handoverKey = `dpl-request-intake-source:${requestName}`;
  const existingSource = storage.getItem(handoverKey);
  if (existingSource === draftId) return;
  if (existingSource) throw new Error("This request already has an intake from another draft.");

  const source = `draft:${draftId}`;
  const sourceIntake = storage.getItem(`dpl-request-intake-conversation:${source}`);
  const sourceHistory = storage.getItem(`dpl-request-conversation-messages:${source}`);
  if (!sourceIntake || !sourceHistory) throw new Error("The source draft intake is missing.");
  const histories = JSON.parse(sourceHistory) as Record<string, unknown[]>;
  const intakeHistory = histories[sourceIntake] ?? [];
  const messagesKey = `dpl-request-conversation-messages:${requestName}`;
  const conversationsKey = `dpl-request-conversations:${requestName}`;
  const existingMessages = JSON.parse(storage.getItem(messagesKey) ?? "{}") as Record<string, unknown[]>;
  const existingIntake = storage.getItem(`dpl-request-intake-conversation:${requestName}`) ?? intakeTitle;
  if (existingMessages[existingIntake]?.length) {
    throw new Error("An existing request intake cannot be overwritten.");
  }
  const conversations = JSON.parse(storage.getItem(conversationsKey) ?? "[]") as string[];
  const otherConversations = conversations.filter((name) => name !== existingIntake && name !== intakeTitle);
  storage.setItem(messagesKey, JSON.stringify({ ...existingMessages, [intakeTitle]: intakeHistory }));
  storage.setItem(conversationsKey, JSON.stringify([...new Set([intakeTitle, ...requestWorkingConversations, ...otherConversations])]));
  storage.setItem(`dpl-request-intake-conversation:${requestName}`, intakeTitle);
  storage.setItem(handoverKey, draftId);
}