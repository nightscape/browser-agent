import type {
  ArtifactContent,
  ArtifactDraft,
  ArtifactReference,
  ArtifactRepository,
  ArtifactRepositoryCapabilities,
  Workspace,
  WorkspaceManifest,
} from "../../shared/workspaces";
import { openDB } from "./db";

interface StoredArtifact {
  reference: ArtifactReference;
  content: Blob;
}

const capabilities: ArtifactRepositoryCapabilities = {
  shared: false,
  versioned: false,
  optimisticConcurrency: false,
  stableLinks: false,
  maxUploadSize: 10 * 1024 * 1024,
};

export class BrowserArtifactRepository implements ArtifactRepository {
  readonly id = "browser";
  readonly capabilities = capabilities;

  async initializeWorkspace(workspace: Workspace): Promise<WorkspaceManifest> {
    return {
      workspaceId: workspace.id,
      artifactIds: [],
      threadIds: [],
      metadata: workspace.metadata,
      updatedAt: workspace.updatedAt,
    };
  }

  async list(workspaceId: string): Promise<ArtifactReference[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("artifacts", "readonly");
      const req = tx.objectStore("artifacts").index("workspaceId").getAll(workspaceId);
      req.onsuccess = () => {
        const artifacts = (req.result as StoredArtifact[]).map(({ reference }) => reference);
        artifacts.sort((left, right) => right.updatedAt - left.updatedAt);
        resolve(artifacts);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async read(reference: ArtifactReference): Promise<ArtifactContent> {
    const stored = await this.getStoredArtifact(reference.id);
    if (!stored || stored.reference.workspaceId !== reference.workspaceId) {
      throw new Error(`Artifact not found: ${reference.path}`);
    }
    return { reference: stored.reference, content: stored.content };
  }

  async write(draft: ArtifactDraft): Promise<ArtifactReference> {
    const content = typeof draft.content === "string"
      ? new Blob([draft.content], { type: draft.mimeType })
      : draft.content;
    if (content.size > capabilities.maxUploadSize) {
      throw new Error(`Artifact exceeds the ${capabilities.maxUploadSize} byte browser storage limit`);
    }

    const existing = await this.findByPath(draft.workspaceId, draft.path);
    const now = Date.now();
    const reference: ArtifactReference = {
      id: existing?.reference.id ?? crypto.randomUUID(),
      repositoryId: this.id,
      workspaceId: draft.workspaceId,
      path: draft.path,
      name: draft.path.split("/").pop() ?? draft.path,
      mimeType: draft.mimeType,
      size: content.size,
      createdAt: existing?.reference.createdAt ?? now,
      updatedAt: now,
      origin: draft.origin ?? existing?.reference.origin,
    };

    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("artifacts", "readwrite");
      tx.objectStore("artifacts").put({ reference, content } satisfies StoredArtifact);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return reference;
  }

  async resolve(workspaceId: string, artifactId: string): Promise<ArtifactReference | null> {
    const stored = await this.getStoredArtifact(artifactId);
    return stored?.reference.workspaceId === workspaceId ? stored.reference : null;
  }

  private async getStoredArtifact(id: string): Promise<StoredArtifact | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("artifacts", "readonly");
      const req = tx.objectStore("artifacts").get(id);
      req.onsuccess = () => resolve((req.result as StoredArtifact | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private async findByPath(workspaceId: string, path: string): Promise<StoredArtifact | null> {
    const artifacts = await this.list(workspaceId);
    const reference = artifacts.find((artifact) => artifact.path === path);
    return reference ? this.getStoredArtifact(reference.id) : null;
  }
}