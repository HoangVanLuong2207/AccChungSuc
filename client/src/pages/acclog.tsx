import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, Upload } from "lucide-react";
import AccountTable from "@/components/account-table";
import ImportSection from "@/components/import-section";
import DeleteModal from "@/components/delete-modal";
import DeleteMultipleModal from "@/components/delete-multiple-modal";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AccLog } from "@shared/schema";

interface AccLogStats {
  total: number;
  active: number;
  inactive: number;
}

export default function AccLogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [logToDelete, setLogToDelete] = useState<AccLog | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");
  const [selectedLogs, setSelectedLogs] = useState<number[]>([]);
  const [isDeleteMultipleModalOpen, setDeleteMultipleModalOpen] = useState(false);
  const [isDeleteAll, setDeleteAll] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number; errorDetails: any[] } | null>(null);
  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const importSectionLabels = {
    importTitle: "Import log",
    importButton: "Import log",
    totalLabel: "Tổng acc log",
    activeLabel: "Đang hoạt động",
    inactiveLabel: "Tạm dừng",
  };

  // Fetch logs
  const { data: accounts = [], isLoading } = useQuery<AccLog[]>({
    queryKey: ['/api/acclogs']
  });

  // Update all log statuses mutation
  const updateAllLogsMutation = useMutation({
    mutationFn: async (status: boolean) => {
      await apiRequest('PATCH', '/api/acclogs/status-all', { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs/stats'] });
      toast({
        title: "Thành công",
        description: 'Đã cập nhật trạng thái cho toàn bộ acc log',
      });
    },
    onError: () => {
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật trạng thái toàn bộ acc log',
        variant: 'destructive',
      });
    },
  });

  // Fetch statistics
  const { data: stats } = useQuery<AccLogStats>({
    queryKey: ['/api/acclogs/stats']
  });

  // Toggle log status mutation
  const toggleLogStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: boolean }) => {
      await apiRequest('PATCH', `/api/acclogs/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs/stats'] });
      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái acc log",
      });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái acc log",
        variant: "destructive",
      });
    },
  });

  // Delete log mutation
  const deleteLogMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/acclogs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs/stats'] });
      setLogToDelete(null);
      toast({
        title: "Thành công",
        description: "Đã xóa acc log",
      });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể xóa acc log",
        variant: "destructive",
      });
    },
  });

  // Delete multiple logs mutation
  const deleteMultipleLogsMutation = useMutation({
    mutationFn: async (ids?: number[]) => {
      await apiRequest('DELETE', '/api/acclogs', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs/stats'] });
      setSelectedLogs([]);
      setDeleteMultipleModalOpen(false);
      toast({
        title: "Thành công",
        description: "Đã xóa các acc log đã chọn",
      });
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể xóa các acc log",
        variant: "destructive",
      });
    },
  });

  // Import logs mutation
  const importLogsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/acclogs/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/acclogs/stats'] });
      setImportResult(data);
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Thành công",
        description: `Đã copy ${type} vào clipboard!`,
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể copy vào clipboard",
        variant: "destructive",
      });
    }
  };

  const handleToggleLogStatus = (account: AccLog) => {
    toggleLogStatusMutation.mutate({ id: account.id, status: !account.status });
  };

  const handleDeleteClick = (account: AccLog) => {
    setLogToDelete(account);
  };

  const handleConfirmDelete = () => {
    if (logToDelete) {
      deleteLogMutation.mutate(logToDelete.id);
    }
  };

  const handleImportLogs = (file: File) => {
    importLogsMutation.mutate(file);
  };

  const exportLogsToJs = (accountsToExport: AccLog[], filenamePrefix: string) => {
    const exportPayload = accountsToExport.map(({ username, password }) => ({ username, password }));
    const fileContent = `${JSON.stringify(exportPayload, null, 2)}\n`;

    if (typeof window === "undefined") {
      return false;
    }

    const blob = new Blob([fileContent], { type: "application/javascript;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    link.href = url;
    link.download = `${filenamePrefix}-${timestamp}.js`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return true;
  };

  const handleExportSelectedLogs = () => {
    const selectedData = accounts.filter((account) => selectedLogs.includes(account.id));

    if (selectedData.length === 0) {
      toast({
        title: "Chưa có acc log",
        description: "Hãy chọn ít nhất một acc log để xuất",
      });
      return;
    }

    const didExport = exportLogsToJs(selectedData, "acclogs-selected");

    if (!didExport) {
      toast({
        title: "Lỗi",
        description: "Không thể tạo file xuất, vui lòng thử lại",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Thành công",
      description: `Đã xuất ${selectedData.length} acc log đã chọn`,
    });
  };

  const handleDeleteSelectedLogs = () => {
    setDeleteAll(false);
    setDeleteMultipleModalOpen(true);
  };

  const handleDeleteAllLogs = () => {
    setDeleteAll(true);
    setDeleteMultipleModalOpen(true);
  };

  const handleConfirmDeleteMultipleLogs = () => {
    if (isDeleteAll) {
      deleteMultipleLogsMutation.mutate(undefined);
    } else {
      deleteMultipleLogsMutation.mutate(selectedLogs);
    }
  };

  // Filter logs
  const filteredLogs = accounts.filter((account) => {
    const matchesSearch = account.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "on" && account.status) ||
      (statusFilter === "off" && !account.status);
    return matchesSearch && matchesStatus;
  });

  const handleExportAllLogs = () => {
    if (filteredLogs.length === 0) {
      toast({
        title: "Chưa có dữ liệu",
        description: "Không có acc log nào để xuất",
      });
      return;
    }

    const didExport = exportLogsToJs(filteredLogs, "acclogs-all");

    if (!didExport) {
      toast({
        title: "Lỗi",
        description: "Không thể tạo file xuất, vui lòng thử lại",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Thành công",
      description: `Đã xuất toàn bộ ${filteredLogs.length} acc log`,
    });
  };

  // Reset to first page when filters/search change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  // Slice per page
  const totalCount = filteredLogs.length;
  const startIndex = (page - 1) * pageSize;
  const limitedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Page Header */}
      <div className="mb-8 flex flex-col gap-4 font-sans md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">Kho log </h1>
          <p className="text-muted-foreground">Quản lý và theo dõi tất cả các acc log trong hệ thống</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:justify-end">
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => navigate('/')}>
            Về kho chung sức
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Import Section */}
        <ImportSection
          className="hidden lg:block"
          onImport={handleImportLogs}
          isImporting={importLogsMutation.isPending}
          stats={stats}
          onUpdateAll={(status: boolean) => updateAllLogsMutation.mutate(status)}
          isUpdatingAll={updateAllLogsMutation.isPending}
          labels={importSectionLabels}
        />

        {/* Accounts Table */}
        <div className="lg:col-span-3">
          <AccountTable
            title=""
            emptyMessage="Không có acc log nào được tìm thấy"
            accounts={limitedLogs}
            isLoading={isLoading}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            onSearchChange={setSearchTerm}
            onStatusFilterChange={setStatusFilter}
            onCopyUsername={(username) => copyToClipboard(username, 'acc log')}
            onCopyPassword={(password) => copyToClipboard(password, 'mật khẩu')}
            onToggleStatus={handleToggleLogStatus}
            onDeleteClick={handleDeleteClick}
            selectedAccounts={selectedLogs}
            onSelectedAccountsChange={setSelectedLogs}
            onDeleteSelected={handleDeleteSelectedLogs}
            onExportSelected={handleExportSelectedLogs}
            onExportAll={handleExportAllLogs}
            onDeleteAll={handleDeleteAllLogs}
            totalCount={totalCount}
            page={page}
            pageSize={pageSize}
            canPrev={canPrev}
            canNext={canNext}
            onPrevPage={() => canPrev && setPage((p) => p - 1)}
            onNextPage={() => canNext && setPage((p) => p + 1)}
          />
        </div>
      </div>


      {/* Mobile Import Entry */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="h-4 w-4" />
              Import & Thống kê
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-3xl pb-8">
            <SheetHeader className="px-1">
              <SheetTitle>Import & Thống kê</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <ImportSection
                className="mx-auto w-full max-w-lg"
                onImport={handleImportLogs}
                isImporting={importLogsMutation.isPending}
                stats={stats}
                onUpdateAll={(status: boolean) => updateAllLogsMutation.mutate(status)}
                isUpdatingAll={updateAllLogsMutation.isPending}
                labels={importSectionLabels}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={!!logToDelete}
        accountName={logToDelete?.username || ""}
        onConfirm={handleConfirmDelete}
        onCancel={() => setLogToDelete(null)}
        isDeleting={deleteLogMutation.isPending}
      />

      {/* Delete Multiple Confirmation Modal */}
      <DeleteMultipleModal
        isOpen={isDeleteMultipleModalOpen}
        deleteCount={isDeleteAll ? accounts.length : selectedLogs.length}
        onConfirm={handleConfirmDeleteMultipleLogs}
        onCancel={() => setDeleteMultipleModalOpen(false)}
        isDeleting={deleteMultipleLogsMutation.isPending}
      />

      {/* Import Result Dialog */}
      <AlertDialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kết quả Import</AlertDialogTitle>
            <AlertDialogDescription>
              <p>Đã import thành công: {importResult?.imported || 0} acc log.</p>
              <p>Số acc log lỗi: {importResult?.errors || 0}.</p>
              {importResult && importResult.errors > 0 && (
                <div className="mt-4 max-h-60 overflow-y-auto">
                  <h4 className="font-semibold">Chi tiết lỗi:</h4>
                  <ul className="list-disc pl-5 text-sm">
                    {importResult.errorDetails.map((err, index) => (
                      <li key={index}>
                        <strong>{err.account.username}:</strong> {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Đóng</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}




