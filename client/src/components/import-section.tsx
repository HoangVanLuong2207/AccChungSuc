import { useState } from "react";
import { Upload, Plus, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ImportSectionLabels {
  importTitle?: string;
  importButton?: string;
  totalLabel?: string;
  activeLabel?: string;
  inactiveLabel?: string;
}

interface ImportSectionProps {
  className?: string;
  onImportText: (text: string) => Promise<void> | void;
  isImporting: boolean;
  stats?: {
    total: number;
    active: number;
    inactive: number;
  };
  onUpdateAll?: (status: boolean) => void;
  isUpdatingAll?: boolean;
  labels?: ImportSectionLabels;
}

export default function ImportSection({
  onImportText,
  isImporting,
  stats,
  onUpdateAll,
  isUpdatingAll,
  labels,
  className,
}: ImportSectionProps) {
  const [textInput, setTextInput] = useState("");

  const {
    importTitle = "Import chung sức",
    importButton = "Import",
    totalLabel = "Tổng clone csuc",
    activeLabel = "Đang hoạt động",
    inactiveLabel = "Tạm dừng",
  } = labels ?? {};

  const handleImport = async () => {
    if (!textInput.trim()) {
      return;
    }

    try {
      await onImportText(textInput);
      setTextInput("");
    } catch (error) {
      console.error('Failed to import accounts', error);
    }
  };

  const lineCount = textInput.trim() ? textInput.trim().split('\n').filter(line => line.trim()).length : 0;

  return (
    <div className={cn("w-full lg:col-span-1", className)}>
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-card-foreground sm:text-lg">
          <Upload className="h-5 w-5 text-primary" />
          {importTitle}
        </h2>

        <div className="space-y-4">
          <div>
            <Label className="block text-sm font-medium text-muted-foreground mb-2">
              Nhập danh sách tài khoản ({lineCount} dòng)
            </Label>
            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="user1|pass1|lv10&#10;user2|pass2|lv25&#10;user3|pass3"
              className="min-h-[120px] font-mono text-sm"
              data-testid="textarea-import-accounts"
            />
          </div>

          <div className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <strong>Format:</strong> <code className="font-mono">user|pass|lvX</code><br />
            <span className="text-xs opacity-75">Mỗi dòng 1 tài khoản. Level có thể bỏ qua.</span>
          </div>

          <Button
            className="w-full"
            onClick={handleImport}
            disabled={!textInput.trim() || isImporting}
            data-testid="button-import-accounts"
          >
            <Plus className="mr-2 h-4 w-4" />
            {isImporting ? 'Đang xử lý...' : importButton}
          </Button>
        </div>

        {/* Stats Section */}
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="mb-3 flex items-center gap-2 text-md font-semibold text-card-foreground">
            <BarChart3 className="h-4 w-4" />
            Thống kê
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{totalLabel}:</span>
              <span className="font-medium text-card-foreground" data-testid="text-total-accounts">
                {stats?.total || 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{activeLabel}:</span>
              <span className="font-medium text-green-600" data-testid="text-active-accounts">
                {stats?.active || 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{inactiveLabel}:</span>
              <span className="font-medium text-red-600" data-testid="text-inactive-accounts">
                {stats?.inactive || 0}
              </span>
            </div>
            {onUpdateAll && (
              <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-1/2"
                  style={{ backgroundColor: 'springgreen', color: 'white' }}
                  onClick={() => onUpdateAll(true)}
                  disabled={isUpdatingAll}
                >
                  {isUpdatingAll ? 'Đang bật...' : 'ON all'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-1/2"
                  style={{ backgroundColor: '#DC143C', color: 'white' }}
                  onClick={() => onUpdateAll(false)}
                  disabled={isUpdatingAll}
                >
                  {isUpdatingAll ? 'Đang tắt...' : 'OFF all'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
