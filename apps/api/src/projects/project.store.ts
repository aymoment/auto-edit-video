import { promises as fs } from "fs";
import path from "path";
import { Project } from "@auto-editor/shared";

const workspaceRoot = path.resolve(process.cwd(), "..", "..");
const projectsDir = path.join(workspaceRoot, "data", "projects");

export async function ensureProjectsDir() {
  await fs.mkdir(projectsDir, { recursive: true });
}

export async function saveProject(project: Project) {
  await ensureProjectsDir();
  const filePath = path.join(projectsDir, `${project.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), "utf-8");
}

export async function loadProject(id: string): Promise<Project | null> {
  try {
    const filePath = path.join(projectsDir, `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Project;
  } catch (error) {
    return null;
  }
}

export async function listProjects(): Promise<Project[]> {
  await ensureProjectsDir();
  const files = await fs.readdir(projectsDir);
  const projects: Project[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(projectsDir, file), "utf-8");
    projects.push(JSON.parse(raw) as Project);
  }
  return projects;
}

export async function deleteProject(id: string) {
  try {
    const filePath = path.join(projectsDir, `${id}.json`);
    await fs.unlink(filePath);
  } catch {
    // ignore missing file
  }
}
