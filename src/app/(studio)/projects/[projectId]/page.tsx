import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireOwnerSession } from "@/auth/server-session";
import { db } from "@/db/client";
import { assetVersions } from "@/db/schema/assets";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { ProjectHistory } from "@/features/projects/application/project-history";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { ProjectEditor } from "@/features/projects/ui/project-editor";
import { variantSourcePath } from "@/features/assets/application/variant-switch";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requireOwnerSession();
  const { projectId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) notFound();
  const state = await new ProjectHistory(new DrizzleProjectRepository()).load(session.user.id, projectId);
  if (!state) notFound();
  const asset = await new DrizzleAssetRepository().getAsset(state.project.assetId, session.user.id);
  if (!asset) notFound();
  const [version] = await db.select({ storageKey: assetVersions.storageKey }).from(assetVersions).where(and(eq(assetVersions.id, state.project.assetVersionId), eq(assetVersions.assetId, asset.id)));
  if (!version) notFound();
  const retained = asset.retainedFiles?.find((file) => file.storageKey === version.storageKey);
  const model = {
    modelUrl: `/api/assets/${asset.id}/file?key=${encodeURIComponent(version.storageKey)}`,
    primaryRelativePath: retained?.relativePath ?? variantSourcePath(version.storageKey) ?? "model.glb",
    files: asset.files.map(({ relativePath, storageKey }) => ({ relativePath, storageKey })),
  };
  return <ProjectEditor initialState={state} assetName={asset.name} model={model} />;
}
