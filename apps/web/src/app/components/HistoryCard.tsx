import { Project } from "@/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Clock, Film, Trash2, Pencil } from "lucide-react";
import { formatDate, formatDuration } from "@/utils/format";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { getThumbnailUrl } from "@/utils/storage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/app/components/ui/alert-dialog";

interface HistoryCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onEdit: (project: Project) => void;
}

const statusConfig = {
  draft: { label: "草稿", color: "bg-gray-100 text-gray-800" },
  parsed: { label: "已解析", color: "bg-blue-100 text-blue-800" },
  rendering: { label: "渲染中", color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "已完成", color: "bg-green-100 text-green-800" },
  failed: { label: "失败", color: "bg-red-100 text-red-800" }
};

export function HistoryCard({ project, onOpen, onDelete, onEdit }: HistoryCardProps) {
  const status = statusConfig[project.status ?? "draft"] ?? statusConfig.draft;
  const durationSeconds = Math.max(0, Math.round((project.totalDurationMs ?? 0) / 1000));
  const thumbnailUrl = getThumbnailUrl(project.id);

  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
      <div onClick={() => onOpen(project)} className="space-y-3">
        <div className="relative w-full overflow-hidden rounded-lg bg-gray-100">
          <ImageWithFallback
            src={thumbnailUrl}
            alt={project.title}
            className="w-full h-36 object-cover"
          />
          <div className="absolute right-2 top-2">
            <Badge className={status.color}>{status.label}</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-gray-900 truncate">{project.title}</h3>
          <p className="text-sm text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-1" />
            {formatDate(project.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Film className="h-4 w-4" />
            <span>{project.segments.length} 片段</span>
          </div>
          {durationSeconds > 0 && (
            <div>
              <span>时长: {formatDuration(durationSeconds)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(project);
          }}
        >
          <Pencil className="h-4 w-4 mr-1" />
          编辑
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后将无法恢复，包含视频、解析片段和渲染结果。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onDelete(project.id);
                }}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

    </Card>
  );
}
