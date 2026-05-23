import path from "path";
import { promises as fs } from "fs";

const workspaceRoot = path.resolve(process.cwd(), "..", "..");
const uploadsRoot = path.join(workspaceRoot, "data", "uploads");

export async function ensureUploadsDir(projectId: string) {
  const dir = path.join(uploadsRoot, projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getProjectUploadDir(projectId: string) {
  return path.join(uploadsRoot, projectId);
}

export function getVideoPath(projectId: string) {
  return path.join(uploadsRoot, projectId, "input.mp4");
}

export function getAudioPath(projectId: string) {
  return path.join(uploadsRoot, projectId, "audio.mp3");
}

export function getRenderPath(projectId: string) {
  return path.join(uploadsRoot, projectId, "output.mp4");
}

export function getThumbnailPath(projectId: string) {
  return path.join(uploadsRoot, projectId, "thumbnail.jpg");
}

export function getTranscriptRawPath(projectId: string) {
  return path.join(uploadsRoot, projectId, "transcript.raw.json");
}
