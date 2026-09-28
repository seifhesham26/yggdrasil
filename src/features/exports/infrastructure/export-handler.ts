import { auth } from "@/auth/auth";
import { createExportHandler } from "@/app/api/projects/[projectId]/exports/handler";
import { ProjectHistory } from "@/features/projects/application/project-history";
import { DrizzleProjectRepository } from "@/features/projects/infrastructure/project-repository";
import { ExportService } from "../application/export-service";
import { DrizzleExportRepository } from "./export-repository";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { serverEnv } from "@/lib/env/server";

export function exportHandler() {
  const storage = new LocalAssetStorage(serverEnv.YGGDRASIL_ASSET_ROOT);
  return createExportHandler({ getSession: (headers) => auth.api.getSession({ headers }), history: new ProjectHistory(new DrizzleProjectRepository()),
    service: new ExportService(new DrizzleExportRepository(), storage), storage });
}
