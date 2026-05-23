export type SegmentType = "speech" | "silence";

export type Segment = {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  text: string;
  type: SegmentType;
  selected: boolean;
  reason?: "silence" | "duplicate" | "manual";
  editedText?: string;
};

export type ProjectStatus = "draft" | "parsed" | "rendering" | "completed" | "failed";

export type CropMode = "original" | "ratio" | "free";

export type CropSettings = {
  mode: CropMode;
  ratio?: string;
};

export type RenderFps = 30 | 60;
export type RenderResolution = 720 | 1080 | 1440;
export type RenderQuality = "standard" | "high" | "ultra";

export type RenderSettings = {
  fps: RenderFps;
  height: RenderResolution;
  quality: RenderQuality;
};

export type Project = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  videoPath: string;
  audioPath: string;
  segments: Segment[];
  totalDurationMs: number;
  thumbnailPath?: string;
  outputPath?: string;
  transcriptRaw?: unknown;
  transcriptRawPath?: string;
  crop?: CropSettings;
  renderSettings?: RenderSettings;
  settings: {
    silenceThresholdMs: number;
    duplicateSimilarity: number;
  };
};

export type AnalysisSettings = {
  silenceThresholdMs: number;
  duplicateSimilarity: number;
};

export type SubtitleAnimation = "none" | "fade" | "slide-up" | "slide-down" | "scale";

export type SubtitleStyle = {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  positionBottomPercent: number;
  animation: SubtitleAnimation;
  animationInFrames: number;
  animationOutFrames: number;
};

export type TranscribeProvider = "mock" | "volcengine";

export type VolcengineSettings = {
  submitEndpoint: string;
  queryEndpoint: string;
  apiKey: string;
  appKey?: string;
  accessKey?: string;
  resourceId: string;
};

export type AppSettings = AnalysisSettings & {
  transcribeProvider: TranscribeProvider;
  publicBaseUrl: string;
  uploadProvider: "uguu" | "public";
  uploadEndpoint?: string;
  volcengine: VolcengineSettings;
  subtitleStyle?: SubtitleStyle;
};

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptResult = {
  language?: string;
  segments: TranscriptSegment[];
};

export type DuplicateGroup = {
  primaryId: string;
  duplicateIds: string[];
};
