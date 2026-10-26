export const draftIntentions = [
  "Create Regular IT Data Product",
  "Create Hybrid Data Product",
  "Register Self-Service Data Product",
  "Enhance Existing Data Product",
  "Report Issue",
  "Request Retirement",
] as const;

export type DraftIntention = (typeof draftIntentions)[number];
export type IntakeMessage = { role: "user" | "assistant"; content: string; proposedIntention?: DraftIntention | null };
export type IntakeResponse = { reply: string; proposedIntention: DraftIntention | null };