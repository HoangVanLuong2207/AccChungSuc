import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteMultipleModalProps {
  isOpen: boolean;
  deleteCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export default function DeleteMultipleModal({ 
  isOpen, 
  deleteCount,
  onConfirm, 
  onCancel, 
  isDeleting 
}: DeleteMultipleModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <AlertTriangle className="text-destructive mr-3 h-5 w-5" />
            Xác nhận xóa tài khoản
          </DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa <span className="font-bold text-card-foreground">{deleteCount}</span> tài khoản đã chọn? 
            Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end space-x-3">
          <Button 
            variant="outline" 
            onClick={onCancel}
            disabled={isDeleting}
          >
            Hủy
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Đang xóa...' : `Xóa ${deleteCount} tài khoản`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
