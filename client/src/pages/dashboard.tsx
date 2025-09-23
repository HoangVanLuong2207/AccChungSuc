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
import type { Account } from "@shared/schema";

interface AccountStats {
  total: number;
  active: number;
  inactive: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [isDeleteMultipleModalOpen, setDeleteMultipleModalOpen] = useState(false);
  const [isDeleteAll, setDeleteAll] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number; errorDetails: any[] } | null>(null);
  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch accounts
  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['/api/accounts']
  });

  // Update all account statuses mutation
  const updateAllStatusesMutation = useMutation({
    mutationFn: async (status: boolean) => {
      await apiRequest('PATCH', '/api/accounts/status-all', { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/stats'] });
      toast({
        title: "ThĂ nh cĂ´ng",
        description: 'ÄĂ£ cáº­p nháº­t tráº¡ng thĂ¡i cho toĂ n bá»™ tĂ i khoáº£n',
      });
    },
    onError: () => {
      toast({
        title: 'Lá»—i',
        description: 'KhĂ´ng thá»ƒ cáº­p nháº­t tráº¡ng thĂ¡i toĂ n bá»™',
        variant: 'destructive',
      });
    },
  });

  // Fetch statistics
  const { data: stats } = useQuery<AccountStats>({
    queryKey: ['/api/accounts/stats']
  });

  // Toggle account status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: boolean }) => {
      await apiRequest('PATCH', `/api/accounts/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/stats'] });
      toast({
        title: "ThĂ nh cĂ´ng",
        description: "ÄĂ£ cáº­p nháº­t tráº¡ng thĂ¡i tĂ i khoáº£n",
      });
    },
    onError: () => {
      toast({
        title: "Lá»—i",
        description: "KhĂ´ng thá»ƒ cáº­p nháº­t tráº¡ng thĂ¡i",
        variant: "destructive",
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/stats'] });
      setAccountToDelete(null);
      toast({
        title: "ThĂ nh cĂ´ng",
        description: "ÄĂ£ xĂ³a tĂ i khoáº£n",
      });
    },
    onError: () => {
      toast({
        title: "Lá»—i",
        description: "KhĂ´ng thá»ƒ xĂ³a tĂ i khoáº£n",
        variant: "destructive",
      });
    },
  });

  // Delete multiple accounts mutation
  const deleteMultipleAccountsMutation = useMutation({
    mutationFn: async (ids?: number[]) => {
      await apiRequest('DELETE', '/api/accounts', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/stats'] });
      setSelectedAccounts([]);
      setDeleteMultipleModalOpen(false);
      toast({
        title: "ThĂ nh cĂ´ng",
        description: "ÄĂ£ xĂ³a cĂ¡c tĂ i khoáº£n Ä‘Ă£ chá»n",
      });
    },
    onError: () => {
      toast({
        title: "Lá»—i",
        description: "KhĂ´ng thá»ƒ xĂ³a cĂ¡c tĂ i khoáº£n",
        variant: "destructive",
      });
    },
  });

  // Import accounts mutation
  const importAccountsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/accounts/import', {
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
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/stats'] });
      setImportResult(data);
    },
    onError: (error) => {
      toast({
        title: "Lá»—i",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "ThĂ nh cĂ´ng",
        description: `ÄĂ£ copy ${type} vĂ o clipboard!`,
      });
    } catch (error) {
      toast({
        title: "Lá»—i",
        description: "KhĂ´ng thá»ƒ copy vĂ o clipboard",
        variant: "destructive",
      });
    }
  };

  const handleToggleStatus = (account: Account) => {
    toggleStatusMutation.mutate({ id: account.id, status: !account.status });
  };

  const handleDeleteClick = (account: Account) => {
    setAccountToDelete(account);
  };

  const handleConfirmDelete = () => {
    if (accountToDelete) {
      deleteAccountMutation.mutate(accountToDelete.id);
    }
  };

  const handleImport = (file: File) => {
    importAccountsMutation.mutate(file);
  };

  const exportAccountsToJs = (accountsToExport: Account[], filenamePrefix: string) => {
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

  const handleExportSelected = () => {
    const selectedData = accounts.filter((account) => selectedAccounts.includes(account.id));

    if (selectedData.length === 0) {
      toast({
        title: "ChÆ°a cĂ³ tĂ i khoáº£n",
        description: "HĂ£y chá»n Ă­t nháº¥t má»™t tĂ i khoáº£n Ä‘á»ƒ xuáº¥t",
      });
      return;
    }

    const didExport = exportAccountsToJs(selectedData, "accounts-selected");

    if (!didExport) {
      toast({
        title: "Lá»—i",
        description: "KhĂ´ng thá»ƒ táº¡o file xuáº¥t, vui lĂ²ng thá»­ láº¡i",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "ThĂ nh cĂ´ng",
      description: `ÄĂ£ xuáº¥t ${selectedData.length} tĂ i khoáº£n Ä‘Ă£ chá»n`,
    });
  };

  const handleDeleteSelected = () => {
    setDeleteAll(false);
    setDeleteMultipleModalOpen(true);
  };

  const handleDeleteAll = () => {
    setDeleteAll(true);
    setDeleteMultipleModalOpen(true);
  };

  const handleConfirmDeleteMultiple = () => {
    if (isDeleteAll) {
      deleteMultipleAccountsMutation.mutate(undefined);
    } else {
      deleteMultipleAccountsMutation.mutate(selectedAccounts);
    }
  };

  // Filter accounts
  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch = account.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "on" && account.status) ||
      (statusFilter === "off" && !account.status);
    return matchesSearch && matchesStatus;
  });

  const handleExportAll = () => {
    if (filteredAccounts.length === 0) {
      toast({
        title: "ChÆ°a cĂ³ dá»¯ liá»‡u",
        description: "KhĂ´ng cĂ³ tĂ i khoáº£n nĂ o Ä‘á»ƒ xuáº¥t",
      });
      return;
    }

    const didExport = exportAccountsToJs(filteredAccounts, "accounts-all");

    if (!didExport) {
      toast({
        title: "Lá»—i",
        description: "KhĂ´ng thá»ƒ táº¡o file xuáº¥t, vui lĂ²ng thá»­ láº¡i",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "ThĂ nh cĂ´ng",
      description: `ÄĂ£ xuáº¥t toĂ n bá»™ ${filteredAccounts.length} tĂ i khoáº£n`,
    });
  };

  // Reset to first page when filters/search change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  // Slice per page
  const totalCount = filteredAccounts.length;
  const startIndex = (page - 1) * pageSize;
  const limitedAccounts = filteredAccounts.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Page Header */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">Kho chung sức</h1>
          <p className="text-muted-foreground">Quản lý và theo dõi tất cả các acc làm chung sức trong hệ thống</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:justify-end">
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => navigate('/acclogs')}>
           Về kho log
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
           Đăng xuất  
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Import Section */}
        <ImportSection
          className="hidden lg:block"
          onImport={handleImport}
          isImporting={importAccountsMutation.isPending}
          stats={stats}
          onUpdateAll={(status: boolean) => updateAllStatusesMutation.mutate(status)}
          isUpdatingAll={updateAllStatusesMutation.isPending}
        />

        {/* Accounts Table */}
        <div className="lg:col-span-3">
          <AccountTable
            accounts={limitedAccounts}
            isLoading={isLoading}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            onSearchChange={setSearchTerm}
            onStatusFilterChange={setStatusFilter}
            onCopyUsername={(username) => copyToClipboard(username, 'tĂ i khoáº£n')}
            onCopyPassword={(password) => copyToClipboard(password, 'máº­t kháº©u')}
            onToggleStatus={handleToggleStatus}
            onDeleteClick={handleDeleteClick}
            selectedAccounts={selectedAccounts}
            onSelectedAccountsChange={setSelectedAccounts}
            onDeleteSelected={handleDeleteSelected}
            onExportSelected={handleExportSelected}
            onExportAll={handleExportAll}
            onDeleteAll={handleDeleteAll}
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
                onImport={handleImport}
                isImporting={importAccountsMutation.isPending}
                stats={stats}
                onUpdateAll={(status: boolean) => updateAllStatusesMutation.mutate(status)}
                isUpdatingAll={updateAllStatusesMutation.isPending}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={!!accountToDelete}
        accountName={accountToDelete?.username || ""}
        onConfirm={handleConfirmDelete}
        onCancel={() => setAccountToDelete(null)}
        isDeleting={deleteAccountMutation.isPending}
      />

      {/* Delete Multiple Confirmation Modal */}
      <DeleteMultipleModal
        isOpen={isDeleteMultipleModalOpen}
        deleteCount={isDeleteAll ? accounts.length : selectedAccounts.length}
        onConfirm={handleConfirmDeleteMultiple}
        onCancel={() => setDeleteMultipleModalOpen(false)}
        isDeleting={deleteMultipleAccountsMutation.isPending}
      />

      {/* Import Result Dialog */}
      <AlertDialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Káº¿t quáº£ Import</AlertDialogTitle>
            <AlertDialogDescription>
              <p>ÄĂ£ import thĂ nh cĂ´ng: {importResult?.imported || 0} tĂ i khoáº£n.</p>
              <p>Sá»‘ tĂ i khoáº£n lá»—i: {importResult?.errors || 0}.</p>
              {importResult && importResult.errors > 0 && (
                <div className="mt-4 max-h-60 overflow-y-auto">
                  <h4 className="font-semibold">Chi tiáº¿t lá»—i:</h4>
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
            <AlertDialogAction>ÄĂ³ng</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
