import { useEffect } from "react";
import { useAui } from "@assistant-ui/react";
import type { ArtifactRepository } from "../shared/workspaces";

export function useArtifactTools(
  repository: ArtifactRepository,
  workspaceId?: string,
  agentTools?: string[],
) {
  const aui = useAui();
  const enabled = !agentTools || agentTools.length === 0 || agentTools.some((tool) => tool === "artifact_list" || tool === "artifact_read");

  useEffect(() => {
    if (!workspaceId || !enabled) return;
    const tools = {
      artifact_list: {
        description: "List artifacts in the active workspace. Use this to discover available files before reading one.",
        parameters: { type: "object", properties: {} },
        execute: async () => (await repository.list(workspaceId)).map((artifact) => ({
          id: artifact.id,
          name: artifact.name,
          path: artifact.path,
          mimeType: artifact.mimeType,
          size: artifact.size,
          revision: artifact.revision,
        })),
      },
      artifact_read: {
        description: "Read a text artifact from the active workspace by artifact ID. Use artifact_list first when you do not know the ID.",
        parameters: {
          type: "object",
          properties: { artifactId: { type: "string", description: "Artifact ID returned by artifact_list" } },
          required: ["artifactId"],
        },
        execute: async ({ artifactId }: { artifactId: string }) => {
          const reference = await repository.resolve(workspaceId, artifactId);
          if (!reference) return { error: `Artifact not found: ${artifactId}` };
          const content = await repository.read(reference);
          if (!content.reference.mimeType.startsWith("text/") && content.reference.mimeType !== "application/json") {
            return { error: `Artifact ${reference.name} is not a supported text artifact` };
          }
          return {
            id: reference.id,
            path: reference.path,
            mimeType: reference.mimeType,
            text: await content.content.text(),
          };
        },
      },
    };
    return aui.modelContext().register({ getModelContext: () => ({ tools }) });
  }, [aui, enabled, repository, workspaceId]);
}