import { Injectable } from "@nestjs/common";
import crypto from "crypto";
import { promises as fs } from "fs";
import { AnalysisService } from "./services/analysis.service";
import { RenderService } from "./services/render.service";
import { SettingsService } from "./services/settings.service";
import { AnalysisSettings, CropSettings, Project, RenderSettings, Segment } from "@auto-editor/shared";
import { ensureUploadsDir, getAudioPath, getThumbnailPath, getTranscriptRawPath, getVideoPath } from "./file.paths";
import { loadProject, saveProject, listProjects, deleteProject as deleteProjectFile } from "./project.store";
import path from "path";
import { spawn } from "child_process";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly renderService: RenderService,
    private readonly settingsService: SettingsService
  ) {}

  async createProject(
    file: Express.Multer.File,
    settings?: Partial<AnalysisSettings>,
    title?: string,
    renderSettings?: RenderSettings
  ) {
    const projectId = crypto.randomUUID();
    await ensureUploadsDir(projectId);
    const videoPath = getVideoPath(projectId);
    const audioPath = getAudioPath(projectId);
    const thumbnailPath = getThumbnailPath(projectId);

    await fs.writeFile(videoPath, file.buffer);
    await this.generateThumbnail(videoPath, thumbnailPath);
    await this.analysisService.extractAudio(videoPath, audioPath);
    const defaults = await this.settingsService.getSettings();
    const { segments, transcriptRaw } = await this.analysisService.analyze(audioPath, settings);
    const transcriptRawPath = await persistTranscriptRaw(projectId, transcriptRaw);
    const now = new Date().toISOString();

    const project: Project = {
      id: projectId,
      title: title ?? file.originalname ?? "未命名项目",
      createdAt: now,
      updatedAt: now,
      status: "parsed",
      videoPath,
      audioPath,
      segments,
      totalDurationMs: calcSelectedDurationMs(segments),
      thumbnailPath,
      transcriptRaw,
      transcriptRawPath,
      crop: {
        mode: "original"
      },
      renderSettings: renderSettings ?? {
        fps: 30,
        height: 1080,
        quality: "standard"
      },
      settings: {
        silenceThresholdMs: settings?.silenceThresholdMs ?? defaults.silenceThresholdMs,
        duplicateSimilarity: settings?.duplicateSimilarity ?? defaults.duplicateSimilarity
      }
    };

    await saveProject(project);
    return project;
  }

  async listProjects() {
    const projects = await listProjects();
    const normalized = projects.map((project) => normalizeProject(project));
    return normalized.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string) {
    const project = await loadProject(id);
    if (!project) return null;
    return normalizeProject(project);
  }

  async updateSegments(id: string, segments: Segment[]) {
    const project = await loadProject(id);
    if (!project) return null;
    project.segments = segments;
    project.totalDurationMs = calcSelectedDurationMs(segments);
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    return normalizeProject(project);
  }

  async reanalyze(id: string, settings?: Partial<AnalysisSettings>) {
    const project = await loadProject(id);
    if (!project) return null;

    const audioPath = project.audioPath;
    try {
      await fs.access(audioPath);
    } catch (error) {
      await this.analysisService.extractAudio(project.videoPath, audioPath);
    }

    const mergedSettings = {
      silenceThresholdMs: settings?.silenceThresholdMs ?? project.settings.silenceThresholdMs,
      duplicateSimilarity: settings?.duplicateSimilarity ?? project.settings.duplicateSimilarity
    };
    const { segments, transcriptRaw } = await this.analysisService.analyze(audioPath, mergedSettings);
    const transcriptRawPath = await persistTranscriptRaw(project.id, transcriptRaw);
    project.segments = segments;
    project.transcriptRaw = transcriptRaw;
    project.transcriptRawPath = transcriptRawPath;
    project.settings = mergedSettings;
    project.totalDurationMs = calcSelectedDurationMs(segments);
    project.updatedAt = new Date().toISOString();
    project.status = "parsed";

    await saveProject(project);
    return normalizeProject(project);
  }

  async render(id: string) {
    const project = await loadProject(id);
    if (!project) return null;
    project.status = "rendering";
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    try {
      const outputPath = await this.renderService.renderProject(project);
      project.status = "completed";
      project.outputPath = outputPath;
      project.updatedAt = new Date().toISOString();
      await saveProject(project);
      return { outputPath };
    } catch (error) {
      project.status = "failed";
      project.updatedAt = new Date().toISOString();
      await saveProject(project);
      throw error;
    }
  }

  async updateTitle(id: string, title: string) {
    const project = await loadProject(id);
    if (!project) return null;
    project.title = title;
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    return normalizeProject(project);
  }

  async updateCrop(id: string, crop: CropSettings) {
    const project = await loadProject(id);
    if (!project) return null;
    project.crop = crop;
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    return normalizeProject(project);
  }

  async updateRenderSettings(id: string, renderSettings: RenderSettings) {
    const project = await loadProject(id);
    if (!project) return null;
    project.renderSettings = renderSettings;
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    return normalizeProject(project);
  }

  async deleteProject(id: string) {
    const project = await loadProject(id);
    if (!project) return null;
    const uploadDir = path.dirname(project.videoPath);
    await deleteProjectFile(id);
    await fs.rm(uploadDir, { recursive: true, force: true });
    return project;
  }

  async getSubtitles(id: string, format: SubtitleFormat) {
    const project = await loadProject(id);
    if (!project) return null;
    const normalized = normalizeProject(project);
    const result = buildSubtitles(normalized, normalizeSubtitleFormat(format));
    return {
      ...result,
      title: normalized.title
    };
  }

  private async generateThumbnail(videoPath: string, thumbnailPath: string) {
    try {
      await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
      await runCommand("ffmpeg", [
        "-y",
        "-ss",
        "0.5",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        thumbnailPath
      ]);
    } catch {
      // ignore thumbnail generation errors
    }
  }
}

