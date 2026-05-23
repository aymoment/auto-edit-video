import React from "react";
import { AbsoluteFill, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CropSettings, Segment, SubtitleStyle } from "@auto-editor/shared";

export function AutoCutVideo({
  videoSrc,
  segments,
  subtitleStyle,
  crop
}: {
  videoSrc: string;
  segments: Segment[];
  subtitleStyle?: SubtitleStyle;
  crop?: CropSettings;
}) {
  let cursor = 0;
  const { fps } = useVideoConfig();
  const style = resolveSubtitleStyle(subtitleStyle);
  const videoFit = crop?.mode === "ratio" ? "cover" : "contain";

  return (
    <>
      {segments
        .filter((segment) => segment.selected)
        .map((segment) => {
          const durationInFrames = msToFrames(segment.durationMs, fps);
          const startFrom = msToFrames(segment.startMs, fps);
          const from = cursor;
          cursor += durationInFrames;
          const subtitleText =
            segment.type === "speech" ? (segment.editedText ?? segment.text).trim() : "";
          return (
            <Sequence key={segment.id} from={from} durationInFrames={durationInFrames}>
              <AbsoluteFill>
                <Video
                  src={videoSrc}
                  startFrom={startFrom}
                  style={{ width: "100%", height: "100%", objectFit: videoFit, backgroundColor: "black" }}
                />
                {subtitleText ? (
                  <Subtitle text={subtitleText} style={style} durationInFrames={durationInFrames} />
                ) : null}
              </AbsoluteFill>
            </Sequence>
          );
        })}
    </>
  );
}

export function calcDurationInFrames(segments: Segment[], fps: number) {
  const totalMs = segments
    .filter((segment) => segment.selected)
    .reduce((acc, segment) => acc + segment.durationMs, 0);
  return Math.max(1, msToFrames(totalMs, fps));
}

function msToFrames(ms: number, fps: number) {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
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
};

function resolveSubtitleStyle(style?: SubtitleStyle): SubtitleStyle {
  if (!style) return DEFAULT_SUBTITLE_STYLE;
  return { ...DEFAULT_SUBTITLE_STYLE, ...style };
}

function Subtitle({
  text,
  style,
  durationInFrames
}: {
  text: string;
  style: SubtitleStyle;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { animation, animationInFrames, animationOutFrames } = style;
  const inFrames = Math.max(1, animationInFrames);
  const outFrames = Math.max(1, animationOutFrames);
  const enterProgress = interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: "clamp" });
  const exitStart = Math.max(0, durationInFrames - outFrames);
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const progress = Math.min(enterProgress, exitProgress);
  const { opacity, translateY, scale } = getAnimationStyles(animation, progress);

  return (
    <div
      style={{
        position: "absolute",
        bottom: `${style.positionBottomPercent}%`,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        padding: "0 6%",
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`
      }}
    >
      <div
        style={{
          color: style.textColor,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          lineHeight: 1.4,
          padding: "10px 18px",
          backgroundColor: applyAlpha(style.backgroundColor, style.backgroundOpacity),
          borderRadius: 10,
          textAlign: "center",
          textShadow: `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px ${style.shadowColor}`,
          WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined
        }}
      >
        {text}
      </div>
    </div>
  );
}

function getAnimationStyles(animation: SubtitleStyle["animation"], progress: number) {
  switch (animation) {
    case "fade":
      return { opacity: progress, translateY: 0, scale: 1 };
    case "slide-up":
      return { opacity: progress, translateY: (1 - progress) * 18, scale: 1 };
    case "slide-down":
      return { opacity: progress, translateY: (progress - 1) * 18, scale: 1 };
    case "scale":
      return { opacity: progress, translateY: 0, scale: 0.92 + 0.08 * progress };
    case "none":
    default:
      return { opacity: 1, translateY: 0, scale: 1 };
  }
}

function applyAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  if (normalized === "transparent") return "transparent";
  if (normalized.startsWith("rgba") || normalized.startsWith("hsla")) return normalized;
  if (normalized.startsWith("rgb") || normalized.startsWith("hsl")) return normalized;
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const value = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return normalized;
}
