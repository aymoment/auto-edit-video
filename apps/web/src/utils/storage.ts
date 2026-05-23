import type { CropSettings, Project, RenderSettings, Segment, Settings } from "@/types";
import { defaultSettings } from "@/types";

const SETTINGS_KEY = "auto-editor-settings";

export const apiBase = resolveApiBase();

function resolveApiBase() {
  const envBase = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE;
  if (envBase) return envBase;
  if (typeof window === "undefined") return "http://localhost:4000/api";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:4000/api";
  }
  return `${window.location.origin}/api`;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getProjects(): Promise<Project[]> {
  return fetchJson<Project[]>(`${apiBase}/projects`);
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    return await fetchJson<Project>(`${apiBase}/projects/${projectId}`);
  } catch {
    return null;
  }
}

export async function createProject(
  file: File,
  settings: Settings,
  renderSettings?: RenderSettings
): Promise<Project> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", file.name);
  formData.append("silenceThresholdMs", String(settings.silenceThresholdMs));
  formData.append("duplicateSimilarity", String(settings.duplicateSimilarity));
  if (renderSettings) {
    formData.append("renderFps", String(renderSettings.fps));
    formData.append("renderHeight", String(renderSettings.height));
    formData.append("renderQuality", renderSettings.quality);
  }
  return fetchJson<Project>(`${apiBase}/projects`, {
    method: "POST",
    body: formData
  });
}

export async function updateSegments(projectId: string, segments: Segment[]): Promise<Project> {
  return fetchJson<Project>(`${apiBase}/projects/${projectId}/segments`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments })
  });
}

export async function reanalyzeProject(projectId: string, settings: Settings): Promise<Project> {
  return fetchJson<Project>(`${apiBase}/projects/${projectId}/reanalyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      silenceThresholdMs: settings.silenceThresholdMs,
      duplicateSimilarity: settings.duplicateSimilarity
    })
  });
}

export async function renderProject(projectId: string): Promise<{ outputPath: string } & { outputUrl?: string }> {
  return fetchJson<{ outputPath: string; outputUrl?: string }>(`${apiBase}/projects/${projectId}/render`, {
    method: "POST"
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await fetchJson(`${apiBase}/projects/${projectId}`, { method: "DELETE" });
}

export async function updateProjectTitle(projectId: string, title: string): Promise<Project> {
  return fetchJson<Project>(`${apiBase}/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
}

export async function updateProjectCrop(projectId: string, crop: CropSettings): Promise<Project> {
  return fetchJson<Project>(`${apiBase}/projects/${projectId}/crop`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crop })
  });
}

export async function updateProjectRenderSettings(
  projectId: string,
  renderSettings: RenderSettings
): Promise<Project> {
  return fetchJson<Project>(`${apiBase}/projects/${projectId}/render-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ renderSettings })
  });
}

export async function getSettings(): Promise<Settings> {
  const cached = localStorage.getItem(SETTINGS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Settings;
      return {
        ...defaultSettings,
        ...parsed,
        volcengine: {
          ...defaultSettings.volcengine,
          ...(parsed.volcengine ?? {})
        }
      };
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
    }
  }

  try {
    const settings = await fetchJson<Settings>(`${apiBase}/settings`);
    const merged: Settings = {
      ...defaultSettings,
      ...settings,
      volcengine: { ...defaultSettings.volcengine, ...(settings.volcengine ?? {}) }
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const merged: Settings = {
    ...defaultSettings,
    ...settings,
    volcengine: { ...defaultSettings.volcengine, ...(settings.volcengine ?? {}) }
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  try {
    const saved = await fetchJson<Settings>(`${apiBase}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged)
    });
    const finalSettings: Settings = {
      ...defaultSettings,
      ...saved,
      volcengine: { ...defaultSettings.volcengine, ...(saved.volcengine ?? {}) }
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(finalSettings));
    return finalSettings;
  } catch {
    return merged;
  }
}

export function getVideoUrl(projectId: string) {
  return `${apiBase}/projects/${projectId}/video`;
}

export function getThumbnailUrl(projectId: string) {
  return `${apiBase}/projects/${projectId}/thumbnail`;
}

export function getOutputUrl(projectId: string) {
  return `${apiBase}/projects/${projectId}/output`;
}

export function getSubtitleUrl(projectId: string, format: "srt" | "vtt" | "txt") {
  return `${apiBase}/projects/${projectId}/subtitles?format=${format}`;
}
