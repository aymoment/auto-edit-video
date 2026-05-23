import type {
  AppSettings,
  CropSettings as ApiCropSettings,
  Project as ApiProject,
  ProjectStatus as ApiProjectStatus,
  RenderSettings as ApiRenderSettings,
  Segment as ApiSegment
} from "@auto-editor/shared";

export type Segment = ApiSegment;
export type Project = ApiProject;
export type ProjectStatus = ApiProjectStatus;
export type Settings = AppSettings;
export type CropSettings = ApiCropSettings;
export type RenderSettings = ApiRenderSettings;

export const defaultSettings: Settings = {
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
