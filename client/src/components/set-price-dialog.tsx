import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SetPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SetPriceDialog({ open, onOpenChange }: SetPriceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sessionName, setSessionName] = useState("");
  const [pricePerAccount, setPricePerAccount] = useState("");

  const setPriceMutation = useMutation({
    mutationFn: async (data: { sessionName: string; pricePerAccount: number }) => {
      return apiRequest("POST", "/api/revenue/set-price", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/active-session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/current-session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/stats"] });
      // Force refetch
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["/api/revenue/current-session"], exact: false });
        queryClient.refetchQueries({ queryKey: ["/api/revenue/active-session"], exact: false });
      }, 500);
      toast({
        title: "Đã set giá thành công",
        description: `Buổi live "${sessionName}" với giá ${pricePerAccount}đ/acc đã được tạo`,
      });
      setSessionName("");
      setPricePerAccount("");
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể set giá";
      toast({
        title: "Set giá thất bại",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(pricePerAccount, 10);
    if (!sessionName.trim()) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập tên buổi live",
        variant: "destructive",
      });
      return;
    }
    if (isNaN(price) || price < 0) {
      toast({
        title: "Giá không hợp lệ",
        description: "Vui lòng nhập giá hợp lệ (số nguyên >= 0)",
        variant: "destructive",
      });
      return;
    }
    setPriceMutation.mutate({ sessionName: sessionName.trim(), pricePerAccount: price });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border border-border/60 bg-[#EEEEEE] text-gray-900 shadow-lg backdrop-blur dark:bg-neutral-900 dark:text-gray-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Set giá cho buổi live
          </DialogTitle>
          <DialogDescription>
            Nhập tên buổi live và giá mỗi account. Khi account chuyển từ OFF sang ON sẽ tự động tính doanh thu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionName">Tên buổi live</Label>
            <Input
              id="sessionName"
              placeholder="Ví dụ: Live ngày 01/01/2024"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              disabled={setPriceMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pricePerAccount">Giá mỗi account (VNĐ)</Label>
            <Input
              id="pricePerAccount"
              type="number"
              placeholder="Ví dụ: 10000"
              value={pricePerAccount}
              onChange={(e) => setPricePerAccount(e.target.value)}
              disabled={setPriceMutation.isPending}
              min="0"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={setPriceMutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={setPriceMutation.isPending}>
              {setPriceMutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

