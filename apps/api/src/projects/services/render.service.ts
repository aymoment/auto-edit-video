import { Injectable } from "@nestjs/common";
import path from "path";
import { promises as fs } from "fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Project } from "@auto-editor/shared";
import { SettingsService } from "./settings.service";
import { getRenderPath } from "../file.paths";
import { spawn } from "child_process";

const workspaceRoot = path.resolve(process.cwd(), "..", "..");
const entryPoint = path.join(workspaceRoot, "apps", "render", "src", "index.tsx");

@Injectable()
export class RenderService {
  private bundleLocation: string | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async renderProject(project: Project) {
    if (!this.bundleLocation) {
      this.bundleLocation = await bundle(entryPoint);
    }

    const serveUrl = this.bundleLocation;
    const settings = await this.settingsService.getSettings();
    const baseUrl =
      settings.publicBaseUrl ||
      process.env.PUBLIC_BASE_URL ||
      "http://localhost:4000";
    const binariesDirectory = await resolveBinariesDirectory();
    const renderSettings = project.renderSettings ?? { fps: 30, height: 1080, quality: "standard" };
    const inputProps: Record<string, unknown> = {
      videoSrc: `${stripTrailingSlash(baseUrl)}/api/projects/${project.id}/video`,
      segments: project.segments,
      renderSettings
    };
    if (settings.subtitleStyle) {
      inputProps.subtitleStyle = settings.subtitleStyle;
    }
    if (project.crop) {
      inputProps.crop = project.crop;
    }
    const dimensions = await getVideoDimensions(project.videoPath);
    if (dimensions) {
      inputProps["videoWidth"] = dimensions.width;
      inputProps["videoHeight"] = dimensions.height;
    }

    const composition = await selectComposition({
      serveUrl,
      id: "AutoCutVideo",
      inputProps,
      binariesDirectory
    });

    const outputLocation = getRenderPath(project.id);

    await renderMediaWithAudioCodec({
      composition,
      serveUrl,
      outputLocation,
      inputProps,
      binariesDirectory,
      renderSettings
    });

    return outputLocation;
  }
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function resolveBinariesDirectory() {
  const envDir = process.env.REMOTION_BINARIES_DIR;
  if (envDir) {
    const prepared = await prepareBinariesDir(envDir);
    if (prepared) return prepared;
  }

  const systemFfmpeg = await findSystemFfmpeg();
  if (!systemFfmpeg) return null;

  const compositor = getCompositorBinary();
  if (!compositor) return null;

  const workspaceRoot = path.resolve(process.cwd(), "..", "..");
  const targetDir = path.join(workspaceRoot, "data", "remotion-binaries");
  const prepared = await prepareBinariesDir(targetDir, systemFfmpeg, compositor);
  return prepared;
}

async function hasFfmpeg(dir: string) {
  try {
    await fs.access(path.join(dir, "ffmpeg"));
    await fs.access(path.join(dir, "ffprobe"));
    return true;
  } catch {
    return false;
  }
}

async function renderMediaWithAudioCodec({
  composition,
  serveUrl,
  outputLocation,
  inputProps,
  binariesDirectory,
  renderSettings
}: {
  composition: Parameters<typeof renderMedia>[0]["composition"];
  serveUrl: string;
  outputLocation: string;
  inputProps: Record<string, unknown>;
  binariesDirectory: string | null;
  renderSettings: { fps: number; height: number; quality: string };
}) {
  const tempOutput = outputLocation.replace(/\.mp4$/i, ".tmp.mov");
  const videoBitrate = resolveVideoBitrate(renderSettings);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "pcm-16",
    outputLocation: tempOutput,
    inputProps,
    videoBitrate,
    binariesDirectory,
    chromiumOptions: {
      disableWebSecurity: true
    }
  });

  try {
    await reencodeAudioToAac(tempOutput, outputLocation, binariesDirectory);
  } catch {
    await fs.copyFile(tempOutput, outputLocation);
  } finally {
    await fs.unlink(tempOutput).catch(() => null);
  }
}

function resolveVideoBitrate(renderSettings: { fps: number; height: number; quality: string }) {
  const baseByHeight: Record<number, number> = {
    720: 4,
    1080: 8,
    1440: 12
  };
  const base = baseByHeight[renderSettings.height] ?? 8;
  const fpsFactor = renderSettings.fps >= 60 ? 1.5 : 1;
  const qualityFactor =
    renderSettings.quality === "ultra" ? 1.6 : renderSettings.quality === "high" ? 1.3 : 1;
  const bitrate = Math.round(base * fpsFactor * qualityFactor);
  return `${Math.max(2, bitrate)}M`;
}

async function findSystemFfmpeg() {
  const candidates = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  for (const dir of candidates) {
    if (await hasFfmpeg(dir)) {
      return {
        ffmpeg: path.join(dir, "ffmpeg"),
        ffprobe: path.join(dir, "ffprobe")
      };
    }
  }
  return null;
}

function getCompositorBinary() {
  try {
    if (process.platform === "darwin") {
      if (process.arch === "arm64") {
        return path.join(require("@remotion/compositor-darwin-arm64").dir, "remotion");
      }
      return path.join(require("@remotion/compositor-darwin-x64").dir, "remotion");
    }
    if (process.platform === "linux") {
      if (process.arch === "arm64") {
        return path.join(require("@remotion/compositor-linux-arm64-gnu").dir, "remotion");
      }
      return path.join(require("@remotion/compositor-linux-x64-gnu").dir, "remotion");
    }
    if (process.platform === "win32") {
      return path.join(require("@remotion/compositor-win32-x64-msvc").dir, "remotion.exe");
    }
  } catch {
    return null;
  }
  return null;
}

async function prepareBinariesDir(
  targetDir: string,
  systemFfmpeg?: { ffmpeg: string; ffprobe: string },
  compositorBinary?: string
) {
  try {
    await fs.mkdir(targetDir, { recursive: true });
    if (systemFfmpeg && compositorBinary) {
      await ensureLink(path.join(targetDir, "ffmpeg"), systemFfmpeg.ffmpeg);
      await ensureLink(path.join(targetDir, "ffprobe"), systemFfmpeg.ffprobe);
      const compositorTarget = path.join(targetDir, path.basename(compositorBinary));
      await ensureLink(compositorTarget, compositorBinary);
      if (path.basename(compositorBinary) !== "remotion") {
        await ensureLink(path.join(targetDir, "remotion"), compositorBinary);
      }
    }
    return targetDir;
  } catch {
    return null;
  }
}

async function ensureLink(linkPath: string, targetPath: string) {
  try {
    const existing = await fs.readlink(linkPath);
    if (existing === targetPath) return;
    await fs.unlink(linkPath);
  } catch {
    // ignore
  }
  try {
    await fs.symlink(targetPath, linkPath);
  } catch {
    // fallback to copy for environments that don't allow symlinks
    await fs.copyFile(targetPath, linkPath);
  }
}

async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const output = await runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      videoPath
    ]);
    const [width, height] = output
      .trim()
      .split("x")
      .map((value) => Number.parseInt(value, 10));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  } catch {
    return null;
  }
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
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
      if (code === 0) {
        resolve(stdout || stderr);
      } else {
        reject(new Error(`${command} failed: ${stderr}`));
      }
    });
  });
}

async function reencodeAudioToAac(inputPath: string, outputPath: string, binariesDirectory: string | null) {
  const ffmpeg = binariesDirectory ? path.join(binariesDirectory, "ffmpeg") : "ffmpeg";
  await runCommand(ffmpeg, [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath
  ]);
}
