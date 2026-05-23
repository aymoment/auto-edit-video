import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { AppSettings } from "@auto-editor/shared";
import { SettingsService } from "./services/settings.service";
import { Request } from "express";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@Req() req: Request) {
    const settings = await this.settingsService.getSettings();
    const inferred = inferBaseUrl(req);
    if (!settings.publicBaseUrl && inferred) {
      return this.settingsService.updateSettings({ publicBaseUrl: inferred });
    }
    return settings;
  }

  @Post()
  async updateSettings(@Body() body: Partial<AppSettings>, @Req() req: Request) {
    const inferred = inferBaseUrl(req);
    const normalized = body.publicBaseUrl?.trim();
    const payload = !normalized && inferred ? { ...body, publicBaseUrl: inferred } : body;
    return this.settingsService.updateSettings(payload);
  }
}

function inferBaseUrl(req: Request) {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ||
    req.protocol ||
    "http";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ||
    req.get("host");
  if (!host) return "";
  return `${proto}://${host}`;
}
