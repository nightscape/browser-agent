import { openDB } from "./db";

export type AgentActivationStatus = "completed" | "failed";

export interface AgentActivationReceipt {
  id: string;
  threadId: string;
  agentName: string;
  actionIndex: number;
  actionFingerprint: string;
  status: AgentActivationStatus;
  createdAt: number;
  updatedAt: number;
  resultSummary?: string;
  errorMessage?: string;
}

export function activationReceiptId(
  threadId: string,
  agentName: string,
  actionIndex: number,
  actionFingerprint: string,
): string {
  return `${threadId}:${agentName}:${actionIndex}:${actionFingerprint}`;
}

export async function getActivationReceipt(id: string): Promise<AgentActivationReceipt | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("agentActivations", "readonly");
    const request = tx.objectStore("agentActivations").get(id);
    request.onsuccess = () => resolve((request.result as AgentActivationReceipt | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function putActivationReceipt(receipt: AgentActivationReceipt): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("agentActivations", "readwrite");
    tx.objectStore("agentActivations").put(receipt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}