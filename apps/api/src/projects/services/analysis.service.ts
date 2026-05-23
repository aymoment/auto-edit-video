import { Injectable } from "@nestjs/common";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import {
  AnalysisSettings,
  Segment,
  TranscriptResult,
  TranscriptSegment
} from "@auto-editor/shared";
import { SettingsService } from "./settings.service";
import { AppSettings } from "@auto-editor/shared";
import { UploadService } from "./upload.service";

@Injectable()
export class AnalysisService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly uploadService: UploadService
  ) {}

  async extractAudio(videoPath: string, audioPath: string) {
    await fs.mkdir(path.dirname(audioPath), { recursive: true });
    await runCommand("ffmpeg", ["-y", "-i", videoPath, "-vn", "-acodec", "mp3", audioPath]);
  }

  async getMediaDurationMs(filePath: string): Promise<number> {
    const output = await runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const seconds = Number.parseFloat(output.trim());
    if (Number.isNaN(seconds)) {
      throw new Error("Failed to parse media duration.");
    }
    return Math.round(seconds * 1000);
  }

  async analyze(
    audioPath: string,
    settings?: Partial<AnalysisSettings>
  ): Promise<{ segments: Segment[]; transcriptRaw?: unknown }> {
    const defaults = await this.settingsService.getSettings();
    const finalSettings = {
      silenceThresholdMs: defaults.silenceThresholdMs,
      duplicateSimilarity: defaults.duplicateSimilarity,
      ...settings
    };
    const { transcript, raw } = await this.transcribeAudio(audioPath);
    const totalDurationMs = await this.getMediaDurationMs(audioPath);
    const segments = buildSegments(transcript.segments, totalDurationMs, finalSettings.silenceThresholdMs);
    const deduped = markDuplicates(segments, finalSettings.duplicateSimilarity);
    return { segments: deduped, transcriptRaw: raw };
  }

  private async transcribeAudio(
    audioPath: string
  ): Promise<{ transcript: TranscriptResult; raw?: unknown }> {
    const settings = await this.settingsService.getSettings();
    const provider = settings.transcribeProvider ?? "mock";
    if (provider === "mock") {
      return {
        transcript: mockTranscribe(audioPath, await this.getMediaDurationMs(audioPath)),
        raw: undefined
      };
    }

    if (provider === "volcengine") {
      return this.transcribeWithVolcengine(audioPath, settings);
    }

    throw new Error(`Unknown transcription provider: ${provider}`);
  }

  private async transcribeWithVolcengine(
    audioPath: string,
    settings: AppSettings
  ): Promise<{ transcript: TranscriptResult; raw?: unknown }> {
    const submitEndpoint = settings.volcengine.submitEndpoint || process.env.VOLCENGINE_ASR_ENDPOINT;
    const queryEndpoint =
      settings.volcengine.queryEndpoint ||
      (submitEndpoint ? submitEndpoint.replace("/submit", "/query") : "") ||
      process.env.VOLCENGINE_ASR_QUERY_ENDPOINT;
    const apiKey = settings.volcengine.apiKey || process.env.VOLCENGINE_ASR_API_KEY;
    const appKey = settings.volcengine.appKey || process.env.VOLCENGINE_ASR_APP_KEY;
    const accessKey = settings.volcengine.accessKey || process.env.VOLCENGINE_ASR_ACCESS_KEY;
    const resourceId = settings.volcengine.resourceId || process.env.VOLCENGINE_ASR_RESOURCE_ID;

    if (!submitEndpoint || !queryEndpoint) {
      throw new Error("Volcengine submit/query endpoint is required.");
    }
    if (!apiKey && !(appKey && accessKey)) {
      throw new Error("Volcengine API key or appKey/accessKey is required.");
    }
    if (!resourceId) {
      throw new Error("Volcengine resourceId is required.");
    }
    const audioUrl = await this.uploadService.getAudioUrl(audioPath);

    const requestId = crypto.randomUUID();

    const submitPayload = {
      user: {
        uid: "auto-editor"
      },
      audio: {
        url: audioUrl,
        format: "mp3",
        codec: "raw",
        rate: 16000,
        bits: 16,
        channel: 1
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
        enable_ddc: false,
        enable_speaker_info: false,
        enable_channel_split: false,
        show_utterances: true,
        vad_segment: true,
        sensitive_words_filter: ""
      }
    };

    const submitResponse = await requestJson(
      submitEndpoint,
      buildAuthHeaders({ apiKey, appKey, accessKey, resourceId, requestId, includeSequence: true }),
      submitPayload
    );
    assertNoError(submitResponse, "submit");

    const maxAttempts = 30;
    const intervalMs = 1500;
    let lastResponse: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await delay(intervalMs);
      const response = await requestJson(
        queryEndpoint,
        buildAuthHeaders({ apiKey, appKey, accessKey, resourceId, requestId }),
        {}
      );
      assertNoError(response, "query");
      lastResponse = response.body;
      const parsed = extractTranscriptFromResponse(response.body, settings.silenceThresholdMs);
      if (parsed) {
        return { transcript: parsed, raw: response.body };
      }
    }

    throw new Error(`Volcengine transcription timed out. Last response: ${JSON.stringify(lastResponse)}`);
  }
}

