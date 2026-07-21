import type {
  ArtifactContent,
  ArtifactDraft,
  ArtifactReference,
  ArtifactRepository,
  ArtifactRepositoryCapabilities,
  Workspace,
  WorkspaceManifest,
} from "../../shared/workspaces";

export interface GitHubArtifactRepositoryConfig {
  owner: string;
  repository: string;
  branch: string;
  root: string;
  apiUrl?: string;
  maxUploadSize?: number;
}

interface GitHubContentResponse {
  content: string;
  encoding: string;
  sha: string;
  size: number;
  path: string;
}

interface GitHubWriteResponse {
  content: { path: string; sha: string };
  commit: { sha: string };
}

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  oid: string;
  byteSize?: number;
}

interface TreeResponse {
  data?: {
    repository?: {
      object?: {
        entries?: TreeEntry[];
      };
    };
  };
  errors?: { message: string }[];
}

const DEFAULT_MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function encodeBase64(content: Blob | string): Promise<string> {
  return (async () => {
    const bytes = new Uint8Array(await (typeof content === "string"
      ? new TextEncoder().encode(content).buffer
      : content.arrayBuffer()));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  })();
}

/**
 * Remote artifact store backed by one configured GitHub repository and branch.
 * Its path checks are intentionally local as a defense in depth boundary before
 * a browser-held PAT is sent to GitHub.
 */
export class GitHubArtifactRepository implements ArtifactRepository {
  readonly id: string;
  readonly capabilities: ArtifactRepositoryCapabilities;

  private readonly apiUrl: string;
  private readonly root: string;
  private readonly maxUploadSize: number;

  constructor(
    private readonly config: GitHubArtifactRepositoryConfig,
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!token) throw new Error("A GitHub token is required for remote artifact storage");
    if (!config.owner || !config.repository || !config.branch) {
      throw new Error("GitHub artifact storage requires owner, repository, and branch configuration");
    }
    this.root = trimSlashes(config.root);
    if (!this.root) throw new Error("GitHub artifact storage requires a permitted root path");
    this.apiUrl = (config.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.maxUploadSize = config.maxUploadSize ?? DEFAULT_MAX_UPLOAD_SIZE;
    this.id = `github:${config.owner}/${config.repository}:${config.branch}:${this.root}`;
    this.capabilities = {
      shared: true,
      versioned: true,
      optimisticConcurrency: true,
      stableLinks: true,
      maxUploadSize: this.maxUploadSize,
    };
  }

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
    const workspacePath = this.workspacePath(workspaceId);
    const query = `query ArtifactTree($owner: String!, $repository: String!, $expression: String!) {
      repository(owner: $owner, name: $repository) {
        object(expression: $expression) {
          ... on Tree {
            entries { path type oid byteSize }
          }
        }
      }
    }`;
    const response = await this.github<TreeResponse>("/graphql", {
      method: "POST",
      body: JSON.stringify({
        query,
        variables: {
          owner: this.config.owner,
          repository: this.config.repository,
          expression: `${this.config.branch}:${workspacePath}`,
        },
      }),
    });
    if (response.errors?.length) {
      throw new Error(`GitHub artifact list failed: ${response.errors.map((error) => error.message).join("; ")}`);
    }

    const entries = response.data?.repository?.object?.entries ?? [];
    return entries
      .filter((entry) => entry.type === "blob")
      .map((entry) => this.reference(workspaceId, `${workspacePath}/${entry.path}`, {
        contentSha: entry.oid,
        size: entry.byteSize ?? 0,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async read(reference: ArtifactReference): Promise<ArtifactContent> {
    const path = this.assertReference(reference);
    const response = await this.github<GitHubContentResponse>(
      `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.config.branch)}`,
    );
    if (response.encoding !== "base64") {
      throw new Error(`Unsupported GitHub content encoding: ${response.encoding}`);
    }
    const updatedReference = this.reference(reference.workspaceId, response.path, {
      contentSha: response.sha,
      size: response.size,
      mimeType: reference.mimeType,
      createdAt: reference.createdAt,
      updatedAt: Date.now(),
      origin: reference.origin,
    });
    return {
      reference: updatedReference,
      content: new Blob([decodeBase64(response.content)], { type: updatedReference.mimeType }),
    };
  }

  async write(draft: ArtifactDraft): Promise<ArtifactReference> {
    const path = this.workspaceArtifactPath(draft.workspaceId, draft.path);
    const content = typeof draft.content === "string"
      ? new Blob([draft.content], { type: draft.mimeType })
      : draft.content;
    if (content.size > this.maxUploadSize) {
      throw new Error(`Artifact exceeds the ${this.maxUploadSize} byte GitHub storage limit`);
    }

    const payload: Record<string, string> = {
      message: `Store artifact ${path}`,
      content: await encodeBase64(content),
      branch: this.config.branch,
    };
    if (draft.expectedRevision) payload.sha = draft.expectedRevision;

    const response = await this.github<GitHubWriteResponse>(
      `/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}/contents/${encodePath(path)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return this.reference(draft.workspaceId, response.content.path, {
      contentSha: response.content.sha,
      revision: response.commit.sha,
      size: content.size,
      mimeType: draft.mimeType,
      origin: draft.origin,
    });
  }

  async resolve(workspaceId: string, artifactId: string): Promise<ArtifactReference | null> {
    const artifacts = await this.list(workspaceId);
    return artifacts.find((artifact) => artifact.id === artifactId) ?? null;
  }

  private workspacePath(workspaceId: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(workspaceId)) {
      throw new Error("Workspace IDs may only contain letters, numbers, hyphens, and underscores");
    }
    return `${this.root}/${workspaceId}`;
  }

  private workspaceArtifactPath(workspaceId: string, relativePath: string): string {
    const normalised = trimSlashes(relativePath);
    if (!normalised || normalised.split("/").some((part) => part === "." || part === "..")) {
      throw new Error("Artifact paths must be non-empty relative paths without traversal segments");
    }
    return `${this.workspacePath(workspaceId)}/${normalised}`;
  }

  private assertReference(reference: ArtifactReference): string {
    if (reference.repositoryId !== this.id) {
      throw new Error("Artifact reference belongs to a different repository");
    }
    const permittedPrefix = `${this.workspacePath(reference.workspaceId)}/`;
    if (!reference.path.startsWith(permittedPrefix)) {
      throw new Error("Artifact reference is outside its permitted workspace path");
    }
    return reference.path;
  }

  private reference(
    workspaceId: string,
    path: string,
    overrides: Partial<ArtifactReference> = {},
  ): ArtifactReference {
    const now = Date.now();
    const contentSha = overrides.contentSha;
    return {
      id: `${workspaceId}:${contentSha ?? path}`,
      repositoryId: this.id,
      workspaceId,
      path,
      name: path.split("/").pop() ?? path,
      mimeType: overrides.mimeType ?? "application/octet-stream",
      size: overrides.size ?? 0,
      contentSha,
      revision: overrides.revision,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      origin: overrides.origin,
    };
  }

  private async github<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 409 || response.status === 422) {
        throw new Error(`GitHub artifact write conflict: ${detail}`);
      }
      throw new Error(`GitHub artifact request failed (${response.status}): ${detail}`);
    }
    return response.json() as Promise<T>;
  }
}
