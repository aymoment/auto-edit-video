import { Injectable } from "@nestjs/common";
import { AppSettings } from "@auto-editor/shared";
import { promises as fs } from "fs";
import path from "path";

const DEFAULT_SETTINGS: AppSettings = {
  transcribeProvider: "volcengine",
  silenceThresholdMs: 500,
  duplicateSimilarity: 0.86,
  publicBaseUrl: "",
  uploadProvider: "uguu",
  uploadEndpoint: "https://uguu.se/upload",
  volcengine: {
    submitEndpoint: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
    queryEndpoint: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
    apiKey: "",
    appKey: "",
    accessKey: "",
    resourceId: "volc.seedasr.auc"
  },
  subtitleStyle: {
    fontSize: 40,
    fontFamily: "PingFang SC, Microsoft YaHei, Arial, sans-serif",
    fontWeight: 600,
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.6,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowColor: "#000000",
    shadowBlur: 6,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    positionBottomPercent: 6,
    animation: "fade",
    animationInFrames: 8,
    animationOutFrames: 8
  }
};

@Injectable()
export class SettingsService {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private loaded = false;
  private settingsPath = path.join(path.resolve(process.cwd(), "..", ".."), "data", "settings.json");

  async getSettings() {
    await this.ensureLoaded();
    return this.settings;
  }

  async updateSettings(partial: Partial<AppSettings>) {
    await this.ensureLoaded();
    const sanitized = sanitizeSettingsPartial(partial);
    this.settings = {
      ...this.settings,
      ...sanitized,
      volcengine: {
        ...this.settings.volcengine,
        ...sanitized.volcengine
      }
    };

    await this.persist();
    return this.settings;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.settingsPath, "utf-8");
      const parsed = JSON.parse(raw) as AppSettings;
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        volcengine: { ...DEFAULT_SETTINGS.volcengine, ...(parsed.volcengine ?? {}) }
      };
    } catch (error) {
      // ignore missing/invalid file; defaults will be used
    }
  }

  private async persist() {
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), "utf-8");
  }
}

function sanitizeSettingsPartial(partial: Partial<AppSettings>) {
  if (!partial.volcengine) return partial;

  const volcengineInput = partial.volcengine;
  const volcengine: Partial<AppSettings["volcengine"]> = {};
  if (volcengineInput.submitEndpoint !== undefined && volcengineInput.submitEndpoint.trim() !== "") {
    volcengine.submitEndpoint = volcengineInput.submitEndpoint.trim();
  }
  if (volcengineInput.queryEndpoint !== undefined && volcengineInput.queryEndpoint.trim() !== "") {
    volcengine.queryEndpoint = volcengineInput.queryEndpoint.trim();
  }
  if (volcengineInput.apiKey !== undefined && volcengineInput.apiKey.trim() !== "") {
    volcengine.apiKey = volcengineInput.apiKey.trim();
  }
  if (volcengineInput.appKey !== undefined && volcengineInput.appKey.trim() !== "") {
    volcengine.appKey = volcengineInput.appKey.trim();
  }
  if (volcengineInput.accessKey !== undefined && volcengineInput.accessKey.trim() !== "") {
    volcengine.accessKey = volcengineInput.accessKey.trim();
  }
  if (volcengineInput.resourceId !== undefined && volcengineInput.resourceId.trim() !== "") {
    volcengine.resourceId = volcengineInput.resourceId.trim();
  }

  return {
    ...partial,
    volcengine
  };
}
