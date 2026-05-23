import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Progress } from "@/app/components/ui/progress";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import {
  Settings as SettingsIcon,
  ArrowLeft,
  Upload,
  Play,
  Loader2,
  Film,
  GripVertical
} from "lucide-react";
import { SegmentItem } from "@/app/components/SegmentItem";
import { SegmentEditDialog } from "@/app/components/SegmentEditDialog";
import { defaultSettings, Project, RenderSettings, Segment, Settings } from "@/types";
import {
  createProject,
  deleteProject,
  getOutputUrl,
  getProject,
  getSubtitleUrl,
  getVideoUrl,
  reanalyzeProject,
  renderProject,
  updateProjectCrop,
  updateProjectRenderSettings,
  updateSegments
} from "@/utils/storage";
import { formatDuration, formatTime } from "@/utils/format";
import { toast } from "sonner";
import { Player } from "@remotion/player";
import { AutoCutVideo, calcDurationInFrames } from "@/remotion/AutoCutVideo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Input } from "@/app/components/ui/input";
import { Slider } from "@/app/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/app/components/ui/alert-dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

interface EditorPageProps {
  projectId?: string;
  onNavigateToHome: () => void;
  onSettingsOpen: () => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => Promise<Settings>;
}

function resolveOutputDimensions(
  width: number,
  height: number,
  crop: { mode: "original" | "ratio" | "free"; ratio?: string }
) {
  if (crop.mode === "original") return { width, height };
  if (crop.mode === "ratio" && crop.ratio) {
    const ratio = parseRatio(crop.ratio);
    if (!ratio) return { width, height };
    const current = width / height;
    if (current > ratio) {
      return { width: Math.round(height * ratio), height };
    }
    return { width, height: Math.round(width / ratio) };
  }
  return { width, height };
}

function resolveRenderDimensions(
  width: number,
  height: number,
  crop: { mode: "original" | "ratio" | "free"; ratio?: string },
  renderSettings: RenderSettings
) {
  const targetHeight = renderSettings.height;
  const ratio = crop.mode === "ratio" && crop.ratio ? parseRatio(crop.ratio) : null;
  const aspect = ratio ?? width / height;
  const resolvedWidth = ensureEven(Math.round(targetHeight * aspect));
  const resolvedHeight = ensureEven(targetHeight);
  return { width: resolvedWidth, height: resolvedHeight };
}

