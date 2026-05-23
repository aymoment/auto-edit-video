import React from "react";
import { Composition } from "remotion";
import { AutoCutVideo, calcDurationInFrames } from "./AutoCutVideo";
import { CropSettings, RenderSettings, Segment } from "@auto-editor/shared";

export const RemotionRoot: React.FC = () => {
  const defaultSegments: Segment[] = [];
  const fps = 30;

  return (
    <>
      <Composition
        id="AutoCutVideo"
        component={AutoCutVideo}
        durationInFrames={calcDurationInFrames(defaultSegments, fps)}
        fps={fps}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: "",
          segments: defaultSegments
        }}
        calculateMetadata={({ props }) => {
          const typed = props as {
            segments?: Segment[];
            videoWidth?: number;
            videoHeight?: number;
            crop?: CropSettings;
            renderSettings?: RenderSettings;
          };
          const segments = typed.segments ?? [];
          const width = Number.isFinite(typed.videoWidth) && typed.videoWidth ? typed.videoWidth : 1280;
          const height = Number.isFinite(typed.videoHeight) && typed.videoHeight ? typed.videoHeight : 720;
          const renderSettings = typed.renderSettings;
          const resolved = resolveRenderDimensions(width, height, typed.crop, renderSettings);
          const targetFps = renderSettings?.fps ?? fps;
          return {
            durationInFrames: calcDurationInFrames(segments, targetFps),
            fps: targetFps,
            width: resolved.width,
            height: resolved.height
          };
        }}
      />
    </>
  );
};

function resolveRenderDimensions(
  width: number,
  height: number,
  crop?: CropSettings,
  renderSettings?: RenderSettings
) {
  const targetHeight = renderSettings?.height ?? 1080;
  const ratio = crop?.mode === "ratio" && crop.ratio ? parseRatio(crop.ratio) : null;
  const aspect = ratio ?? width / height;
  const resolvedWidth = ensureEven(Math.round(targetHeight * aspect));
  const resolvedHeight = ensureEven(targetHeight);
  return { width: resolvedWidth, height: resolvedHeight };
}

function parseRatio(value: string) {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.length !== 2) return null;
  if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[1] === 0) return null;
  return parts[0] / parts[1];
}

function ensureEven(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 2;
  return value % 2 === 0 ? value : value + 1;
}
