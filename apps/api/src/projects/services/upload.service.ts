import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import path from "path";
import { SettingsService } from "./settings.service";

@Injectable()
export class UploadService {
  constructor(private readonly settingsService: SettingsService) {}

  async getAudioUrl(audioPath: string) {
    const settings = await this.settingsService.getSettings();
    const provider = settings.uploadProvider ?? "uguu";

    if (provider === "public") {
      const baseUrl = settings.publicBaseUrl || process.env.PUBLIC_BASE_URL;
      if (!baseUrl) {
        throw new Error("publicBaseUrl is required when uploadProvider=public.");
      }
      const projectId = extractProjectId(audioPath);
      if (!projectId) {
        throw new Error("Failed to infer project id from audio path.");
      }
      return `${stripTrailingSlash(baseUrl)}/api/projects/${projectId}/audio`;
    }

    if (provider === "uguu") {
      const endpoint = settings.uploadEndpoint || "https://uguu.se/upload";
      return uploadToUguu(audioPath, endpoint);
    }

    throw new Error(`Unknown uploadProvider: ${provider}`);
  }
}

async function uploadToUguu(filePath: string, endpoint: string) {
  const buffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  form.append("files[]", blob, filename);

  const response = await fetch(endpoint, {
    method: "POST",
    body: form
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Uguu upload failed: ${response.status} ${text}`);
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Uguu response is not JSON: ${text}`);
  }

  const files = (payload as { files?: Array<{ url?: string }> }).files;
  const url = files?.[0]?.url;
  if (!url) {
    throw new Error(`Uguu response missing url: ${text}`);
  }

  return url;
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractProjectId(audioPath: string) {
  const normalized = audioPath.split(path.sep);
  const uploadsIndex = normalized.lastIndexOf("uploads");
  if (uploadsIndex === -1) return null;
  return normalized[uploadsIndex + 1] ?? null;
}