function calcSelectedDurationMs(segments: Segment[]) {
  return segments.filter((segment) => segment.selected).reduce((acc, segment) => acc + segment.durationMs, 0);
}

function normalizeProject(project: Project): Project {
  const updatedAt = project.updatedAt ?? project.createdAt ?? new Date().toISOString();
  const status = project.status ?? (project.segments?.length ? "parsed" : "draft");
  const totalDurationMs =
    project.totalDurationMs ?? calcSelectedDurationMs(project.segments ?? []);

  return {
    ...project,
    updatedAt,
    status,
    totalDurationMs,
    crop: project.crop ?? { mode: "original" },
    renderSettings: project.renderSettings ?? { fps: 30, height: 1080, quality: "standard" }
  };
}

async function runCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout || stderr);
      else reject(new Error(`${command} failed: ${stderr}`));
    });
  });
}

async function persistTranscriptRaw(projectId: string, transcriptRaw: unknown): Promise<string | undefined> {
  const transcriptPath = getTranscriptRawPath(projectId);
  if (transcriptRaw === undefined) {
    await fs.rm(transcriptPath, { force: true });
    return undefined;
  }
  await fs.writeFile(transcriptPath, JSON.stringify(transcriptRaw, null, 2), "utf8");
  return transcriptPath;
}

type SubtitleFormat = "srt" | "vtt" | "txt";

type SubtitleCue = {
  startMs: number;
  endMs: number;
  text: string;
};

function buildSubtitles(project: Project, format: SubtitleFormat) {
  const cues = buildSubtitleCues(project.segments);
  if (format === "vtt") {
    return {
      content: buildVtt(cues),
      mime: "text/vtt",
      ext: "vtt"
    };
  }
  if (format === "txt") {
    return {
      content: cues.map((cue) => cue.text).join("\n"),
      mime: "text/plain",
      ext: "txt"
    };
  }
  return {
    content: buildSrt(cues),
    mime: "application/x-subrip",
    ext: "srt"
  };
}

function buildSubtitleCues(segments: Segment[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let cursorMs = 0;
  for (const segment of segments) {
    if (!segment.selected) continue;
    const duration = segment.durationMs;
    const text =
      segment.type === "speech" ? (segment.editedText ?? segment.text).trim() : "";
    if (text) {
      cues.push({
        startMs: cursorMs,
        endMs: cursorMs + duration,
        text
      });
    }
    cursorMs += duration;
  }
  return cues;
}

function buildSrt(cues: SubtitleCue[]) {
  return cues
    .map((cue, index) => {
      return `${index + 1}\n${formatTime(cue.startMs, ",")} --> ${formatTime(cue.endMs, ",")}\n${cue.text}\n`;
    })
    .join("\n")
    .trim();
}

function buildVtt(cues: SubtitleCue[]) {
  const lines = cues.map((cue) => {
    return `${formatTime(cue.startMs, ".")} --> ${formatTime(cue.endMs, ".")}\n${cue.text}\n`;
  });
  return `WEBVTT\n\n${lines.join("\n").trim()}`;
}

function formatTime(ms: number, separator: "," | ".") {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  const s = String(seconds).padStart(2, "0");
  const msPart = String(millis).padStart(3, "0");
  return `${h}:${m}:${s}${separator}${msPart}`;
}

function normalizeSubtitleFormat(format: SubtitleFormat) {
  if (format === "vtt" || format === "txt") return format;
  return "srt";
}
