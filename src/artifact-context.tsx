import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ArtifactReference, ArtifactRepository, Workspace } from "../shared/workspaces";
import type { EnvConfig } from "../shared/types";
import { BrowserArtifactRepository } from "./storage/browser-artifacts";
import { GitHubArtifactRepository } from "./storage/github-artifacts";
import type { Settings } from "./storage/settings";
import { getWorkspace, putWorkspace } from "./storage/workspaces";

interface ArtifactContextValue {
  repository: ArtifactRepository;
  workspace: Workspace | null;
  artifacts: ArtifactReference[];
  refreshArtifacts(): Promise<void>;
}

const ArtifactContext = createContext<ArtifactContextValue | null>(null);
const DEFAULT_WORKSPACE_ID = "default";

export function ArtifactProvider({
  children,
  settings,
  envConfig,
}: {
  children: React.ReactNode;
  settings: Settings;
  envConfig?: EnvConfig | null;
}) {
  const repository = useMemo<ArtifactRepository>(() => {
    const config = envConfig?.githubArtifactStorage;
    const token = settings.mcpServers.github?.token;
    return config && token
      ? new GitHubArtifactRepository({ ...config, proxyUrl: "/api/artifacts/github" }, token)
      : new BrowserArtifactRepository();
  }, [envConfig?.githubArtifactStorage, settings.mcpServers.github?.token]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactReference[]>([]);

  const refreshArtifacts = async () => {
    if (!workspace) return;
    setArtifacts(await repository.list(workspace.id));
  };

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const existing = await getWorkspace(DEFAULT_WORKSPACE_ID);
      const now = Date.now();
      const activeWorkspace = existing ?? {
        id: DEFAULT_WORKSPACE_ID,
        title: "Default workspace",
        status: "active" as const,
        createdAt: now,
        updatedAt: now,
      };
      if (!existing) await putWorkspace(activeWorkspace);
      await repository.initializeWorkspace(activeWorkspace);
      const storedArtifacts = await repository.list(activeWorkspace.id);
      if (!cancelled) {
        setWorkspace(activeWorkspace);
        setArtifacts(storedArtifacts);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const value = useMemo(() => ({ repository, workspace, artifacts, refreshArtifacts }), [artifacts, repository, workspace]);
  return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
}

export function useArtifacts(): ArtifactContextValue {
  const context = useContext(ArtifactContext);
  if (!context) throw new Error("useArtifacts must be used within ArtifactProvider");
  return context;
}