import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { AnalysisService } from "./services/analysis.service";
import { RenderService } from "./services/render.service";
import { SettingsService } from "./services/settings.service";
import { SettingsController } from "./settings.controller";
import { UploadService } from "./services/upload.service";

@Module({
  controllers: [ProjectsController, SettingsController],
  providers: [ProjectsService, AnalysisService, RenderService, SettingsService, UploadService]
})
export class ProjectsModule {}
