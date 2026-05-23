import { Project } from '@/types';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Clock, Film, Trash2 } from 'lucide-react';
import { formatDate, formatDuration } from '@/utils/format';

interface HistoryCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onDelete: (projectId: string) => void;
}

const statusConfig = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-800' },
  parsed: { label: '已解析', color: 'bg-blue-100 text-blue-800' },
  rendering: { label: '渲染中', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
};

export function HistoryCard({ project, onOpen, onDelete }: HistoryCardProps) {
  const status = statusConfig[project.status];

  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
      <div onClick={() => onOpen(project)} className="space-y-3">
        {/* 头部 */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{project.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              <Clock className="inline h-3 w-3 mr-1" />
              {formatDate(project.updatedAt)}
            </p>
          </div>
          <Badge className={status.color}>{status.label}</Badge>
        </div>

        {/* 信息 */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Film className="h-4 w-4" />
            <span>{project.segments.length} 片段</span>
          </div>
          {project.totalDuration > 0 && (
            <div>
              <span>时长: {formatDuration(project.totalDuration)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 删除按钮 */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('确定要删除这个项目吗？')) {
              onDelete(project.id);
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          删除
        </Button>
      </div>
    </Card>
  );
}