function buildSegments(
  speechSegments: TranscriptSegment[],
  totalDurationMs: number,
  silenceThresholdMs: number
): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  const sortedSpeech = [...speechSegments].sort((a, b) => a.startMs - b.startMs);

  for (const speech of sortedSpeech) {
    if (speech.startMs - cursor >= silenceThresholdMs) {
      segments.push(createSilenceSegment(cursor, speech.startMs));
    }
    segments.push(createSpeechSegment(speech.startMs, speech.endMs, speech.text));
    cursor = Math.max(cursor, speech.endMs);
  }

  if (totalDurationMs - cursor >= silenceThresholdMs) {
    segments.push(createSilenceSegment(cursor, totalDurationMs));
  }

  return segments;
}

function createSpeechSegment(startMs: number, endMs: number, text: string): Segment {
  return {
    id: crypto.randomUUID(),
    startMs,
    endMs,
    durationMs: endMs - startMs,
    text,
    type: "speech",
    selected: true
  };
}

function createSilenceSegment(startMs: number, endMs: number): Segment {
  return {
    id: crypto.randomUUID(),
    startMs,
    endMs,
    durationMs: endMs - startMs,
    text: "(静音)",
    type: "silence",
    selected: false,
    reason: "silence"
  };
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function jaccardSimilarity(a: string, b: string) {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function markDuplicates(segments: Segment[], similarity: number): Segment[] {
  const updated = segments.map((segment) => ({ ...segment }));
  const speechIndexes = updated
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.type === "speech");

  const groups: { index: number; normalized: string }[] = [];

  for (const { segment, index } of speechIndexes) {
    const normalized = normalizeText(segment.editedText ?? segment.text);
    if (!normalized) continue;

    const match = groups.find((group) => jaccardSimilarity(group.normalized, normalized) >= similarity);
    if (match) {
      const previous = updated[match.index];
      previous.selected = false;
      previous.reason = "duplicate";
      segment.selected = true;
      segment.reason = undefined;
      match.index = index;
      match.normalized = normalized;
    } else {
      groups.push({ index, normalized });
    }
  }

  return updated;
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

function mockTranscribe(audioPath: string, durationMs: number): TranscriptResult {
  const placeholder = "这里是示例转录文本。请在接入 ASR 后替换。";
  const segment: TranscriptSegment = {
    startMs: 0,
    endMs: Math.max(durationMs, 1000),
    text: placeholder
  };
  return {
    language: "zh",
    segments: [segment]
  };
}

type VolcengineResponse = {
  body: unknown;
  headers: Record<string, string>;
};

async function requestJson(url: string, headers: Record<string, string>, body: unknown): Promise<VolcengineResponse> {
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers
  };

  const response = await fetch(url, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Volcengine request failed: ${response.status} ${text}`);
  }

  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerMap[key.toLowerCase()] = value;
  });

  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    parsed = text;
  }

  return {
    body: parsed,
    headers: headerMap
  };
}

function extractTranscriptFromResponse(response: unknown, blankSplitMs?: number): TranscriptResult | null {
  if (!response || typeof response !== "object") return null;
  const data =
    (response as Record<string, unknown>).data ??
    (response as Record<string, unknown>).result ??
    (response as Record<string, unknown>).resp ??
    response;

  const status =
    (data as Record<string, unknown>)?.status ??
    (data as Record<string, unknown>)?.state ??
    (response as Record<string, unknown>)?.status;

  if (typeof status === "string") {
    const normalized = status.toLowerCase();
    if (!["done", "success", "completed", "finish", "finished"].includes(normalized)) {
      return null;
    }
  }

  const utterances =
    (data as Record<string, unknown>)?.utterances ??
    (data as Record<string, unknown>)?.result ??
    (data as Record<string, unknown>)?.segments ??
    (data as Record<string, unknown>)?.sentence_list;

  if (!Array.isArray(utterances)) return null;

  const segments: TranscriptSegment[] = utterances
    .flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const text = (record.text as string) || (record.utterance as string) || "";
      const start = Number(record.start_time ?? record.start_time_ms ?? record.start ?? record.startMs);
      const end = Number(record.end_time ?? record.end_time_ms ?? record.end ?? record.endMs);
      const wordsRaw =
        (record.words as unknown[]) ||
        (record.word_list as unknown[]) ||
        (record.word_list_v2 as unknown[]) ||
        [];

      const wordSegments = splitByWordTimestamps(wordsRaw, text, blankSplitMs);
      if (wordSegments.length > 0) {
        return wordSegments;
      }

      if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
      return [
        {
          startMs: start > 1000 ? start : start * 1000,
          endMs: end > 1000 ? end : end * 1000,
          text
        }
      ];
    })
    .filter((item): item is TranscriptSegment => Boolean(item));

  if (segments.length === 0) return null;

  return {
    segments
  };
}

type WordTimestamp = {
  text: string;
  startMs: number;
  endMs: number;
  blankMs?: number;
};

const SENTENCE_SPLIT_REGEX = /[。！？；，、.!?;]/u;
const BLANK_SPLIT_MS = 500;

function splitByWordTimestamps(wordsRaw: unknown[], utteranceText?: string, blankSplitMs?: number): TranscriptSegment[] {
  if (!Array.isArray(wordsRaw) || wordsRaw.length === 0) return [];

  const words: WordTimestamp[] = wordsRaw
    .map((word) => parseWord(word))
    .filter((item): item is WordTimestamp => Boolean(item));

  if (words.length === 0) return [];

  const splitThresholdMs =
    Number.isFinite(blankSplitMs) && (blankSplitMs as number) > 0 ? (blankSplitMs as number) : BLANK_SPLIT_MS;
  const boundaryIndices = getSentenceBoundaryIndices(utteranceText, words);
  const segments: TranscriptSegment[] = [];
  let buffer: WordTimestamp[] = [];
  let currentStart = Math.max(0, words[0].startMs);
  let previousEnd: number | null = null;

  const flush = (endMs: number) => {
    const safeStart = Math.max(0, currentStart);
    const safeEnd = Math.max(safeStart, endMs);
    const text = joinWords(buffer);
    if (text) {
      segments.push({
        startMs: safeStart,
        endMs: safeEnd,
        text
      });
    }
    buffer = [];
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (buffer.length > 0 && previousEnd !== null) {
      const gapMs = word.startMs - previousEnd;
      if (gapMs >= splitThresholdMs) {
        flush(previousEnd);
      }
    }

    if (buffer.length === 0) {
      currentStart = Math.max(0, word.startMs);
    }
    buffer.push(word);

    previousEnd = word.endMs;

    const hasPunc = SENTENCE_SPLIT_REGEX.test(word.text) || boundaryIndices.has(index);
    const hasBlank = typeof word.blankMs === "number" && word.blankMs >= splitThresholdMs;

    if (hasPunc || hasBlank) {
      flush(Math.max(0, word.endMs));
    }
  }

  if (buffer.length > 0) {
    flush(Math.max(0, buffer[buffer.length - 1].endMs));
  }

  return segments;
}

function parseWord(raw: unknown): WordTimestamp | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const text = String(record.word ?? record.text ?? record.utterance ?? "");
  const start = Number(record.start_time ?? record.start_time_ms ?? record.start ?? record.startMs);
  const end = Number(record.end_time ?? record.end_time_ms ?? record.end ?? record.endMs);
  const blank = Number(record.blank_duration ?? record.blank_duration_ms ?? record.blankDuration ?? record.blankDurationMs);
  if (!Number.isFinite(start) && !Number.isFinite(end)) return null;
  const startMsRaw = normalizeTimeMs(start);
  const endMsRaw = normalizeTimeMs(end);
  if (endMsRaw === null) return null;
  const startMs = startMsRaw ?? endMsRaw;
  if (endMsRaw < startMs) return null;
  const blankMs = normalizeBlankMs(blank);
  return {
    text,
    startMs,
    endMs: endMsRaw,
    blankMs
  };
}

type UtteranceToken = {
  type: "word" | "punct";
  text: string;
};

function getSentenceBoundaryIndices(utteranceText: string | undefined, words: WordTimestamp[]) {
  if (!utteranceText || words.length === 0) return new Set<number>();
  const tokens = tokenizeUtterance(utteranceText);
  const boundaries = new Set<number>();
  let wordIndex = -1;

  for (const token of tokens) {
    if (token.type === "word") {
      wordIndex += 1;
      if (wordIndex >= words.length) {
        break;
      }
      continue;
    }

    if (token.type === "punct" && wordIndex >= 0 && wordIndex < words.length) {
      boundaries.add(wordIndex);
    }
  }

  return boundaries;
}

function tokenizeUtterance(text: string): UtteranceToken[] {
  const tokens: UtteranceToken[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    tokens.push({ type: "word", text: buffer });
    buffer = "";
  };

  for (const char of text) {
    if (SENTENCE_SPLIT_REGEX.test(char)) {
      flush();
      tokens.push({ type: "punct", text: char });
      continue;
    }

    if (/\s/u.test(char)) {
      flush();
      continue;
    }

    if (isAsciiWordChar(char)) {
      buffer += char;
      continue;
    }

    flush();
    tokens.push({ type: "word", text: char });
  }

  flush();
  return tokens;
}

function joinWords(words: WordTimestamp[]) {
  if (words.length === 0) return "";
  let text = "";
  for (const word of words) {
    const next = word.text;
    if (!next) continue;
    if (text.length === 0) {
      text = next;
      continue;
    }
    const prevChar = text[text.length - 1];
    const nextChar = next[0];
    const needsSpace = isAsciiWordChar(prevChar) && isAsciiWordChar(nextChar);
    text = `${text}${needsSpace ? " " : ""}${next}`;
  }
  return text.replace(/\s+/g, " ").trim();
}

function isAsciiWordChar(char: string) {
  return /[A-Za-z0-9]/.test(char);
}

function normalizeTimeMs(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value > 1000 ? value : value * 1000;
}

function normalizeBlankMs(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value < 0) return 0;
  return value > 1000 ? value : value * 1000;
}

function assertNoError(response: VolcengineResponse, phase: "submit" | "query") {
  const headerCode = response.headers["x-api-status-code"];
  const headerMessage = response.headers["x-api-message"];
  const processingCodes = new Set(["20000001", "1000", "processing", "running"]);
  if (headerCode && headerCode !== "20000000" && headerCode !== "0") {
    if (phase === "query" && processingCodes.has(headerCode)) {
      return;
    }
    throw new Error(`Volcengine ${phase} error: ${headerCode} ${headerMessage ?? ""}`.trim());
  }

  if (!response.body || typeof response.body !== "object") return;
  const record = response.body as Record<string, unknown>;
  const code =
    record.code ??
    record.err_no ??
    record.error_code ??
    (record.data as Record<string, unknown> | undefined)?.code ??
    (record.data as Record<string, unknown> | undefined)?.err_no;

  if (code === undefined || code === null) return;

  if (typeof code === "number" && code === 0) return;
  if (typeof code === "string" && (code === "0" || code.toLowerCase() === "success")) return;
  if (phase === "query") {
    const normalized = String(code).toLowerCase();
    if (processingCodes.has(normalized)) return;
  }

  const message =
    record.message ??
    record.msg ??
    record.error_msg ??
    (record.data as Record<string, unknown> | undefined)?.message ??
    (record.data as Record<string, unknown> | undefined)?.msg ??
    "";

  throw new Error(`Volcengine ${phase} error: ${String(code)} ${message}`);
}

function buildAuthHeaders({
  apiKey,
  appKey,
  accessKey,
  resourceId,
  requestId,
  includeSequence
}: {
  apiKey?: string;
  appKey?: string;
  accessKey?: string;
  resourceId: string;
  requestId: string;
  includeSequence?: boolean;
}) {
  const headers: Record<string, string> = {
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": requestId
  };

  if (appKey && accessKey) {
    headers["X-Api-App-Key"] = appKey;
    headers["X-Api-Access-Key"] = accessKey;
  } else if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  if (includeSequence) {
    headers["X-Api-Sequence"] = "-1";
  }

  return headers;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
