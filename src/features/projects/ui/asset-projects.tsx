"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ProjectItem = { id: string; name: string; activeStep: string; updatedAt: string };

async function fetchProjects(endpoint: string): Promise<ProjectItem[]> {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Projects could not be loaded. Retry.");
  return (await response.json()).projects;
}

export function AssetProjects({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const endpoint = `/api/assets/${assetId}/projects`;

  async function load() {
    try {
      setProjects(await fetchProjects(endpoint));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Projects could not be loaded. Retry."); }
  }

  useEffect(() => {
    let active = true;
    fetchProjects(endpoint).then((items) => { if (active) setProjects(items); }, (cause) => { if (active) setError(cause instanceof Error ? cause.message : "Projects could not be loaded. Retry."); });
    return () => { active = false; };
  }, [endpoint]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "The project could not be created. Retry.");
      router.push(`/projects/${result.project.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The project could not be created. Retry."); }
    finally { setCreating(false); }
  }

  return <section className="asset-projects" aria-labelledby="asset-projects-heading"><div className="asset-projects-head"><div><p className="section-kicker">Presentation projects</p><h2 id="asset-projects-heading">Create a world for this model</h2></div><button type="button" className="primary-button" onClick={() => void create()} disabled={creating}>{creating ? "Creating…" : "Create project"}</button></div>
    {error ? <div role="alert" className="project-save-error">{error} <button type="button" onClick={() => void load()}>Retry loading</button></div> : null}
    {projects === null ? <p>Loading projects…</p> : projects.length ? <ul>{projects.map((project) => <li key={project.id}><Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`}><strong>{project.name}</strong><span>{project.activeStep} · Updated {new Date(project.updatedAt).toLocaleDateString()}</span></Link></li>)}</ul> : <p>No projects yet.</p>}
  </section>;
}
