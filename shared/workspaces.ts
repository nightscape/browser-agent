export type WorkspaceStatus = "active" | "archived";

export interface Workspace {
  id: string;
  title: string;
  status: WorkspaceStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceManifest {
  workspaceId: string;
  artifactIds: string[];
  threadIds: string[];
  metadata?: Record<string, unknown>;
  updatedAt: number;
}

export interface ArtifactReference {
  id: string;
  repositoryId: string;
  workspaceId: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  contentSha?: string;
  revision?: string;
  createdAt: number;
  updatedAt: number;
  origin?: {
    threadId?: string;
    agentName?: string;
    userId?: string;
  };
}

export interface ArtifactDraft {
  workspaceId: string;
  path: string;
  content: Blob | string;
  mimeType: string;
  expectedRevision?: string;
  origin?: ArtifactReference["origin"];
}

export interface ArtifactContent {
  reference: ArtifactReference;
  content: Blob;
}

export interface ArtifactRepositoryCapabilities {
  shared: boolean;
  versioned: boolean;
  optimisticConcurrency: boolean;
  stableLinks: boolean;
  maxUploadSize: number;
  allowedMimeTypes?: string[];
}

export interface ArtifactRepository {
  readonly id: string;
  readonly capabilities: ArtifactRepositoryCapabilities;
  initializeWorkspace(workspace: Workspace): Promise<WorkspaceManifest>;
  list(workspaceId: string): Promise<ArtifactReference[]>;
  read(reference: ArtifactReference): Promise<ArtifactContent>;
  write(draft: ArtifactDraft): Promise<ArtifactReference>;
  resolve(workspaceId: string, artifactId: string): Promise<ArtifactReference | null>;
}

export interface ChildThreadLaunch {
  parentThreadId: string;
  workspaceId?: string;
  agentName: string;
  prompt: string;
  createdAt: number;
}