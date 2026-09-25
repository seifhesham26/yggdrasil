"use client";

import dynamic from "next/dynamic";
import type { ProjectPresentation, ViewerFile } from "./model-canvas";

const ModelCanvas = dynamic(() => import("./model-canvas").then((module) => module.ModelCanvas), {
  ssr: false,
  loading: () => <div className="viewer-shell viewer-boot" role="progressbar" aria-label="Loading model">Loading model</div>,
});

export function ModelCanvasLoader(props: { modelUrl: string; primaryRelativePath: string; files: ViewerFile[]; presentation?: ProjectPresentation }) {
  return <ModelCanvas {...props} />;
}
