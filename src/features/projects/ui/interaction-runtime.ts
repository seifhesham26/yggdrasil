import type { ProjectSnapshot } from "../domain/project-state";

type Interaction = ProjectSnapshot["interactions"][number];

export function matchingInteractions(interactions: Interaction[], partId: string, trigger: Interaction["trigger"]): Interaction[] {
  return interactions.filter((interaction) => interaction.targetNodeId === partId && interaction.trigger === trigger);
}

export function interactionWarnings(interactions: Interaction[], parts: Array<{ id: string; name: string }>): string[] {
  const ids = new Set(parts.map((part) => part.id));
  const warnings: string[] = [];
  for (const interaction of interactions) {
    if (!ids.has(interaction.targetNodeId)) warnings.push(`Interaction ${interaction.id} targets a missing part: ${interaction.targetNodeId}.`);
    if (interaction.action.type === "focus-camera" && !ids.has(interaction.action.cameraTargetId)) warnings.push(`Interaction ${interaction.id} has a missing camera target: ${interaction.action.cameraTargetId}.`);
  }
  return warnings;
}
