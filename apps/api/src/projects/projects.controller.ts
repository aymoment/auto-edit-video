import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ProjectsService } from "./projects.service";
import { AnalysisSettings, CropSettings, RenderSettings, Segment } from "@auto-editor/shared";
import { getAudioPath, getRenderPath, getThumbnailPath, getVideoPath } from "./file.paths";
import { promises as fs } from "fs";
import path from "path";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async list() {
    return this.projectsService.listProjects();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const project = await this.projectsService.getProject(id);
    if (!project) throw new BadRequestException("Project not found");
    return project;
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: {
        fileSize: 1024 * 1024 * 1024 * 2
      }
    })
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>
  ) {
    if (!file) throw new BadRequestException("Missing file");
    const settings = parseSettings(body);
    const renderSettings = parseRenderSettings(body);
    return this.projectsService.createProject(file, settings, body.title, renderSettings);
  }

  @Patch(":id/segments")
  async updateSegments(
    @Param("id") id: string,
    @Body("segments") segments: Segment[]
  ) {
    if (!segments) throw new BadRequestException("Missing segments");
    const project = await this.projectsService.updateSegments(id, segments);
    if (!project) throw new BadRequestException("Project not found");
    return project;
  }

  @Post(":id/reanalyze")
  async reanalyze(@Param("id") id: string, @Body() body: Record<string, string>) {
    const settings = parseSettings(body);
    const project = await this.projectsService.reanalyze(id, settings);
    if (!project) throw new BadRequestException("Project not found");
    return project;
  }

  @Post(":id/render")
  async render(@Param("id") id: string) {
    const result = await this.projectsService.render(id);
    if (!result) throw new BadRequestException("Project not found");
    return result;
  }

  @Patch(":id")
  async updateTitle(@Param("id") id: string, @Body("title") title?: string) {
    if (!title) throw new BadRequestException("Missing title");
    const project = await this.projectsService.updateTitle(id, title);
    if (!project) throw new BadRequestException("Project not found");
    return project;
  }

  @Patch(":id/crop")
  async updateCrop(@Param("id") id: string, @Body("crop") crop?: CropSettings) {
    if (!crop) throw new BadRequestException("Missing crop");
    const project = await this.projectsService.updateCrop(id, crop);
    if (!project) throw new BadRequestException("Project not found");
    return project;
  }

  @Patch(":id/render-settings")
  async updateRenderSettings(
    @Param("id") id: string,
    @Body("renderSettings") renderSettings?: RenderSettings
  ) {
    if (!renderSettings) throw new BadRequestException("Missing render settings");
    const project = await this.projectsService.updateRenderSettings(id, renderSettings);
    if (!project) throw new BadRequestException("Project not found");
    return project;
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const project = await this.projectsService.deleteProject(id);
    if (!project) throw new BadRequestException("Project not found");
    return { ok: true };
  }

  @Get(":id/video")
  async video(@Param("id") id: string, @Res() res: Response) {
    const videoPath = getVideoPath(id);
    return res.sendFile(videoPath);
  }

  @Get(":id/audio")
  async audio(@Param("id") id: string, @Res() res: Response) {
    const audioPath = getAudioPath(id);
    return res.sendFile(audioPath);
  }

  @Get(":id/output")
  async output(@Param("id") id: string, @Res() res: Response) {
    const outputPath = getRenderPath(id);
    try {
      await fs.access(outputPath);
      const project = await this.projectsService.getProject(id);
      const filename = buildDownloadName(project?.title, "video", "mp4");
      return res.download(outputPath, filename);
    } catch {
      return res.status(404).end();
    }
  }

  @Get(":id/thumbnail")
  async thumbnail(@Param("id") id: string, @Res() res: Response) {
    const thumbnailPath = getThumbnailPath(id);
    try {
      await fs.access(thumbnailPath);
      return res.sendFile(thumbnailPath);
    } catch {
      return res.status(404).end();
    }
  }

  @Get(":id/subtitles")
  async subtitles(@Param("id") id: string, @Query("format") format = "srt", @Res() res: Response) {
    const result = await this.projectsService.getSubtitles(id, format as "srt" | "vtt" | "txt");
    if (!result) throw new BadRequestException("Project not found");
    const filename = buildDownloadName(result.title, "subtitles", result.ext);
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(result.content);
  }
}

function parseSettings(body: Record<string, string>): Partial<AnalysisSettings> | undefined {
  const silence = body.silenceThresholdMs ? Number(body.silenceThresholdMs) : undefined;
  const duplicate = body.duplicateSimilarity ? Number(body.duplicateSimilarity) : undefined;

  if (silence === undefined && duplicate === undefined) return undefined;

  return {
    silenceThresholdMs: Number.isFinite(silence) ? silence : undefined,
    duplicateSimilarity: Number.isFinite(duplicate) ? duplicate : undefined
  };
}

function parseRenderSettings(body: Record<string, string>): RenderSettings | undefined {
  const fps = body.renderFps ? Number(body.renderFps) : undefined;
  const height = body.renderHeight ? Number(body.renderHeight) : undefined;
  const quality = body.renderQuality?.trim();

  const validFps = fps === 30 || fps === 60 ? fps : undefined;
  const validHeight = height === 720 || height === 1080 || height === 1440 ? height : undefined;
  const validQuality = quality === "standard" || quality === "high" || quality === "ultra" ? quality : undefined;

  if (!validFps || !validHeight || !validQuality) return undefined;
  return {
    fps: validFps,
    height: validHeight,
    quality: validQuality
  };
}

function buildDownloadName(title: string | undefined, fallback: string, ext: string) {
  const base = title ? path.parse(title).name : fallback;
  const safeBase = sanitizeFilename(base) || fallback;
  const stamp = formatTimestamp(new Date());
  return `${safeBase}_${stamp}.${ext}`;
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80);
}

function formatTimestamp(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}
