import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, Upload, Loader2 } from "lucide-react";
import AccountTable from "@/components/account-table";
import ImportSection from "@/components/import-section";
import DeleteModal from "@/components/delete-modal";
import DeleteMultipleModal from "@/components/delete-multiple-modal";
import ThemeToggle from '@/components/theme-toggle';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

import type { AccLog } from "@shared/schema";

interface AccLogStats {
  total: number;
  active: number;
  inactive: number;
}

type ImportLogsResponse = {
  imported: number;
  errors: number;
  accLogs: AccLog[];
  errorDetails: Array<{ account: unknown; error: string }>;
};

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
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50, 100];

  const [isImportProgressOpen, setImportProgressOpen] = useState(false);
  const [importProgressValue, setImportProgressValue] = useState(0);
  const [importProgressMeta, setImportProgressMeta] = useState<{ total: number | null; fileName: string } | null>(null);
  const [lastImportMeta, setLastImportMeta] = useState<{ total: number | null; fileName: string } | null>(null);
  const importProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const importProgressCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopImportProgress = () => {
    if (importProgressTimerRef.current !== null) {
      clearInterval(importProgressTimerRef.current);
      importProgressTimerRef.current = null;
    }
  };

  const clearImportCloseTimeout = () => {
    if (importProgressCloseTimeoutRef.current !== null) {
      clearTimeout(importProgressCloseTimeoutRef.current);
      importProgressCloseTimeoutRef.current = null;
    }
  };

  const startImportProgress = () => {
    stopImportProgress();
    importProgressTimerRef.current = setInterval(() => {
      setImportProgressValue((prev) => {
        if (prev >= 95) {
          return prev;
        }
        const next = prev + Math.random() * 8 + 2;
        return next > 95 ? 95 : next;
      });
    }, 400);
  };

  const waitForProgressClose = (ms: number) =>
    new Promise<void>((resolve) => {
      clearImportCloseTimeout();
      importProgressCloseTimeoutRef.current = setTimeout(() => {
        importProgressCloseTimeoutRef.current = null;
        resolve();
      }, ms);
    });

  const resetImportProgressState = () => {
    setImportProgressOpen(false);
    setImportProgressMeta(null);
    setImportProgressValue(0);
  };

  useEffect(() => {
    return () => {
      stopImportProgress();
      clearImportCloseTimeout();
    };
  }, []);

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
  mutationFn: async (file: File): Promise<ImportLogsResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/acclogs/import', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const raw = await response.json().catch(() => null) as unknown;

    if (!response.ok) {
      const message =
        raw && typeof raw === 'object' && 'message' in raw
          ? (raw as { message?: string }).message
          : undefined;
      throw new Error(message || 'Import failed');
    }

    if (!raw || typeof raw !== 'object') {
      throw new Error('Import failed');
    }

    return raw as ImportLogsResponse;
  },
  onError: (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Khong the import acc log';
    toast({
      title: 'Loi',
      description: message,
      variant: 'destructive',
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


  const handleImportLogs = async (file: File) => {
    let total: number | null = null;

    try {
      const fileContent = await file.text();
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        total = parsed.length;
      }
    } catch {
      total = null;
    }

    const progressMeta = { total, fileName: file.name };

    setImportProgressMeta(progressMeta);
    setImportProgressValue(5);
    setImportProgressOpen(true);
    startImportProgress();

    try {
      const result = await importLogsMutation.mutateAsync(file);
      stopImportProgress();
      setImportProgressValue(100);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/acclogs'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/acclogs/stats'] }),
      ]);

      await waitForProgressClose(500);
      resetImportProgressState();
      setLastImportMeta(progressMeta);
      setImportResult(result);
    } catch (error) {
      resetImportProgressState();
      throw error;
    } finally {
      stopImportProgress();
      clearImportCloseTimeout();
    }
  };

  const exportLogsToJs = (accountsToExport: AccLog[], filenamePrefix: string) => {
    const exportPayload = accountsToExport.map(({ username, password }) => ({ username, password }));
    const fileContent = `${JSON.stringify(exportPayload, null, 2)}\n`;

    if (typeof window === 'undefined') {
      return false;
    }

    const blob = new Blob([fileContent], { type: 'application/javascript;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

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

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
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

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, pageSize, totalCount]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:py-10">
      {/* Page Header */}
      <div className="rounded-3xl border border-border bg-card/90 p-6 shadow-sm backdrop-blur-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary">Kho acc log</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl lg:text-[40px]">
              Log rác ~Lv30
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Giám sát trạng thái, xử lý import và hành động hàng loạt cho toàn bộ acc log của đội ngũ chỉ với vài thao tác.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <ThemeToggle className="self-end sm:self-auto" />
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => navigate('/')}>
              Về kho chung sức
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        {/* Import Section */}
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-24 lg:h-fit">
            <ImportSection
              className="lg:block"
              onImport={handleImportLogs}
              isImporting={importLogsMutation.isPending}
              stats={stats}
              onUpdateAll={(status: boolean) => updateAllLogsMutation.mutate(status)}
              isUpdatingAll={updateAllLogsMutation.isPending}
              labels={importSectionLabels}
            />
          </div>
        </aside>

        {/* Accounts Table */}
        <main className="flex flex-col gap-6">
          <AccountTable
            title="Danh sách acc log"
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
            pageSizeOptions={pageSizeOptions}
            canPrev={canPrev}
            canNext={canNext}
            onPrevPage={() => canPrev && setPage((p) => p - 1)}
            onNextPage={() => canNext && setPage((p) => p + 1)}
            onPageSizeChange={handlePageSizeChange}
          />
        </main>
      </div>
      {/* Mobile Import Entry */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="h-4 w-4" />
              Import & thống kê log
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-3xl pb-8">
            <SheetHeader className="px-1">
              <SheetTitle>Import & thống kê log</SheetTitle>
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




      <Dialog
        open={isImportProgressOpen}
        onOpenChange={(open) => {
          if (importLogsMutation.isPending) {
            return;
          }

          if (!open) {
            resetImportProgressState();
            return;
          }

          setImportProgressOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dang them acc log</DialogTitle>
            <DialogDescription>
              {importProgressMeta ? (
                <span className="block">
                  Đang xử lý{' '}
                  {importProgressMeta.total !== null ? (
                    <span className="font-medium text-foreground">
                      {importProgressMeta.total} acc log
                    </span>
                  ) : (
                    'du lieu'
                  )}
                  {' '}tu file{' '}
                  <span className="break-all font-medium text-foreground">
                    {importProgressMeta.fileName}
                  </span>.
                </span>
              ) : (
                'He thong dang xu ly file cua ban.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <span>Vui lòng chờ trong giây lát...</span>
            </div>
            <Progress value={importProgressValue} className="h-2" />
            {importProgressMeta && importProgressMeta.total !== null ? (
              <p className="text-xs text-muted-foreground">
                Tổng số acc log trong file: {importProgressMeta.total}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Result Dialog */}
      <AlertDialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ket qua Import</AlertDialogTitle>
            <AlertDialogDescription>
              {lastImportMeta && (
                <p>
                  Tổng số acc log trong file: {lastImportMeta.total !== null ? lastImportMeta.total : 'Khong xac dinh'}.
                </p>
              )}
              <p>Đã import thành công: {importResult?.imported || 0} acc log.</p>
              <p>Số lỗi: {importResult?.errors || 0}.</p>
              {importResult && importResult.errors > 0 && (
                <div className="mt-4 max-h-60 overflow-y-auto">
                  <h4 className="font-semibold">Chi tiet loi:</h4>
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
            <AlertDialogAction>Dong</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
