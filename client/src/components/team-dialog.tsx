import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagDialogProps {
  open: boolean;
  mode: "single" | "bulk";
  subject?: string;
  itemCount: number;
  currentValue: string;
  isProcessing: boolean;
  onClose: () => void;
  onSave: (tag: string | null) => void;
}

export default function TagDialog({
  open,
  mode,
  subject,
  itemCount,
  currentValue,
  isProcessing,
  onClose,
  onSave,
}: TagDialogProps) {
  const [value, setValue] = useState(currentValue);
  const isBulk = mode === "bulk";

  useEffect(() => {
    if (open) {
      setValue(currentValue);
    }
  }, [currentValue, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) {
      return;
    }

    const trimmed = value.trim();
    onSave(trimmed.length > 0 ? trimmed : null);
  };

  const handleClear = () => {
    if (isProcessing) {
      return;
    }

    setValue("");
    onSave(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isProcessing) {
      onClose();
    }
  };

  const trimmed = value.trim();
  const canClear = trimmed.length === 0;

  const description = isBulk
    ? `Áp dụng tag cho ${itemCount} tài khoản đang chọn.`
    : subject
      ? `Cap nhat tag cho tài khoản ${subject}.`
      : "Cap nhat tag cho tài khoản.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{isBulk ? "Gắn tag hàng loạt" : "Cap nhat tag"}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {isBulk ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs font-semibold">
                  {itemCount}
                </Badge>
                <span>Tài khoản được áp dụng</span>
              </div>
            ) : subject ? (
              <div className="text-muted-foreground">
                <span className="font-medium text-card-foreground">{subject}</span>
                {currentValue ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Tag hien tai: <span className="font-medium">{currentValue}</span>)
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">Tối đa 64 ký tự. Để trống để xóa tag.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tag-name">Tên tag</Label>
            <Input
              id="tag-name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Nhap ten tag..."
              maxLength={64}
              disabled={isProcessing}
              autoFocus
            />
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!isProcessing) {
                  onClose();
                }
              }}
              disabled={isProcessing}
            >
              Hủy
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
                disabled={isProcessing || canClear}
              >
                Xóa tag
              </Button>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? "Đang lưu..." : "Lưu tag"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
