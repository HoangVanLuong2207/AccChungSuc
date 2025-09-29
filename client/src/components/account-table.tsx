import { Copy, Key, Check, Power, Trash2, Search, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { Account, AccLog } from "@shared/schema";

type AccountLike = Account | AccLog;

interface AccountTableProps {
  accounts: AccountLike[];
  isLoading: boolean;
  searchTerm: string;
  statusFilter: "all" | "on" | "off";
  selectedAccounts: number[];
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "on" | "off") => void;
  onCopyUsername: (username: string) => void;
  onCopyPassword: (password: string) => void;
  onToggleStatus: (account: AccountLike) => void;
  onDeleteClick: (account: AccountLike) => void;
  onSelectedAccountsChange: (selectedIds: number[]) => void;
  onDeleteSelected: () => void;
  onExportSelected: () => void;
  onExportAll: () => void;
  onDeleteAll: () => void;
  totalCount: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  canPrev: boolean;
  canNext: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (pageSize: number) => void;
  title?: string;
  emptyMessage?: string;
}

const formatUpdatedAt = (value: AccountLike["updatedAt"]) =>
  new Date(value).toLocaleString("vi-VN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AccountTable({
  accounts,
  isLoading,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onCopyUsername,
  onCopyPassword,
  onToggleStatus,
  onDeleteClick,
  selectedAccounts,
  onSelectedAccountsChange,
  onDeleteSelected,
  onExportSelected,
  onExportAll,
  onDeleteAll,
  totalCount,
  page,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  canPrev,
  canNext,
  onPrevPage,
  onNextPage,
  onPageSizeChange,
  title = "Danh sách tài khoản",
  emptyMessage = "Không có tài khoản nào được tìm thấy",
}: AccountTableProps) {
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectedAccountsChange(accounts.map((acc) => acc.id));
    } else {
      onSelectedAccountsChange([]);
    }
  };

  const handleSelectRow = (accountId: number, checked: boolean) => {
    if (checked) {
      onSelectedAccountsChange([...selectedAccounts, accountId]);
    } else {
      onSelectedAccountsChange(selectedAccounts.filter((id) => id !== accountId));
    }
  };

  const baseIndex = (page - 1) * pageSize;
  const displayStart = totalCount === 0 ? 0 : Math.min(baseIndex + 1, totalCount);
  const displayEnd = totalCount === 0 ? 0 : Math.min(baseIndex + accounts.length, totalCount);
  const safePageSizeOptions = Array.from(new Set([...pageSizeOptions, pageSize])).sort((a, b) => a - b);

  const isAllSelected = accounts.length > 0 && selectedAccounts.length === accounts.length;
  const selectedCount = selectedAccounts.length;
  const hasSelection = selectedCount > 0;

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="border-b border-border/70 px-4 py-5 sm:px-6">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="space-y-3 px-4 py-6 sm:px-6">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/70 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3 text-card-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {totalCount} mục · {selectedCount} đang chọn
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-end">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 md:w-auto md:flex-nowrap">
              <div className="relative w-full sm:w-[240px]">
                <Input
                  type="text"
                  placeholder="Tìm kiếm tài khoản..."
                  value={searchTerm}
                  onChange={(event) => onSearchChange(event.target.value)}
                  className="h-10 w-full rounded-2xl border-border/70 pl-10 pr-3 text-sm"
                  data-testid="input-search-accounts"
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>

              <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as "all" | "on" | "off")}>
                <SelectTrigger className="h-10 w-full rounded-2xl border-border/70 text-sm sm:w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="on">Đang hoạt động</SelectItem>
                  <SelectItem value="off">Tạm dừng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Button
                className="h-10 rounded-2xl border-border/60 px-3 text-sm"
                variant="outline"
                size="sm"
                onClick={onExportAll}
                disabled={totalCount === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Xuất tất cả
              </Button>
              <Button
                className="h-10 rounded-2xl border-border/60 px-3 text-sm"
                variant="outline"
                size="sm"
                onClick={onExportSelected}
                disabled={!hasSelection}
              >
                <Download className="mr-2 h-4 w-4" />
                Xuất JS
              </Button>
              <Button
                className="h-10 rounded-2xl px-3 text-sm"
                variant="destructive"
                size="sm"
                onClick={onDeleteSelected}
                disabled={!hasSelection}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Xóa ({selectedCount})
              </Button>
              <Button className="h-10 rounded-2xl px-3 text-sm" variant="destructive" size="sm" onClick={onDeleteAll}>
                <Trash2 className="mr-2 h-4 w-4" />
                Xóa tất cả
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="overflow-hidden">
          <table className="w-full min-w-[880px] table-fixed">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-[48px] px-4 py-3">
                  <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} aria-label="Chọn tất cả" />
                </th>
                <th className="w-[72px] px-4 py-3">ID</th>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Mật khẩu</th>
                <th className="w-[160px] px-4 py-3">Trạng thái</th>
                <th className="w-[180px] px-4 py-3">Cập nhật</th>
                <th className="w-[220px] px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                accounts.map((account) => {
                  const statusClasses = account.status
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-rose-500/15 text-rose-600";

                  return (
                    <tr key={account.id} className="transition-colors hover:bg-muted/40" data-testid={`row-account-${account.id}`}>
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={selectedAccounts.includes(account.id)}
                          onCheckedChange={(checked) => handleSelectRow(account.id, !!checked)}
                          aria-label={`Chọn dòng ${account.id}`}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-card-foreground">#{account.id.toString().padStart(3, "0")}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 font-mono text-sm text-card-foreground" data-testid={`text-username-${account.id}`}>
                          {account.username}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 font-mono text-sm text-muted-foreground">
                          ••••••••
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          data-testid={`status-${account.id}`}
                          className={`inline-flex h-8 items-center gap-2 rounded-full border-0 px-3 text-xs font-semibold ${statusClasses}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {account.status ? "ON" : "OFF"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {formatUpdatedAt(account.updatedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 w-9 rounded-full border-primary/40 text-primary hover:bg-primary/10"
                            onClick={() => onCopyUsername(account.username)}
                            data-testid={`button-copy-username-${account.id}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 w-9 rounded-full border-primary/40 text-primary hover:bg-primary/10"
                            onClick={() => onCopyPassword(account.password)}
                            data-testid={`button-copy-password-${account.id}`}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-9 w-9 rounded-full ${
                              account.status
                                ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                                : "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                            }`}
                            onClick={() => onToggleStatus(account)}
                            data-testid={`button-toggle-status-${account.id}`}
                          >
                            {account.status ? <Check className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 w-9 rounded-full border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                            onClick={() => onDeleteClick(account)}
                            data-testid={`button-delete-${account.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden">
        {accounts.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">{emptyMessage}</div>
        ) : (
          <div className="flex flex-col gap-4 px-4 pb-6 sm:px-6">
            {accounts.map((account) => {
              const statusClasses = account.status
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-rose-500/15 text-rose-600";

              return (
                <div key={account.id} className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">#{account.id.toString().padStart(3, "0")}</div>
                      <div className="text-base font-semibold text-card-foreground" data-testid={`text-username-${account.id}`}>
                        {account.username}
                      </div>
                      <div className="text-xs text-muted-foreground">Cập nhật {formatUpdatedAt(account.updatedAt)}</div>
                      <Badge className={`mt-2 inline-flex items-center gap-2 rounded-full border-0 px-3 py-1 text-xs font-semibold ${statusClasses}`} data-testid={`status-${account.id}`}>
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {account.status ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <Checkbox
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={(checked) => handleSelectRow(account.id, !!checked)}
                      aria-label={`Chọn tài khoản ${account.username}`}
                    />
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-2xl border-primary/40 text-sm text-primary hover:bg-primary/10"
                      onClick={() => onCopyUsername(account.username)}
                      data-testid={`button-copy-username-${account.id}`}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy user
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-2xl border-primary/40 text-sm text-primary hover:bg-primary/10"
                      onClick={() => onCopyPassword(account.password)}
                      data-testid={`button-copy-password-${account.id}`}
                    >
                      <Key className="mr-2 h-4 w-4" />
                      Copy pass
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-10 rounded-2xl text-sm ${
                        account.status
                          ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                          : "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                      }`}
                      onClick={() => onToggleStatus(account)}
                      data-testid={`button-toggle-status-${account.id}`}
                    >
                      {account.status ? "Tắt tài khoản" : "Bật tài khoản"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-10 rounded-2xl text-sm"
                      onClick={() => onDeleteClick(account)}
                      data-testid={`button-delete-${account.id}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Xóa tài khoản
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-muted/30 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center text-sm text-muted-foreground sm:text-left">
            Hiển thị <span className="font-semibold text-card-foreground">{displayStart}-{displayEnd}</span> trên tổng
            <span className="font-semibold text-card-foreground"> {totalCount}</span> tài khoản
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Dòng/trang</span>
              <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                <SelectTrigger className="h-9 w-[120px] rounded-2xl text-sm" data-testid="select-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {safePageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} dòng
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button className="h-9 rounded-2xl px-3 text-sm" variant="outline" size="sm" onClick={onPrevPage} disabled={!canPrev}>
                Trước
              </Button>
              <span className="text-sm text-muted-foreground">
                Trang <span className="font-semibold text-card-foreground">{page}</span>
              </span>
              <Button className="h-9 rounded-2xl px-3 text-sm" variant="outline" size="sm" onClick={onNextPage} disabled={!canNext}>
                Sau
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