function resolveRenderBitrate(renderSettings: RenderSettings) {
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
  return `${Math.max(2, bitrate)} Mbps`;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAllText(text: string, source: string, target: string, ignoreCase: boolean) {
  if (!source) return text;
  if (!ignoreCase) return text.split(source).join(target);
  const regex = new RegExp(escapeRegExp(source), "gi");
  return text.replace(regex, target);
}

function highlightQuery(text: string, query: string, ignoreCase: boolean) {
  const normalized = query.trim();
  if (!normalized) return text;
  const regex = new RegExp(escapeRegExp(normalized), ignoreCase ? "gi" : "g");
  const nodes: Array<string | JSX.Element> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={`match-${match.index}-${match[0]}`} className="bg-yellow-200 text-yellow-900">
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length ? nodes : text;
}

export function EditorPage({
  projectId,
  onNavigateToHome,
  onSettingsOpen,
  settings,
  onSettingsChange
}: EditorPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [renderProgress, setRenderProgress] = useState(0);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [subtitleFormat, setSubtitleFormat] = useState<"srt" | "vtt" | "txt">("srt");
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [segmentTab, setSegmentTab] = useState<"all" | "selected" | "unselected">("all");
  const [subtitleStyleOpen, setSubtitleStyleOpen] = useState(false);
  const [subtitleDraft, setSubtitleDraft] = useState<NonNullable<Settings["subtitleStyle"]>>(
    settings.subtitleStyle ?? defaultSettings.subtitleStyle!
  );
  const [splitSegment, setSplitSegment] = useState<Segment | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const [splitInput, setSplitInput] = useState("");
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTab, setMergeTab] = useState<"all" | "selected" | "unselected">("all");
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTab, setMoveTab] = useState<"all" | "selected" | "unselected">("all");
  const [moveOrder, setMoveOrder] = useState<string[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [batchReplaceOpen, setBatchReplaceOpen] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchSource, setBatchSource] = useState("");
  const [batchTarget, setBatchTarget] = useState("");
  const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [batchIgnoreCase, setBatchIgnoreCase] = useState(false);
  const [cropUpdating, setCropUpdating] = useState(false);
  const [renderSettingsUpdating, setRenderSettingsUpdating] = useState(false);
  const [renderSettingsDraft, setRenderSettingsDraft] = useState<RenderSettings>({
    fps: 30,
    height: 1080,
    quality: "standard"
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setProject(null);
      setPendingFile(null);
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
        setLocalVideoUrl(null);
      }
      return;
    }
    getProject(projectId)
      .then((data) => {
        if (active) setProject(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (project?.renderSettings) {
      setRenderSettingsDraft(project.renderSettings);
    }
  }, [project?.id, project?.renderSettings]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("请上传视频文件");
      return;
    }

    if (project) {
      try {
        await deleteProject(project.id);
      } catch {
        // ignore cleanup failure
      }
      setProject(null);
    }
    setEditingSegment(null);
    setIsEditDialogOpen(false);
    setParseProgress(0);
    setRenderProgress(0);

    setPendingFile(file);
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
    }
    setLocalVideoUrl(URL.createObjectURL(file));
    toast.success("视频已选择，点击开始解析");
  };

  const handleParse = async () => {
    if (!pendingFile && !project) {
      toast.error("请先上传视频");
      return;
    }

    setIsParsing(true);
    setParseProgress(0);

    const progressInterval = window.setInterval(() => {
      setParseProgress((prev) => {
        if (prev >= 95) return prev;
        return prev + 5;
      });
    }, 250);

    try {
      if (pendingFile) {
        const created = await createProject(pendingFile, settings, renderSettingsDraft);
        setProject(created);
        setPendingFile(null);
        if (localVideoUrl) {
          URL.revokeObjectURL(localVideoUrl);
          setLocalVideoUrl(null);
        }
        setParseProgress(100);
        toast.success(`解析完成！识别到 ${created.segments.length} 个片段`);
      } else if (project) {
        const updated = await reanalyzeProject(project.id, settings);
        setProject(updated);
        setParseProgress(100);
        toast.success(`重新解析完成！识别到 ${updated.segments.length} 个片段`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "解析失败";
      toast.error(message);
    } finally {
      window.clearInterval(progressInterval);
      setIsParsing(false);
    }
  };

  const handleRender = async () => {
    if (!project?.segments.length) {
      toast.error("请先解析视频");
      return;
    }

    const selectedSegments = project.segments.filter((s) => s.selected);
    if (selectedSegments.length === 0) {
      toast.error("请至少选择一个片段");
      return;
    }

    setIsRendering(true);
    setRenderProgress(0);

    const progressInterval = window.setInterval(() => {
      setRenderProgress((prev) => {
        if (prev >= 95) return prev;
        return prev + 3;
      });
    }, 300);

    try {
      const result = await renderProject(project.id);
      setRenderProgress(100);
      toast.success(`视频渲染完成！输出路径: ${result.outputPath}`);
      const refreshed = await getProject(project.id);
      if (refreshed) setProject(refreshed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "渲染失败";
      toast.error(message);
    } finally {
      window.clearInterval(progressInterval);
      setIsRendering(false);
    }
  };

  const handleToggleSelect = async (segmentId: string) => {
    if (!project) return;

    const updatedSegments = project.segments.map((seg) =>
      seg.id === segmentId ? { ...seg, selected: !seg.selected } : seg
    );

    setProject({ ...project, segments: updatedSegments });

    try {
      const saved = await updateSegments(project.id, updatedSegments);
      setProject(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      toast.error(message);
    }
  };

  const handlePreviewSegment = (segment: Segment) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const startTime = segment.startMs / 1000;
    const endTime = segment.endMs / 1000;

    video.currentTime = startTime;
    void video.play();

    const stopAtEnd = () => {
      if (video.currentTime >= endTime) {
        video.pause();
        video.removeEventListener("timeupdate", stopAtEnd);
      }
    };
    video.addEventListener("timeupdate", stopAtEnd);
  };

  const handleEditSegment = (segment: Segment) => {
    setEditingSegment(segment);
    setIsEditDialogOpen(true);
  };

  const handleSplitSegment = (segment: Segment) => {
    setSplitSegment(segment);
    setSplitDialogOpen(true);
  };

  const handleOpenMerge = () => {
    if (!project) return;
    setMergeSelection([]);
    setMergeTab("all");
    setMergeDialogOpen(true);
  };

  const handleOpenMove = () => {
    if (!project) return;
    setMoveOrder(project.segments.map((segment) => segment.id));
    setMoveTab("all");
    setMoveDialogOpen(true);
  };

  const cropOptions = [
    { label: "原始尺寸", value: "original", mode: "original" as const },
    { label: "16:9", value: "16:9", mode: "ratio" as const },
    { label: "9:16", value: "9:16", mode: "ratio" as const },
    { label: "4:3", value: "4:3", mode: "ratio" as const },
    { label: "3:4", value: "3:4", mode: "ratio" as const },
    { label: "自由裁剪", value: "free", mode: "free" as const, disabled: true }
  ];

  const fpsOptions = [30, 60] as const;
  const resolutionOptions = [
    { label: "720p", height: 720 },
    { label: "1080p", height: 1080 },
    { label: "2K", height: 1440 }
  ] as const;
  const qualityOptions = [
    { label: "标准", value: "standard" },
    { label: "高质量", value: "high" },
    { label: "超高", value: "ultra" }
  ] as const;

  const handleSaveSegment = async (updatedSegment: Segment) => {
    if (!project) return;

    const updatedSegments = project.segments.map((seg) =>
      seg.id === updatedSegment.id ? updatedSegment : seg
    );

    setProject({ ...project, segments: updatedSegments });
    try {
      const saved = await updateSegments(project.id, updatedSegments);
      setProject(saved);
      toast.success("片段已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新失败";
      toast.error(message);
    }
  };

  const baseSplitText = splitSegment ? (splitSegment.editedText ?? splitSegment.text) : "";
  const splitUsesEditedText = Boolean(
    splitSegment && splitSegment.editedText && splitSegment.editedText.trim() !== splitSegment.text.trim()
  );
  const splitParts = useMemo(() => buildSplitParts(splitInput), [splitInput]);
  const canSplit = splitParts.length > 1;

  const batchMatches = useMemo(() => {
    if (!project) return [];
    const source = batchSource.trim();
    if (!source) return [];
    const normalizedSource = batchIgnoreCase ? source.toLowerCase() : source;
    return project.segments
      .map((segment) => {
        const text = (segment.editedText ?? segment.text) || "";
        const haystack = batchIgnoreCase ? text.toLowerCase() : text;
        if (!haystack.includes(normalizedSource)) return null;
        return { segment, text };
      })
      .filter((value): value is { segment: Segment; text: string } => Boolean(value));
  }, [project, batchSource, batchIgnoreCase]);
  const batchMatchIds = useMemo(() => batchMatches.map((match) => match.segment.id), [batchMatches]);
  const canBatchReplace = batchSource.trim().length > 0 && batchTarget.trim().length > 0;
  const batchSelectedCount = batchSelection.length;

  useEffect(() => {
    if (splitSegment && splitDialogOpen) {
      setSplitInput(splitSegment.editedText ?? splitSegment.text);
    }
  }, [splitDialogOpen, splitSegment]);

  useEffect(() => {
    if (!batchReplaceOpen) {
      setBatchSource("");
      setBatchTarget("");
      setBatchSelection([]);
      setBatchIgnoreCase(false);
      return;
    }
    if (batchSource.trim().length === 0) {
      setBatchSelection([]);
      return;
    }
    setBatchSelection(batchMatchIds);
  }, [batchReplaceOpen, batchSource, batchMatchIds, batchIgnoreCase]);

  const handleSplitInputChange = (value: string) => {
    if (!splitSegment) return;
    const stripped = value.replace(/#/g, "");
    if (stripped === baseSplitText) {
      setSplitInput(value);
    }
  };

  const handleConfirmSplit = async () => {
    if (!project || !splitSegment || splitParts.length <= 1) return;
    if (splitUsesEditedText) {
      toast.message("当前文案已修改，将使用近似时间拆分");
    }
    const newSegments = splitSegmentByParts(splitSegment, splitParts, project.transcriptRaw);
    const updatedSegments = project.segments.flatMap((seg) =>
      seg.id === splitSegment.id ? newSegments : [seg]
    );
    setProject({ ...project, segments: updatedSegments });
    setSplitConfirmOpen(false);
    setSplitDialogOpen(false);
    setSplitSegment(null);
    setSplitInput("");
    try {
      const saved = await updateSegments(project.id, updatedSegments);
      setProject(saved);
      toast.success("片段已拆分");
    } catch (error) {
      const message = error instanceof Error ? error.message : "拆分失败";
      toast.error(message);
    }
  };

  const handleBatchToggle = (segmentId: string) => {
    setBatchSelection((prev) => {
      if (prev.includes(segmentId)) {
        return prev.filter((id) => id !== segmentId);
      }
      return [...prev, segmentId];
    });
  };

  const handleBatchToggleAll = () => {
    if (batchMatchIds.length === 0) return;
    if (batchSelection.length === batchMatchIds.length) {
      setBatchSelection([]);
    } else {
      setBatchSelection(batchMatchIds);
    }
  };

  const handleConfirmBatchReplace = async () => {
    if (!project) return;
    const source = batchSource.trim();
    const target = batchTarget.trim();
    if (!source || !target || batchSelection.length === 0) return;
    const selection = new Set(batchSelection);
    const updatedSegments = project.segments.map((segment) => {
      if (!selection.has(segment.id)) return segment;
      const base = (segment.editedText ?? segment.text) || "";
      const replaced = replaceAllText(base, source, target, batchIgnoreCase);
      if (replaced === base) return segment;
      if (replaced === segment.text) {
        return { ...segment, editedText: undefined };
      }
      return { ...segment, editedText: replaced };
    });
    setProject({ ...project, segments: updatedSegments });
    setBatchConfirmOpen(false);
    setBatchReplaceOpen(false);
    try {
      const saved = await updateSegments(project.id, updatedSegments);
      setProject(saved);
      toast.success("批量替换已完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量替换失败";
      toast.error(message);
    }
  };

  const selectedCount = project?.segments.filter((s) => s.selected).length || 0;
  const unselectedCount = project?.segments.filter((s) => !s.selected).length || 0;
  const totalDurationSeconds =
    project?.segments
      .filter((s) => s.selected)
      .reduce((sum, s) => sum + s.durationMs / 1000, 0) || 0;

  const videoSrc = project ? getVideoUrl(project.id) : localVideoUrl;
  const projectTitle = project?.title ?? "新项目";
  const status = project?.status ?? "draft";

  const selectedSegments = useMemo(() => project?.segments.filter((s) => s.selected) ?? [], [project]);
  const previewDurationInFrames = useMemo(() => calcDurationInFrames(selectedSegments, 30), [selectedSegments]);
  const cropSettings = project?.crop ?? { mode: "original" };
  const renderSettings = project?.renderSettings ?? renderSettingsDraft;
  const outputDimensions = useMemo(() => {
    const width = videoDimensions?.width ?? 1280;
    const height = videoDimensions?.height ?? 720;
    return resolveOutputDimensions(width, height, cropSettings);
  }, [videoDimensions, cropSettings]);
  const renderDimensions = useMemo(() => {
    const width = videoDimensions?.width ?? 1920;
    const height = videoDimensions?.height ?? 1080;
    return resolveRenderDimensions(width, height, cropSettings, renderSettings);
  }, [videoDimensions, cropSettings, renderSettings]);
  const estimatedBitrate = useMemo(() => resolveRenderBitrate(renderSettings), [renderSettings]);
  const previewWidth = outputDimensions.width;
  const previewHeight = outputDimensions.height;
  const previewRatio = previewWidth > 0 ? previewWidth / previewHeight : 16 / 9;
  const videoFit = cropSettings.mode === "ratio" ? "cover" : "contain";
  const segmentIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    project?.segments.forEach((segment, index) => {
      map.set(segment.id, index);
    });
    return map;
  }, [project?.segments]);
  const segmentById = useMemo(() => {
    const map = new Map<string, Segment>();
    project?.segments.forEach((segment) => {
      map.set(segment.id, segment);
    });
    return map;
  }, [project?.segments]);
  const visibleSegments = useMemo(() => {
    if (!project?.segments) return [];
    if (segmentTab === "selected") return project.segments.filter((segment) => segment.selected);
    if (segmentTab === "unselected") return project.segments.filter((segment) => !segment.selected);
    return project.segments;
  }, [project, segmentTab]);
  const canRender = selectedSegments.length > 0 && !isParsing && !isRendering;
  const canDownload = project?.status === "completed";
  const parseLabel = pendingFile ? "开始解析" : project ? "重新解析" : "开始解析";
  const canExportSubtitles = Boolean(project && selectedSegments.length > 0);
  const mergeCanConfirm = mergeSelection.length >= 2;
  const mergeSelectableIds = useMemo(() => {
    if (!mergeSelection.length) return new Set(project?.segments.map((segment) => segment.id) ?? []);
    const indices = mergeSelection
      .map((id) => segmentIndexMap.get(id))
      .filter((value): value is number => typeof value === "number");
    if (!indices.length) return new Set<string>();
    const minIndex = Math.min(...indices);
    const maxIndex = Math.max(...indices);
    const allowed = new Set<string>();
    const segments = project?.segments ?? [];
    const minId = segments[minIndex - 1]?.id;
    const maxId = segments[maxIndex + 1]?.id;
    mergeSelection.forEach((id) => allowed.add(id));
    if (minId) allowed.add(minId);
    if (maxId) allowed.add(maxId);
    return allowed;
  }, [mergeSelection, project?.segments, segmentIndexMap]);
  const moveVisibleOrder = useMemo(() => {
    if (!project) return [];
    return moveOrder.filter((id) => {
      const segment = segmentById.get(id);
      if (!segment) return false;
      return matchesTab(segment, moveTab);
    });
  }, [moveOrder, segmentById, project, moveTab]);
  const handleExportSubtitles = () => {
    if (!project) return;
    const url = getSubtitleUrl(project.id, subtitleFormat);
    const link = document.createElement("a");
    const safeTitle = project.title?.trim() || "subtitles";
    link.href = url;
    link.download = `${safeTitle}.${subtitleFormat}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const activeCropValue =
    cropSettings.mode === "ratio" ? cropSettings.ratio ?? "original" : cropSettings.mode;

  const handleCropSelect = async (option: (typeof cropOptions)[number]) => {
    if (!project || option.disabled) return;
    const nextCrop =
      option.mode === "ratio"
        ? { mode: "ratio" as const, ratio: option.value }
        : { mode: option.mode };
    setProject({ ...project, crop: nextCrop });
    setCropUpdating(true);
    try {
      const saved = await updateProjectCrop(project.id, nextCrop);
      setProject(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新裁剪失败";
      toast.error(message);
    } finally {
      setCropUpdating(false);
    }
  };

  const handleRenderSettingsChange = async (next: RenderSettings) => {
    setRenderSettingsDraft(next);
    if (!project) return;
    setProject({ ...project, renderSettings: next });
    setRenderSettingsUpdating(true);
    try {
      const saved = await updateProjectRenderSettings(project.id, next);
      setProject(saved);
      if (saved.renderSettings) setRenderSettingsDraft(saved.renderSettings);
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新渲染设置失败";
      toast.error(message);
    } finally {
      setRenderSettingsUpdating(false);
    }
  };

  useEffect(() => {
    setSubtitleDraft(settings.subtitleStyle ?? defaultSettings.subtitleStyle!);
  }, [settings.subtitleStyle, subtitleStyleOpen]);

  useEffect(() => {
    if (!mergeDialogOpen) {
      setMergeSelection([]);
    }
  }, [mergeDialogOpen]);

  const handleToggleMerge = (segmentId: string) => {
    if (!project) return;
    if (!mergeSelectableIds.has(segmentId)) return;
    setMergeSelection((prev) => {
      if (prev.includes(segmentId)) {
        const indices = prev
          .map((id) => segmentIndexMap.get(id))
          .filter((value): value is number => typeof value === "number");
        if (!indices.length) return prev.filter((id) => id !== segmentId);
        const minIndex = Math.min(...indices);
        const maxIndex = Math.max(...indices);
        const targetIndex = segmentIndexMap.get(segmentId);
        if (targetIndex === undefined) return prev;
        if (targetIndex !== minIndex && targetIndex !== maxIndex) {
          return prev;
        }
        return prev.filter((id) => id !== segmentId);
      }
      return [...prev, segmentId];
    });
  };

  const handleConfirmMerge = async () => {
    if (!project || mergeSelection.length < 2) return;
    const merged = mergeSegments(project.segments, mergeSelection);
    if (!merged) return;
    setProject({ ...project, segments: merged });
    setMergeDialogOpen(false);
    setMergeSelection([]);
    try {
      const saved = await updateSegments(project.id, merged);
      setProject(saved);
      toast.success("片段已合并");
    } catch (error) {
      const message = error instanceof Error ? error.message : "合并失败";
      toast.error(message);
    }
  };

  const handleMoveRow = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setMoveOrder((prev) => {
      const visible = prev.filter((id) => {
        const segment = segmentById.get(id);
        if (!segment) return false;
        return matchesTab(segment, moveTab);
      });
      const reordered = arrayMove(visible, fromIndex, toIndex);
      return applyFilteredOrder(prev, reordered, (segmentId) => {
        const segment = segmentById.get(segmentId);
        if (!segment) return false;
        return matchesTab(segment, moveTab);
      });
    });
  };

  const handleConfirmMove = async () => {
    if (!project) return;
    const reordered = moveOrder
      .map((id) => segmentById.get(id))
      .filter(Boolean) as Segment[];
    if (!reordered.length) return;
    setProject({ ...project, segments: reordered });
    setMoveDialogOpen(false);
    try {
      const saved = await updateSegments(project.id, reordered);
      setProject(saved);
      toast.success("片段顺序已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新失败";
      toast.error(message);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onNavigateToHome}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{projectTitle}</h1>
              <p className="text-sm text-muted-foreground">
                {status === "draft" && "草稿"}
                {status === "parsed" && "已解析"}
                {status === "rendering" && "渲染中"}
                {status === "completed" && "已完成"}
                {status === "failed" && "失败"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onSettingsOpen}>
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">原始视频</h2>
              {videoSrc ? (
                <div className="w-full aspect-video rounded-lg overflow-hidden border border-gray-200 bg-black">
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    controls
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(event) => {
                      const element = event.currentTarget;
                      if (element.videoWidth && element.videoHeight) {
                        setVideoDimensions({ width: element.videoWidth, height: element.videoHeight });
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-xs text-gray-400">
                  <Upload className="h-8 w-8 mb-2 opacity-50" />
                  <span>请上传视频</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">视频比例</h2>
              <div className="grid grid-cols-2 gap-2">
                {cropOptions.map((option) => {
                  const active = activeCropValue === option.value;
                  return (
                    <Button
                      key={option.value}
                      variant={active ? "default" : "outline"}
                      className="h-9 justify-center"
                      disabled={!project || cropUpdating || option.disabled}
                      onClick={() => handleCropSelect(option)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">自由裁剪暂未开放</p>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">视频帧率</h2>
              <div className="grid grid-cols-2 gap-2">
                {fpsOptions.map((fps) => {
                  const active = renderSettings.fps === fps;
                  return (
                    <Button
                      key={fps}
                      variant={active ? "default" : "outline"}
                      className="h-9 justify-center"
                      disabled={renderSettingsUpdating}
                      onClick={() => handleRenderSettingsChange({ ...renderSettings, fps })}
                    >
                      {fps} FPS
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">视频清晰度</h2>
              <div className="grid grid-cols-3 gap-2">
                {resolutionOptions.map((option) => {
                  const active = renderSettings.height === option.height;
                  return (
                    <Button
                      key={option.height}
                      variant={active ? "default" : "outline"}
                      className="h-9 justify-center"
                      disabled={renderSettingsUpdating}
                      onClick={() => handleRenderSettingsChange({ ...renderSettings, height: option.height })}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">清晰度仅影响渲染导出</p>
              <p className="text-xs text-muted-foreground">
                预计输出分辨率：{renderDimensions.width} × {renderDimensions.height}
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">渲染质量</h2>
              <div className="grid grid-cols-3 gap-2">
                {qualityOptions.map((option) => {
                  const active = renderSettings.quality === option.value;
                  return (
                    <Button
                      key={option.value}
                      variant={active ? "default" : "outline"}
                      className="h-9 justify-center"
                      disabled={renderSettingsUpdating}
                      onClick={() =>
                        handleRenderSettingsChange({ ...renderSettings, quality: option.value })
                      }
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">预计视频码率：{estimatedBitrate}</p>
            </div>
          </div>

          <div className="border-t border-gray-200 p-4 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
            >
              <Upload className="h-4 w-4 mr-2" />
              {project || pendingFile ? "重新上传" : "上传视频"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleParse}
              disabled={isParsing || isRendering || (!pendingFile && !project)}
            >
              {isParsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {parseLabel}
                </>
              )}
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-hidden">
            {project && selectedSegments.length ? (
              <div
                className="w-full max-w-5xl max-h-[60vh]"
                style={{
                  aspectRatio: `${previewWidth} / ${previewHeight}`,
                  maxWidth: `${60 * previewRatio}vh`
                }}
              >
                <Player
                  component={AutoCutVideo}
                  inputProps={{
                    videoSrc: getVideoUrl(project.id),
                    segments: selectedSegments,
                    subtitleStyle: settings.subtitleStyle,
                    crop: cropSettings
                  }}
                  durationInFrames={previewDurationInFrames}
                  fps={30}
                  compositionWidth={previewWidth}
                  compositionHeight={previewHeight}
                  controls
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <Upload className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">{videoSrc ? "请选择片段进行预览" : "请上传视频文件"}</p>
              </div>
            )}
          </div>

          <div className="bg-white border-t border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-3 justify-end">
              <Button onClick={handleRender} disabled={!canRender} className="bg-indigo-600 hover:bg-indigo-700">
                {isRendering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    渲染中...
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4 mr-2" />
                    渲染视频
                  </>
                )}
              </Button>
              {canDownload && project ? (
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                  <a href={getOutputUrl(project.id)} download>
                    下载视频
                  </a>
                </Button>
              ) : (
                <Button variant="secondary" disabled>
                  下载视频
                </Button>
              )}
              {project ? (
                <div className="text-sm text-muted-foreground">
                  已选 {selectedCount} / {project.segments.length} · 输出时长 {formatDuration(totalDurationSeconds)}
                </div>
              ) : null}
            </div>

          </div>
        </div>

        <div className="w-96 bg-white border-l border-gray-200 flex flex-col min-h-0">
          <div className="p-6 border-b border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                片段列表（共 {project?.segments.length ?? 0} 个片段）
              </h2>
            </div>
            <Tabs value={segmentTab} onValueChange={(value) => setSegmentTab(value as "all" | "selected" | "unselected")}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">
                  全部（{project?.segments.length ?? 0}）
                </TabsTrigger>
                <TabsTrigger value="selected" className="flex-1">
                  已选（{selectedSegments.length}）
                </TabsTrigger>
                <TabsTrigger value="unselected" className="flex-1">
                  未选（{unselectedCount}）
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-3">
              {visibleSegments.length ? (
                visibleSegments.map((segment) => (
                  <SegmentItem
                    key={segment.id}
                    segment={segment}
                    onToggleSelect={handleToggleSelect}
                    onPreview={handlePreviewSegment}
                    onEdit={handleEditSegment}
                    onSplit={handleSplitSegment}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {segmentTab === "selected"
                      ? "暂无已选片段"
                      : segmentTab === "unselected"
                        ? "暂无未选片段"
                        : "还没有片段"}
                  </p>
                  <p className="text-xs mt-1">
                    {segmentTab === "selected"
                      ? "请选择片段后查看"
                      : segmentTab === "unselected"
                        ? "当前所有片段都已选中"
                        : "上传并解析视频后会显示"}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="border-t border-gray-200 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSubtitleStyleOpen(true)}>
                字幕样式
              </Button>
              <Button variant="outline" className="flex-1" disabled={!canExportSubtitles} onClick={() => setExportDialogOpen(true)}>
                导出字幕
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="flex-1 min-w-[120px]" disabled={!project} onClick={handleOpenMerge}>
                合并片段
              </Button>
              <Button variant="outline" className="flex-1 min-w-[120px]" disabled={!project} onClick={handleOpenMove}>
                移动片段
              </Button>
              <Button
                variant="outline"
                className="flex-1 min-w-[120px]"
                disabled={!project}
                onClick={() => setBatchReplaceOpen(true)}
              >
                批量替换
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SegmentEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        segment={editingSegment}
        onSave={handleSaveSegment}
      />

      <Dialog
        open={splitDialogOpen}
        onOpenChange={(open) => {
          setSplitDialogOpen(open);
          if (!open) {
            setSplitSegment(null);
            setSplitInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>拆分片段</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              在文本中插入 <span className="font-semibold text-gray-900">#</span> 作为分割点（只能增删 #）
            </p>
            <div className="space-y-2">
              <Textarea
                value={splitInput}
                onChange={(event) => handleSplitInputChange(event.target.value)}
                placeholder="请在文本中插入 # 进行拆分"
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">拆分预览</div>
              <div className="space-y-2">
                {splitParts.length ? (
                  splitParts.map((part, index) => (
                    <div key={`${index}-${part}`} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                      {index + 1}. {part}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">请插入 # 生成拆分预览</div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSplitDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={!canSplit} onClick={() => setSplitConfirmOpen(true)}>
              拆分
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={splitConfirmOpen} onOpenChange={setSplitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认拆分片段？</AlertDialogTitle>
            <AlertDialogDescription>拆分后将替换当前片段，生成以下小片段：</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {splitParts.map((part, index) => (
              <div key={`${index}-${part}`} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                {index + 1}. {part}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSplit}>确认拆分</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={batchReplaceOpen} onOpenChange={setBatchReplaceOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>批量替换文案</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="batch-source">原始词</Label>
                <Input
                  id="batch-source"
                  value={batchSource}
                  onChange={(event) => setBatchSource(event.target.value)}
                  placeholder="请输入要替换的词"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-target">替换词</Label>
                <Input
                  id="batch-target"
                  value={batchTarget}
                  onChange={(event) => setBatchTarget(event.target.value)}
                  placeholder="请输入替换后的词"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                匹配 {batchMatches.length} 条 · 已选择 {batchSelectedCount} 条
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={!batchMatches.length} onClick={handleBatchToggleAll}>
                  全选
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="batch-ignore-case"
                checked={batchIgnoreCase}
                onCheckedChange={(value) => setBatchIgnoreCase(Boolean(value))}
              />
              <Label htmlFor="batch-ignore-case" className="text-sm text-muted-foreground">
                忽略大小写
              </Label>
            </div>
            <ScrollArea className="h-64 rounded-md border border-gray-200">
              <div className="divide-y divide-gray-100">
                {batchMatches.length ? (
                  batchMatches.map((match) => (
                    <div key={match.segment.id} className="flex gap-3 p-3">
                      <Checkbox
                        checked={batchSelection.includes(match.segment.id)}
                        onCheckedChange={() => handleBatchToggle(match.segment.id)}
                      />
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          {formatTime(match.segment.startMs)} - {formatTime(match.segment.endMs)}
                        </div>
                        <div className="text-sm text-gray-900">
                          {highlightQuery(match.text, batchSource, batchIgnoreCase)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">请输入原始词开始搜索</div>
                )}
              </div>
            </ScrollArea>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBatchReplaceOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!canBatchReplace || batchSelection.length === 0}
              onClick={() => setBatchConfirmOpen(true)}
            >
              确认替换
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量替换？</AlertDialogTitle>
            <AlertDialogDescription>
              将把 “{batchSource || "-"}” 替换为 “{batchTarget || "-"}”，共 {batchSelectedCount} 条文案。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmBatchReplace}>确认替换</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>合并片段</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={mergeTab} onValueChange={(value) => setMergeTab(value as "all" | "selected" | "unselected")}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">
                  全部（{project?.segments.length ?? 0}）
                </TabsTrigger>
                <TabsTrigger value="selected" className="flex-1">
                  已选（{selectedCount}）
                </TabsTrigger>
                <TabsTrigger value="unselected" className="flex-1">
                  未选（{unselectedCount}）
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="max-h-[360px] overflow-y-auto space-y-2">
              {project?.segments
                .filter((segment) => matchesTab(segment, mergeTab))
                .map((segment) => {
                  const disabled = !mergeSelectableIds.has(segment.id);
                  const displayText = segment.editedText ?? segment.text;
                  return (
                    <label
                      key={segment.id}
                      className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                        disabled ? "border-gray-100 text-gray-400" : "border-gray-200 text-gray-900"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={mergeSelection.includes(segment.id)}
                        disabled={disabled}
                        onChange={() => handleToggleMerge(segment.id)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          {formatTime(segment.startMs / 1000)} - {formatTime(segment.endMs / 1000)} ·{" "}
                          {(segment.durationMs / 1000).toFixed(1)}s
                        </div>
                        <div className="text-sm">{displayText || "(静音)"}</div>
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={!mergeCanConfirm} onClick={handleConfirmMerge}>
              合并
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>移动片段</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={moveTab} onValueChange={(value) => setMoveTab(value as "all" | "selected" | "unselected")}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">
                  全部（{project?.segments.length ?? 0}）
                </TabsTrigger>
                <TabsTrigger value="selected" className="flex-1">
                  已选（{selectedCount}）
                </TabsTrigger>
                <TabsTrigger value="unselected" className="flex-1">
                  未选（{unselectedCount}）
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <DndProvider backend={HTML5Backend}>
              <div className="max-h-[360px] overflow-y-auto space-y-2">
                {moveVisibleOrder.map((id, index) => {
                  const segment = segmentById.get(id);
                  if (!segment) return null;
                  return (
                    <MoveRow
                      key={segment.id}
                      segment={segment}
                      index={index}
                      onMove={handleMoveRow}
                    />
                  );
                })}
              </div>
            </DndProvider>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmMove}>确定</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>导出字幕</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">字幕格式</label>
              <Select
                value={subtitleFormat}
                onValueChange={(value) => setSubtitleFormat(value as "srt" | "vtt" | "txt")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="srt">SRT</SelectItem>
                  <SelectItem value="vtt">VTT</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!canExportSubtitles}
              onClick={() => {
                handleExportSubtitles();
                setExportDialogOpen(false);
              }}
            >
              下载
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {(isParsing || isRendering) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[320px] rounded-xl bg-white p-6 shadow-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isParsing ? "解析中..." : "渲染中..."}
            </div>
            <Progress value={isParsing ? parseProgress : renderProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {isParsing ? parseProgress : renderProgress}%
            </p>
          </div>
        </div>
      )}

      <Dialog open={subtitleStyleOpen} onOpenChange={setSubtitleStyleOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>字幕样式</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">字体大小</label>
                <Slider
                  value={[subtitleDraft.fontSize]}
                  onValueChange={([value]) => setSubtitleDraft({ ...subtitleDraft, fontSize: value })}
                  min={20}
                  max={72}
                  step={1}
                />
                <div className="text-xs text-muted-foreground">{subtitleDraft.fontSize}px</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">字体粗细</label>
                <Select
                  value={String(subtitleDraft.fontWeight)}
                  onValueChange={(value) =>
                    setSubtitleDraft({ ...subtitleDraft, fontWeight: Number.parseInt(value, 10) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="400">Regular</SelectItem>
                    <SelectItem value="500">Medium</SelectItem>
                    <SelectItem value="600">Semibold</SelectItem>
                    <SelectItem value="700">Bold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">字体</label>
                <Select
                  value={subtitleDraft.fontFamily}
                  onValueChange={(value) => setSubtitleDraft({ ...subtitleDraft, fontFamily: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PingFang SC, Microsoft YaHei, Arial, sans-serif">
                      中文默认
                    </SelectItem>
                    <SelectItem value="Noto Sans SC, PingFang SC, Arial, sans-serif">
                      Noto Sans SC
                    </SelectItem>
                    <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                    <SelectItem value="Georgia, serif">Georgia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">入场/出场动画</label>
                <Select
                  value={subtitleDraft.animation}
                  onValueChange={(value) =>
                    setSubtitleDraft({ ...subtitleDraft, animation: value as typeof subtitleDraft.animation })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fade">淡入淡出</SelectItem>
                    <SelectItem value="slide-up">上移</SelectItem>
                    <SelectItem value="slide-down">下移</SelectItem>
                    <SelectItem value="scale">缩放</SelectItem>
                    <SelectItem value="none">无动画</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">文字颜色</label>
                <Input
                  type="color"
                  value={subtitleDraft.textColor}
                  onChange={(event) => setSubtitleDraft({ ...subtitleDraft, textColor: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">描边颜色</label>
                <Input
                  type="color"
                  value={subtitleDraft.strokeColor}
                  onChange={(event) => setSubtitleDraft({ ...subtitleDraft, strokeColor: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">描边粗细</label>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={subtitleDraft.strokeWidth}
                  onChange={(event) =>
                    setSubtitleDraft({ ...subtitleDraft, strokeWidth: Number(event.target.value) })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">背景颜色</label>
                <Input
                  type="color"
                  value={subtitleDraft.backgroundColor}
                  onChange={(event) =>
                    setSubtitleDraft({ ...subtitleDraft, backgroundColor: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">背景透明度</label>
                <Slider
                  value={[subtitleDraft.backgroundOpacity]}
                  onValueChange={([value]) =>
                    setSubtitleDraft({ ...subtitleDraft, backgroundOpacity: Number(value.toFixed(2)) })
                  }
                  min={0}
                  max={1}
                  step={0.05}
                />
                <div className="text-xs text-muted-foreground">{subtitleDraft.backgroundOpacity}</div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">底部位置</label>
                <Slider
                  value={[subtitleDraft.positionBottomPercent]}
                  onValueChange={([value]) =>
                    setSubtitleDraft({ ...subtitleDraft, positionBottomPercent: Math.round(value) })
                  }
                  min={2}
                  max={20}
                  step={1}
                />
                <div className="text-xs text-muted-foreground">{subtitleDraft.positionBottomPercent}%</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">阴影颜色</label>
                <Input
                  type="color"
                  value={subtitleDraft.shadowColor}
                  onChange={(event) => setSubtitleDraft({ ...subtitleDraft, shadowColor: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">阴影模糊</label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={subtitleDraft.shadowBlur}
                  onChange={(event) =>
                    setSubtitleDraft({ ...subtitleDraft, shadowBlur: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">阴影 Y 偏移</label>
                <Input
                  type="number"
                  min={-20}
                  max={20}
                  value={subtitleDraft.shadowOffsetY}
                  onChange={(event) =>
                    setSubtitleDraft({ ...subtitleDraft, shadowOffsetY: Number(event.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSubtitleStyleOpen(false)}>
              取消
            </Button>
            <Button
              onClick={async () => {
                const saved = await onSettingsChange({
                  ...settings,
                  subtitleStyle: subtitleDraft
                });
                setSubtitleDraft(saved.subtitleStyle ?? subtitleDraft);
                setSubtitleStyleOpen(false);
              }}
            >
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RawWord = {
  text: string;
  startMs: number;
  endMs: number;
};

const MOVE_ITEM_TYPE = "MOVE_SEGMENT";

type MoveItem = {
  id: string;
  index: number;
};

function MoveRow({
  segment,
  index,
  onMove
}: {
  segment: Segment;
  index: number;
  onMove: (fromIndex: number, toIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: MOVE_ITEM_TYPE,
      item: { id: segment.id, index },
      collect: (monitor) => ({ isDragging: monitor.isDragging() })
    }),
    [segment.id, index]
  );

  const [, drop] = useDrop(
    () => ({
      accept: MOVE_ITEM_TYPE,
      hover: (item: MoveItem, monitor) => {
        if (!ref.current) return;
        const dragIndex = item.index;
        const hoverIndex = index;
        if (dragIndex === hoverIndex) return;
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const hoverClientY = clientOffset.y - hoverBoundingRect.top;
        if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
        if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
        onMove(dragIndex, hoverIndex);
        item.index = hoverIndex;
      }
    }),
    [index, onMove]
  );

  drop(ref);
  drag(handleRef);

  const displayText = segment.editedText ?? segment.text;

  return (
    <div
      ref={ref}
      className={`rounded-md border bg-white px-3 py-2 text-sm shadow-sm transition ${
        isDragging ? "border-indigo-300 bg-indigo-50/60 opacity-70" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <div ref={handleRef} className="mt-1 cursor-grab text-gray-400 hover:text-gray-600">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">
            {formatTime(segment.startMs / 1000)} - {formatTime(segment.endMs / 1000)} ·{" "}
            {(segment.durationMs / 1000).toFixed(1)}s
          </div>
          <div className="text-sm">{displayText || "(静音)"}</div>
        </div>
      </div>
    </div>
  );
}

function buildSplitParts(value: string) {
  return value
    .split("#")
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSegmentByParts(segment: Segment, parts: string[], transcriptRaw: unknown) {
  if (parts.length <= 1) return [segment];
  const boundaries = resolveSplitBoundaries(segment, parts, transcriptRaw);
  const startTimes = [segment.startMs, ...boundaries];
  const endTimes = [...boundaries, segment.endMs];
  return parts.map((text, index) => {
    const startMs = startTimes[index];
    const endMs = endTimes[index];
    return {
      ...segment,
      id: crypto.randomUUID(),
      text,
      editedText: undefined,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs)
    };
  });
}

function resolveSplitBoundaries(segment: Segment, parts: string[], transcriptRaw: unknown) {
  const words = extractWordsFromTranscript(transcriptRaw).filter(
    (word) => word.startMs >= segment.startMs && word.endMs <= segment.endMs
  );
  const boundaries = computeBoundariesFromWords(parts, words);
  if (boundaries && boundaries.length === parts.length - 1) {
    return sanitizeBoundaries(boundaries, segment.startMs, segment.endMs);
  }
  const fallback = computeBoundariesByRatio(segment, parts);
  return sanitizeBoundaries(fallback, segment.startMs, segment.endMs);
}

function computeBoundariesFromWords(parts: string[], words: RawWord[]) {
  if (!words.length) return null;
  const tokens = words
    .map((word) => ({
      ...word,
      norm: normalizeForMatch(word.text)
    }))
    .filter((word) => word.norm);
  if (!tokens.length) return null;
  let tokenIndex = 0;
  const boundaries: number[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    const target = normalizeForMatch(parts[i]);
    if (!target) return null;
    let accum = "";
    let lastTokenIndex = -1;
    while (tokenIndex < tokens.length && accum.length < target.length) {
      accum += tokens[tokenIndex].norm;
      lastTokenIndex = tokenIndex;
      tokenIndex += 1;
    }
    if (lastTokenIndex < 0 || accum.length < target.length) {
      return null;
    }
    boundaries.push(tokens[lastTokenIndex].endMs);
  }
  return boundaries;
}

function computeBoundariesByRatio(segment: Segment, parts: string[]) {
  const durationMs = Math.max(0, segment.endMs - segment.startMs);
  const lengths = parts.map((part) => Math.max(1, normalizeForMatch(part).length));
  const total = lengths.reduce((sum, len) => sum + len, 0);
  if (total <= 0) {
    const step = parts.length > 0 ? Math.floor(durationMs / parts.length) : 0;
    let cursor = segment.startMs;
    return parts.slice(0, -1).map(() => {
      cursor += step;
      return cursor;
    });
  }
  let acc = 0;
  return parts.slice(0, -1).map((_, index) => {
    acc += lengths[index];
    const ratio = acc / total;
    return Math.round(segment.startMs + durationMs * ratio);
  });
}

function sanitizeBoundaries(boundaries: number[], startMs: number, endMs: number) {
  const sanitized: number[] = [];
  let cursor = startMs;
  for (const boundary of boundaries) {
    const next = Math.min(endMs, Math.max(cursor + 1, boundary));
    sanitized.push(next);
    cursor = next;
  }
  return sanitized;
}

function extractWordsFromTranscript(raw: unknown): RawWord[] {
  if (!raw || typeof raw !== "object") return [];
  const data =
    (raw as Record<string, unknown>).data ??
    (raw as Record<string, unknown>).result ??
    (raw as Record<string, unknown>).resp ??
    raw;
  const utterances =
    (data as Record<string, unknown>)?.utterances ??
    (data as Record<string, unknown>)?.result ??
    (data as Record<string, unknown>)?.segments ??
    (data as Record<string, unknown>)?.sentence_list;
  if (!Array.isArray(utterances)) return [];
  const words: RawWord[] = [];
  for (const utterance of utterances) {
    if (!utterance || typeof utterance !== "object") continue;
    const record = utterance as Record<string, unknown>;
    const wordsRaw =
      (record.words as unknown[]) ||
      (record.word_list as unknown[]) ||
      (record.word_list_v2 as unknown[]) ||
      [];
    if (!Array.isArray(wordsRaw)) continue;
    for (const wordRaw of wordsRaw) {
      if (!wordRaw || typeof wordRaw !== "object") continue;
      const wordRecord = wordRaw as Record<string, unknown>;
      const text = String(wordRecord.word ?? wordRecord.text ?? wordRecord.utterance ?? "");
      const start = Number(
        wordRecord.start_time ??
          wordRecord.start_time_ms ??
          wordRecord.start ??
          wordRecord.startMs
      );
      const end = Number(
        wordRecord.end_time ??
          wordRecord.end_time_ms ??
          wordRecord.end ??
          wordRecord.endMs
      );
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end < 0) continue;
      const startMs = start > 1000 ? start : start * 1000;
      const endMs = end > 1000 ? end : end * 1000;
      if (endMs < startMs) continue;
      words.push({ text, startMs, endMs });
    }
  }
  return words;
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function matchesTab(segment: Segment, tab: "all" | "selected" | "unselected") {
  if (tab === "selected") return segment.selected;
  if (tab === "unselected") return !segment.selected;
  return true;
}

function mergeSegments(segments: Segment[], selectedIds: string[]) {
  if (selectedIds.length < 2) return null;
  const indexMap = new Map(segments.map((segment, index) => [segment.id, index]));
  const sortedIds = [...selectedIds].sort((a, b) => (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0));
  const firstIndex = indexMap.get(sortedIds[0]);
  const lastIndex = indexMap.get(sortedIds[sortedIds.length - 1]);
  if (firstIndex === undefined || lastIndex === undefined) return null;
  const selectedSegments = sortedIds.map((id) => segments[indexMap.get(id) ?? 0]);
  const allSilence = selectedSegments.every((segment) => segment.type === "silence");
  const text = allSilence
    ? "(静音)"
    : selectedSegments
        .map((segment) => segment.editedText ?? segment.text)
        .filter(Boolean)
        .join(" ");
  const startMs = selectedSegments[0].startMs;
  const endMs = selectedSegments[selectedSegments.length - 1].endMs;
  const merged: Segment = {
    ...selectedSegments[0],
    id: crypto.randomUUID(),
    startMs,
    endMs,
    durationMs: Math.max(0, endMs - startMs),
    text,
    editedText: undefined,
    type: allSilence ? "silence" : "speech",
    selected: selectedSegments.some((segment) => segment.selected),
    reason: allSilence ? "silence" : "manual"
  };
  return [...segments.slice(0, firstIndex), merged, ...segments.slice(lastIndex + 1)];
}

function arrayMove<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function applyFilteredOrder(
  order: string[],
  filteredOrder: string[],
  predicate: (segmentId: string) => boolean
) {
  const nextFiltered = [...filteredOrder];
  return order.map((id) => {
    if (!predicate(id)) return id;
    return nextFiltered.shift() ?? id;
  });
}
