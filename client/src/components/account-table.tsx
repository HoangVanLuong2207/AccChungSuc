import { Copy, Key, Check, Power, Trash2, Search, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  totalCount: number; // tổng số bản ghi sau khi lọc (để hiển thị footer)
  page: number;
  pageSize: number;
  canPrev: boolean;
  canNext: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  title?: string;
  emptyMessage?: string;
}

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
  canPrev,
  canNext,
  onPrevPage,
  onNextPage,
  title = "",
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

  const isAllSelected = accounts.length > 0 && selectedAccounts.length === accounts.length;
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      {/* Table Header */}
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <Users className="h-5 w-5 text-primary" />
            {title}
          </h2>
          
          {/* Search and Filter */}
          <div className="flex w-full items-center gap-2 sm:flex-nowrap">
            {/* Search */}
            <div className="relative flex-none w-36 sm:w-40">
              <Input
                type="text"
                placeholder="Tìm kiếm tên lô..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-8 w-full pl-8 pr-2 text-sm"
                data-testid="input-search-accounts"
              />
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>

            {/* Status */}
            <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as "all" | "on" | "off")}>
              <SelectTrigger className="h-8 w-28 text-sm" data-testid="select-status-filter">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="on">Đang hoạt động</SelectItem>
                <SelectItem value="off">Tạm dừng</SelectItem>
              </SelectContent>
            </Select>

            {/* Buttons */}
            <Button className="h-8 flex-none px-3 text-sm" variant="outline" size="sm" onClick={onExportAll} disabled={totalCount === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Xuất tất cả
            </Button>

            <Button className="h-8 flex-none px-3 text-sm" variant="outline" size="sm" onClick={onExportSelected} disabled={selectedAccounts.length === 0}>
              <Download className="mr-1.5 h-4 w-4" />
              Xuất JS
            </Button>

            <Button className="h-8 flex-none px-3 text-sm" variant="destructive" size="sm" onClick={onDeleteSelected} disabled={selectedAccounts.length === 0}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Xóa ({selectedAccounts.length})
            </Button>

            <Button className="h-8 flex-none px-3 text-sm" variant="destructive" size="sm" onClick={onDeleteAll}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Xóa tất cả
            </Button>
          </div>

        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto pb-4">
        <table className="w-full min-w-[720px]">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
              <th className="px-4 py-3 sm:px-6 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ID
              </th>
              <th className="px-4 py-3 sm:px-6 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tài khoản
              </th>
              <th className="px-4 py-3 sm:px-6 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Mật khẩu
              </th>
              <th className="px-4 py-3 sm:px-6 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Trạng thái
              </th>
              <th className="px-4 py-3 sm:px-6 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Lần cuối login
              </th>
              <th className="px-4 py-3 sm:px-6 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 sm:px-6 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="hover:bg-muted/50 transition-colors" data-testid={`row-account-${account.id}`}>
                   <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={(checked) => handleSelectRow(account.id, !!checked)}
                      aria-label={`Select row ${account.id}`}
                    />
                  </td>
                  <td className="px-4 py-4 sm:px-6 whitespace-nowrap text-sm font-medium text-card-foreground">
                    {account.id.toString().padStart(3, '0')}
                  </td>
                  <td className="px-4 py-4 sm:px-6 whitespace-nowrap text-sm text-card-foreground">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                      <span className="font-mono bg-muted px-2 py-1 rounded text-xs" data-testid={`text-username-${account.id}`}>
                        {account.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-6 whitespace-nowrap text-sm text-card-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono bg-muted px-2 py-1 rounded text-xs">
                        ••••••••
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-6 whitespace-nowrap">
                    <span 
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        account.status ? 'status-on' : 'status-off'
                      }`}
                      data-testid={`status-${account.id}`}
                    >
                      <div className="w-2 h-2 rounded-full bg-current mr-1 mt-0.5"></div>
                      {account.status ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6 whitespace-nowrap text-sm font-medium">
                    {new Date(account.updatedAt).toLocaleString("sv-SE", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit"
                    }).replace("T", " ")}
                  </td>
                  <td className="px-4 py-4 sm:px-6 whitespace-nowrap text-sm font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 h-7"
                        onClick={() => onCopyUsername(account.username)}
                        data-testid={`button-copy-username-${account.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 h-7"
                        onClick={() => onCopyPassword(account.password)}
                        data-testid={`button-copy-password-${account.id}`}
                      >
                        <Key className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className={`px-2 py-1 h-7 text-white ${
                          account.status 
                            ? 'bg-green-500 hover:bg-green-600' 
                            : 'bg-yellow-500 hover:bg-yellow-600'
                        }`}
                        onClick={() => onToggleStatus(account)}
                        data-testid={`button-toggle-status-${account.id}`}
                      >
                        {account.status ? <Check className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 h-7"
                        onClick={() => onDeleteClick(account)}
                        data-testid={`button-delete-${account.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="border-t border-border bg-muted/30 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center text-sm text-muted-foreground sm:text-left">
            Hiển thị <span className="font-medium">{(page - 1) * pageSize + 1}-{(page - 1) * pageSize + accounts.length}</span> của <span className="font-medium">{totalCount}</span> tài khoản
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={onPrevPage} disabled={!canPrev}>
              Trước
            </Button>
            <span className="text-sm text-muted-foreground">
              Trang <span className="font-medium">{page}</span>
            </span>
            <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={onNextPage} disabled={!canNext}>
              Sau
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

