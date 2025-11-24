
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eachDayOfInterval, format, isAfter, startOfDay, subDays } from "date-fns";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CheckCircle,
  DollarSign,
  Download,
  Filter,
  FileText,
  LineChart,
  LogOut,
  Settings2,
  UploadCloud,
  Users,
} from "lucide-react";
import type { Account, AccLog } from "@shared/schema";
import ThemeToggle from "@/components/theme-toggle";
import AccountTable from "@/components/account-table";
import DeleteModal from "@/components/delete-modal";
import DeleteMultipleModal from "@/components/delete-multiple-modal";
import TeamDialog from "@/components/team-dialog";
import SetPriceDialog from "@/components/set-price-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

const PREVIEW_PAGE_SIZE = 10;

type EntityKey = "accounts" | "logs";
type DateFilterKey = "all" | "today" | "7d" | "30d";
type SummaryStats = { total: number; active: number; inactive: number };
type EntityRecord = Account | AccLog;

type ColumnMapping = {
  username: string;
  password: string;
  level?: string;
};

type NormalizedRow = {
  index: number;
  username: string;
  password: string;
  lv: number;
  issues: string[];
  raw: Record<string, any>;
};

type NormalizationResult = {
  rows: NormalizedRow[];
  ready: Array<{ username: string; password: string; lv: number }>;
  duplicateCount: number;
  blockingIssueCount: number;
};

interface EntityConfig {
  label: string;
  shortLabel: string;
  listKey: string;
  statsKey: string;
  statusAllPath: string;
  statusPath: (id: number) => string;
  statusSelectedPath: string;
  deletePath: (id: number) => string;
  bulkDeletePath: string;
  importPath: string;
  exportPrefix: string;
  emptyMessage: string;
}

const ENTITY_CONFIG: Record<EntityKey, EntityConfig> = {
  accounts: {
    label: "Tài khoản",
    shortLabel: "Account",
    listKey: "/api/accounts",
    statsKey: "/api/accounts/stats",
    statusAllPath: "/api/accounts/status-all",
    statusPath: (id) => `/api/accounts/${id}/status`,
    statusSelectedPath: "/api/accounts/status",
    deletePath: (id) => `/api/accounts/${id}`,
    bulkDeletePath: "/api/accounts",
    importPath: "/api/accounts/import-batch",
    exportPrefix: "accounts",
    emptyMessage: "Không có clone csuc phù hợp",
  },
  logs: {
    label: "Acc log",
    shortLabel: "Log",
    listKey: "/api/acclogs",
    statsKey: "/api/acclogs/stats",
    statusAllPath: "/api/acclogs/status-all",
    statusPath: (id) => `/api/acclogs/${id}/status`,
    statusSelectedPath: "/api/acclogs/status",
    deletePath: (id) => `/api/acclogs/${id}`,
    bulkDeletePath: "/api/acclogs",
    importPath: "/api/acclogs/import-batch",
    exportPrefix: "acclogs",
    emptyMessage: "Không có clone csuc cần up phù hợp",
  },
};

const DATE_FILTERS: Array<{ key: DateFilterKey; label: string; hint: string }> = [
  { key: "all", label: "Tất cả", hint: "Không giới hạn thời gian" },
  { key: "today", label: "Hôm nay", hint: "Từ 00:00 đến hiện tại" },
  { key: "7d", label: "7 ngày", hint: "7 ngày gần nhất" },
  { key: "30d", label: "30 ngày", hint: "30 ngày gần nhất" },
];

const DEFAULT_WIDGET_STATE = {
  statusChart: true,
  activityTimeline: true,
  importAssistant: true,
};

type WidgetKey = keyof typeof DEFAULT_WIDGET_STATE;

const TAG_FILTER_UNASSIGNED = "__unassigned__";

type TagFilterValue = "all" | typeof TAG_FILTER_UNASSIGNED | string;

type EntityUiState = {
  searchTerm: string;
  statusFilter: "all" | "on" | "off";
  selectedIds: number[];
  page: number;
  pageSize: number;
};

type ImportSummary = {
  entity: EntityKey;
  imported: number;
  errors: number;
  sourceName: string;
  timestamp: string;
};

type ImportFeedback = {
  entity: EntityKey;
  imported: number;
  errors: number;
  errorDetails: Array<{ account: unknown; error: string }>;
  sourceName: string;
};

type TagModalState =
  | { mode: "single"; ids: [number]; initialTag: string; accountName: string }
  | { mode: "bulk"; ids: number[]; initialTag: string };

type ImportPayload = {
  records: Array<{ username: string; password: string; lv: number }>;
  sourceName: string;
};

type ImportApiResponse = {
  imported: number;
  errors: number;
  errorDetails: Array<{ account: unknown; error: string }>;
};


function formatNumber(value: number) {
  return value.toLocaleString("vi-VN");
}

function passesDateFilter(date: Date, filter: DateFilterKey) {
  switch (filter) {
    case "today":
      return isAfter(date, startOfDay(new Date()));
    case "7d":
      return isAfter(date, subDays(new Date(), 7));
    case "30d":
      return isAfter(date, subDays(new Date(), 30));
    default:
      return true;
  }
}

function filterRecords(
  records: EntityRecord[],
  dateFilter: DateFilterKey,
  state: EntityUiState,
  entity: EntityKey,
) {
  const search = state.searchTerm.trim().toLowerCase();

  return records.filter((record) => {
    const updatedAt = new Date(record.updatedAt);
    if (!passesDateFilter(updatedAt, dateFilter)) {
      return false;
    }
    if (state.statusFilter === "on" && !record.status) {
      return false;
    }
    if (state.statusFilter === "off" && record.status) {
      return false;
    }
    if (entity === "accounts") {
      // Tag filtering is applied after this step to keep UI concerns separated
    }
    if (search) {
      const haystack = `${record.username} ${record.password}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}



type ActivityPoint = {
  key: string;
  label: string;
  accounts: number;
  logs: number;
};

function buildActivitySeries(accounts: Account[], logs: AccLog[], days = 14): {
  data: ActivityPoint[];
  hasActivity: boolean;
} {
  const end = new Date();
  const start = subDays(end, days - 1);
  const calendar = eachDayOfInterval({ start, end });

  const base: ActivityPoint[] = calendar.map((day) => ({
    key: format(day, "yyyy-MM-dd"),
    label: format(day, "dd/MM"),
    accounts: 0,
    logs: 0,
  }));

  const index = new Map<string, ActivityPoint>();
  base.forEach((item) => index.set(item.key, item));

  accounts.forEach((record) => {
    const key = format(new Date(record.updatedAt), "yyyy-MM-dd");
    const target = index.get(key);
    if (target) {
      target.accounts += 1;
    }
  });

  logs.forEach((record) => {
    const key = format(new Date(record.updatedAt), "yyyy-MM-dd");
    const target = index.get(key);
    if (target) {
      target.logs += 1;
    }
  });

  const hasActivity = base.some((item) => item.accounts > 0 || item.logs > 0);
  return { data: base, hasActivity };
}

function getLatestUpdated(records: EntityRecord[]) {
  if (records.length === 0) {
    return null;
  }
  return records.reduce<Date | null>((latest, record) => {
    const updatedAt = new Date(record.updatedAt);
    if (!latest || updatedAt > latest) {
      return updatedAt;
    }
    return latest;
  }, null);
}

function collectHeaders(rows: Record<string, any>[]) {
  const headers = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (key) {
        headers.add(key.trim());
      }
    });
  });
  return Array.from(headers).filter(Boolean);
}

function autoDetectMapping(headers: string[]): ColumnMapping {
  const findByKeywords = (keywords: string[], fallbackIndex: number) => {
    const lower = headers.map((header) => header.toLowerCase());
    for (const keyword of keywords) {
      const index = lower.findIndex((value) => value.includes(keyword));
      if (index !== -1) {
        return headers[index];
      }
    }
    return headers[fallbackIndex] ?? "";
  };

  return {
    username: findByKeywords(["user", "account", "tài khoản"], 0),
    password: findByKeywords(["pass", "mat khau", "pwd"], 1),
    level: findByKeywords(["lv", "level", "cap"], 2),
  };
}

function normalizeRows(rawRows: Record<string, any>[], mapping: ColumnMapping): NormalizationResult {
  const rows: NormalizedRow[] = rawRows.map((row, index) => {
    const usernameValue = row?.[mapping.username];
    const passwordValue = row?.[mapping.password];
    const username = typeof usernameValue === "string" ? usernameValue.trim() : String(usernameValue ?? "").trim();
    const password = typeof passwordValue === "string" ? passwordValue.trim() : String(passwordValue ?? "").trim();
    const issues: string[] = [];

    const levelCandidates: unknown[] = [];
    if (mapping.level && mapping.level.length > 0) {
      levelCandidates.push(row[mapping.level]);
    }
    levelCandidates.push(row["LV"], row["lv"], row["Lv"], row["level"]);

    const levelCandidate = levelCandidates.find((value) => {
      if (value === undefined || value === null) {
        return false;
      }
      return String(value).trim().length > 0;
    });

    let lv = 0;
    if (levelCandidate !== undefined) {
      const parsedLevel = Number(String(levelCandidate).trim());
      if (Number.isFinite(parsedLevel) && parsedLevel >= 0) {
        lv = Math.trunc(parsedLevel);
      } else {
        issues.push("LV không hợp lệ");
      }
    }

    if (!username) {
      issues.push("Thiếu username");
    }
    if (!password) {
      issues.push("Thiếu password");
    }
    if (password && password.length < 4) {
      issues.push("Password quá ngắn");
    }

    return {
      index,
      username,
      password,
      lv,
      issues,
      raw: row,
    };
  });

  const duplicates = new Map<string, NormalizedRow[]>();
  rows.forEach((row) => {
    if (!row.username) {
      return;
    }
    const key = row.username.toLowerCase();
    const bucket = duplicates.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      duplicates.set(key, [row]);
    }
  });

  let duplicateCount = 0;
  duplicates.forEach((bucket) => {
    if (bucket.length > 1) {
      duplicateCount += bucket.length;
      bucket.forEach((row) => {
        row.issues.push("Trùng username trong file");
      });
    }
  });

  const ready = rows
    .filter((row) => row.issues.length === 0)
    .map((row) => ({ username: row.username, password: row.password, lv: row.lv }));

  return {
    rows,
    ready,
    duplicateCount,
    blockingIssueCount: rows.length - ready.length,
  };
}

async function parseCsv(content: string) {
  const PapaModule = await import("papaparse");
  const Papa = (PapaModule as any).default ?? PapaModule;
  return new Promise<Record<string, any>[]>((resolve, reject) => {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results: { data: unknown[] }) => resolve((results.data ?? []) as Record<string, any>[]),
      error: (error: Error) => reject(error),
    });
  });
}

async function parseXlsx(buffer: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, any>[];
}

function parseJson(content: string) {
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) {
    return parsed as Record<string, any>[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.records)) {
    return parsed.records as Record<string, any>[];
  }
  throw new Error("JSON không chứa mảng bản ghi");
}

function parseScriptModule(content: string) {
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    throw new Error("File JS không chứa mảng bản ghi hợp lệ");
  }

  try {
    const normalized = arrayMatch[0]
      .replace(/(\w+)\s*:/g, '"$1":')
      .replace(/'([^']*)'/g, '"$1"');
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, any>[];
  } catch (error) {
    throw new Error("Không thể đọc dữ liệu từ file JS");
  }
}

async function parseFileSource(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "txt"].includes(extension)) {
    const text = await file.text();
    return {
      rows: await parseCsv(text),
      name: file.name,
    };
  }
  if (["json"].includes(extension)) {
    const text = await file.text();
    return {
      rows: parseJson(text),
      name: file.name,
    };
  }
  if (["js", "ts"].includes(extension)) {
    const text = await file.text();
    return {
      rows: parseScriptModule(text),
      name: file.name,
    };
  }
  if (["xlsx", "xls"].includes(extension)) {
    const buffer = await file.arrayBuffer();
    return {
      rows: await parseXlsx(buffer),
      name: file.name,
    };
  }
  throw new Error("Định dạng file chưa được hỗ trợ");
}

async function parseSheetLink(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Không thể tải sheet từ đường dẫn");
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const trimmed = text.trim();

  let rows: Record<string, any>[];
  if (contentType.includes("json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    rows = parseJson(trimmed);
  } else if (contentType.includes("javascript") || /module\.exports|export\s+default/.test(text)) {
    rows = parseScriptModule(text);
  } else {
    rows = await parseCsv(text);
  }

  let name = "Google Sheets";
  try {
    const parsedUrl = new URL(url);
    name = parsedUrl.hostname;
  } catch (error) {
    name = "External sheet";
  }

  return { rows, name };
}

function copyToClipboard(
  value: string,
  label: string,
  toast: ReturnType<typeof useToast>["toast"],
  buttonKey: string,
  setActiveButtons?: (updater: (prev: Set<string>) => Set<string>) => void
) {
  if (setActiveButtons) {
    setActiveButtons((prev) => new Set(prev).add(buttonKey));
  }
  
  navigator.clipboard
    .writeText(value)
    .then(() => {
      toast({
        title: "Đã sao chép",
        description: `${label} đã được lưu vào clipboard`,
      });
    })
    .catch(() => {
      toast({
        title: "Không thể sao chép",
        description: "Trình duyệt không cho phép truy cập clipboard",
        variant: "destructive",
      });
    })
    .finally(() => {
      if (setActiveButtons) {
        setTimeout(() => {
          setActiveButtons((prev) => {
            const next = new Set(prev);
            next.delete(buttonKey);
            return next;
          });
        }, 1000); // Remove active state after 1 second
      }
    });
}

function exportRecords(
  records: EntityRecord[],
  prefix: string,
  toast: ReturnType<typeof useToast>["toast"],
  scopeLabel: string,
) {
  if (records.length === 0) {
    toast({
      title: "Không có dữ liệu",
      description: "Vui lòng chọn ít nhất một mục",
      variant: "destructive",
    });
    return;
  }

  const minimalPayload = records.map(({ username, password }) => ({ username, password }));
  const arrayString = JSON.stringify(minimalPayload, null, 2);
  const fileContent = `const records = ${arrayString};
module.exports = records;
export default records;
`;
  const blob = new Blob([fileContent], { type: "application/javascript;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `${prefix}-${timestamp}.js`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  toast({
    title: "Đã xuất",
    description: `Đã xuất ${records.length} ${scopeLabel}`,
  });
}

function exportRecordsTxt(
  records: EntityRecord[],
  prefix: string,
  toast: ReturnType<typeof useToast>["toast"],
  scopeLabel: string,
) {
  if (records.length === 0) {
    toast({
      title: "Không có dữ liệu",
      description: "Vui lòng chọn ít nhất một mục",
      variant: "destructive",
    });
    return;
  }

  const fileContent = records.map(({ username, password }) => `${username}|${password}`).join("\n");
  const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `${prefix}-${timestamp}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  toast({
    title: "Đã xuất",
    description: `Đã xuất ${records.length} ${scopeLabel} (TXT)`,
  });
}

function useEntityMutations(
  entity: EntityKey,
  toast: ReturnType<typeof useToast>["toast"],
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const config = ENTITY_CONFIG[entity];
  const isAccountsEntity = entity === "accounts";
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [config.listKey] });
    queryClient.invalidateQueries({ queryKey: [config.statsKey] });
  };

  const updateAllMutation = useMutation({
    mutationFn: async (status: boolean) => {
      await apiRequest("PATCH", config.statusAllPath, { status });
    },
    onSuccess: (_data, status) => {
      invalidate();
      // Invalidate revenue when turning OFF (ON → OFF: accounts đã được sử dụng xong, tính doanh thu)
      if (!status) {
        console.log('[Frontend] Accounts turned OFF, invalidating revenue queries');
        queryClient.invalidateQueries({ queryKey: ["/api/revenue/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/revenue/stats"] });
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ["/api/revenue/current-session"], exact: false });
          queryClient.refetchQueries({ queryKey: ["/api/revenue/stats"], exact: false });
        }, 800);
      }
      toast({
        title: "Đã cập nhật",
        description: status
          ? `Tất cả ${config.label.toLowerCase()} đã được bật`
          : `Tất cả ${config.label.toLowerCase()} đã được tắt`,
      });
    },
    onError: () => {
      toast({
        title: "Không thể cập nhật",
        description: `Thử lại sau khi cập nhật ${config.label.toLowerCase()}`,
        variant: "destructive",
      });
    },
  });

  const updateSelectedMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: boolean }) => {
      await apiRequest("PATCH", config.statusSelectedPath, { ids, status });
    },
    onSuccess: (_data, variables) => {
      invalidate();
      // Invalidate revenue when turning OFF (ON → OFF: accounts đã được sử dụng xong, tính doanh thu)
      if (!variables.status) {
        console.log('[Frontend] Selected accounts turned OFF, invalidating revenue queries');
        queryClient.invalidateQueries({ queryKey: ["/api/revenue/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/revenue/stats"] });
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ["/api/revenue/current-session"], exact: false });
          queryClient.refetchQueries({ queryKey: ["/api/revenue/stats"], exact: false });
        }, 800);
      }
      toast({
        title: "Đã cập nhật",
        description: `${variables.ids.length} ${config.label.toLowerCase()} đã được ${variables.status ? 'Bật' : 'Tắt'}`,
      });
    },
    onError: () => {
      toast({
        title: "Không thể thay đổi",
        description: `Thử lại sau khi cập nhật ${config.label.toLowerCase()}`,
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: boolean }) => {
      await apiRequest("PATCH", config.statusPath(id), { status });
    },
    onSuccess: (_data, variables) => {
      invalidate();
      // Invalidate revenue when turning OFF (ON → OFF: account đã được sử dụng xong, tính doanh thu)
      if (!variables.status) {
        console.log('[Frontend] Account turned OFF via toggle, invalidating revenue queries');
        queryClient.invalidateQueries({ queryKey: ["/api/revenue/current-session"] });
        queryClient.invalidateQueries({ queryKey: ["/api/revenue/stats"] });
        // Force refetch immediately
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ["/api/revenue/current-session"], exact: false });
          queryClient.refetchQueries({ queryKey: ["/api/revenue/stats"], exact: false });
        }, 800);
      }
      if (!isAccountsEntity) {
        toast({
          title: "Đã thay đổi trạng thái",
          description: `${config.label} đã được cập nhật`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Không thể cập nhật",
        description: `Thử lại sau khi cập nhật ${config.label.toLowerCase()}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", config.deletePath(id));
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: "Đã xóa",
        description: `${config.label} đã được xóa`,
      });
    },
    onError: () => {
      toast({
        title: "Không thể xóa",
        description: `Thử lại thao tác xóa ${config.label.toLowerCase()}`,
        variant: "destructive",
      });
    },
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: async (ids?: number[]) => {
      const payload = ids && ids.length > 0 ? { ids } : undefined;
      await apiRequest("DELETE", config.bulkDeletePath, payload);
    },
    onSuccess: (_data, ids) => {
      invalidate();
      toast({
        title: "Đã xóa",
        description: ids && ids.length > 0
          ? `Đã xóa ${ids.length} ${config.label.toLowerCase()}`
          : `Đã xóa toàn bộ ${config.label.toLowerCase()}`,
      });
    },
    onError: () => {
      toast({
        title: "Không thể xóa",
        description: `Thử lại thao tác xóa ${config.label.toLowerCase()}`,
        variant: "destructive",
      });
    },
  });

  return {
    updateAllMutation,
    updateSelectedMutation,
    toggleStatusMutation,
    deleteMutation,
    deleteMultipleMutation,
  };
}

interface OverviewCardsProps {
  accountStats?: SummaryStats | null;
  logStats?: SummaryStats | null;
  dateFilter: DateFilterKey;
  tagFilter: TagFilterValue;
  accounts: Account[];
  logs: AccLog[];
  lastImportSummary?: ImportSummary | null;
  currentSessionRevenue?: { session: { sessionName: string; pricePerAccount: number } | null; revenue: { totalRevenue: number; accountCount: number } } | null;
}

function OverviewCards({
  accountStats,
  logStats,
  dateFilter,
  tagFilter,
  accounts,
  logs,
  lastImportSummary,
  currentSessionRevenue,
}: OverviewCardsProps) {
  const totalAccounts = accountStats?.total ?? accounts.length;
  const activeAccounts = accountStats?.active ?? accounts.filter((acc) => acc.status).length;
  const totalLogs = logStats?.total ?? logs.length;
  const activeLogs = logStats?.active ?? logs.filter((log) => log.status).length;

  const combinedTotal = totalAccounts + totalLogs;
  const combinedActive = activeAccounts + activeLogs;
  const healthRatio = combinedTotal === 0 ? 0 : Math.round((combinedActive / combinedTotal) * 100);

  const latestAccountUpdate = getLatestUpdated(accounts);
  const latestLogUpdate = getLatestUpdated(logs);
  const latestUpdate = [latestAccountUpdate, latestLogUpdate]
    .filter(Boolean)
    .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;

  const dateFilterLabel = DATE_FILTERS.find((filter) => filter.key === dateFilter)?.label ?? "Tất cả";
  const tagFilterLabel =
    tagFilter === "all"
      ? null
      : tagFilter === TAG_FILTER_UNASSIGNED
        ? "Chưa gắn tag"
        : `Tag ${tagFilter}`;

  // Debug log
  console.log('[Frontend] OverviewCards rendering, currentSessionRevenue:', currentSessionRevenue);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tổng clone csuc</CardTitle>
          <Users className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{formatNumber(totalAccounts)}</div>
          <p className="text-sm text-muted-foreground">
            {formatNumber(activeAccounts)} đang hoạt động ? {formatNumber(totalAccounts - activeAccounts)} tạm dừng
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tổng clone chưa đủ csuc</CardTitle>
          <FileText className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{formatNumber(totalLogs)}</div>
          <p className="text-sm text-muted-foreground">
            {formatNumber(activeLogs)} đang hoạt động ? {formatNumber(totalLogs - activeLogs)} tạm dừng
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tổng tài khoản</CardTitle>
          <LineChart className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{healthRatio}%</div>
          <p className="text-sm text-muted-foreground">
            {formatNumber(combinedActive)} / {formatNumber(combinedTotal)} mục đang bật
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bộ lọc đang áp dụng</CardTitle>
          <Filter className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full">{dateFilterLabel}</Badge>
            {tagFilterLabel ? (
              <Badge variant="outline" className="rounded-full">{tagFilterLabel}</Badge>
            ) : null}
          </div>
          {latestUpdate ? (
            <p className="text-sm text-muted-foreground">
              Cập nhật gần nhất: {format(latestUpdate, "HH:mm dd/MM")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có bản ghi</p>
          )}
          {lastImportSummary ? (
            <p className="text-xs text-muted-foreground">
              Import lần cuối: {lastImportSummary.sourceName} ? {lastImportSummary.imported} mục ({lastImportSummary.errors} lỗi)
            </p>
          ) : null}
        </CardContent>
      </Card>

      {currentSessionRevenue?.session ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Doanh thu buổi live</CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatNumber(currentSessionRevenue.revenue.totalRevenue)}đ</div>
            <p className="text-sm font-medium text-card-foreground mt-1">
              {currentSessionRevenue.session.sessionName}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(currentSessionRevenue.revenue.accountCount)} acc × {formatNumber(currentSessionRevenue.session.pricePerAccount)}đ/acc
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Doanh thu buổi live</CardTitle>
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-muted-foreground">0đ</div>
            <p className="text-sm text-muted-foreground mt-1">
              Chưa có buổi live
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Set giá để bắt đầu tracking
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StatusBreakdownChartProps {
  accountStats?: SummaryStats | null;
  logStats?: SummaryStats | null;
}

const STATUS_CHART_CONFIG: ChartConfig = {
  active: {
    label: "Đang hoat động",
    theme: {
      light: "var(--chart-1)",
      dark: "rgba(255, 255, 255, 0.85)",
    },
  },
  inactive: {
    label: "Tạm dừng",
    theme: {
      light: "var(--chart-2)",
      dark: "rgba(255, 255, 255, 0.45)",
    },
  },
};

function StatusBreakdownChart({ accountStats, logStats }: StatusBreakdownChartProps) {
  const data = useMemo(() => {
    const accounts = {
      name: "Tài khoản",
      active: accountStats?.active ?? 0,
      inactive: accountStats ? accountStats.total - accountStats.active : 0,
    };
    const logs = {
      name: "Acc log",
      active: logStats?.active ?? 0,
      inactive: logStats ? logStats.total - logStats.active : 0,
    };
    return [accounts, logs];
  }, [accountStats, logStats]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Tỷ lệ trạng thái</CardTitle>
        <CardDescription>So sánh tỷ lệ on/off theo từng nhóm</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={STATUS_CHART_CONFIG} className="h-[260px] w-full overflow-hidden">
          <BarChart data={data} barSize={32}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="active" stackId="status" radius={[8, 8, 0, 0]} fill="var(--color-active)" stroke="var(--color-active)" />
            <Bar dataKey="inactive" stackId="status" radius={[8, 8, 0, 0]} fill="var(--color-inactive)" stroke="var(--color-inactive)" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const ACTIVITY_CHART_CONFIG: ChartConfig = {
  accounts: {
    label: "Tài khoản",
    theme: {
      light: "var(--chart-1)",
      dark: "rgba(255, 255, 255, 0.72)",
    },
  },
  logs: {
    label: "Acc log",
    theme: {
      light: "var(--chart-3)",
      dark: "rgba(255, 255, 255, 0.42)",
    },
  },
};

interface ActivityTimelineProps {
  data: ActivityPoint[];
  hasActivity: boolean;
}

function ActivityTimeline({ data, hasActivity }: ActivityTimelineProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Hoạt động 14 ngày</CardTitle>
        <CardDescription>Thổng hợp số lần cập nhật theo ngày</CardDescription>
      </CardHeader>
      <CardContent>
        {hasActivity ? (
          <ChartContainer config={ACTIVITY_CHART_CONFIG} className="h-[260px] w-full overflow-hidden">
            <AreaChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="accounts" stackId="activity" stroke="var(--color-accounts)" fillOpacity={0.28} fill="var(--color-accounts)" />
              <Area type="monotone" dataKey="logs" stackId="activity" stroke="var(--color-logs)" fillOpacity={0.28} fill="var(--color-logs)" />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed border-border/70 text-sm text-muted-foreground">
           Chưa có hoạt động trong 14 ngày gần nhất
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const REVENUE_CHART_CONFIG: ChartConfig = {
  revenue: {
    label: "Doanh thu",
    theme: {
      light: "var(--chart-1)",
      dark: "rgba(255, 255, 255, 0.85)",
    },
  },
};

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; accountCount: number }>;
  activeSession?: { sessionName: string; pricePerAccount: number } | null;
}

function RevenueChart({ data, activeSession }: RevenueChartProps) {
  const chartData = useMemo(() => {
    return data.map((item) => ({
      date: format(new Date(item.date), "dd/MM"),
      revenue: item.revenue,
      accountCount: item.accountCount,
    }));
  }, [data]);

  const hasRevenue = data.length > 0 && data.some((item) => item.revenue > 0);
  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Thống kê doanh thu</CardTitle>
        <CardDescription>
          {activeSession
            ? `Buổi live hiện tại: ${activeSession.sessionName} - ${formatNumber(activeSession.pricePerAccount)}đ/acc`
            : "Chưa có buổi live nào được set"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasRevenue ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <span className="text-sm text-muted-foreground">Tổng doanh thu 30 ngày:</span>
              <span className="text-lg font-semibold text-primary">{formatNumber(totalRevenue)}đ</span>
            </div>
            <ChartContainer config={REVENUE_CHART_CONFIG} className="h-[260px] w-full overflow-hidden">
              <AreaChart data={chartData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={60} />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm text-muted-foreground">Doanh thu:</span>
                              <span className="font-semibold">{formatNumber(data.revenue)}đ</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm text-muted-foreground">Số acc:</span>
                              <span className="font-semibold">{data.accountCount}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  fillOpacity={0.28}
                  fill="var(--color-revenue)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-border/70 text-sm text-muted-foreground">
            <DollarSign className="mb-2 h-8 w-8" />
            <p>Chưa có doanh thu trong 30 ngày gần nhất</p>
            {!activeSession && (
              <p className="mt-2 text-xs">Set giá cho buổi live để bắt đầu tracking doanh thu</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface WidgetTogglePanelProps {
  state: typeof DEFAULT_WIDGET_STATE;
  onChange: (next: typeof DEFAULT_WIDGET_STATE) => void;
  layout?: "card" | "plain";
}

function WidgetTogglePanel({ state, onChange, layout = "card" }: WidgetTogglePanelProps) {
  const handleToggle = (key: WidgetKey, value: boolean) => {
    onChange({ ...state, [key]: value });
  };

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Biểu đồ trạng thái</p>
          <p className="text-xs text-muted-foreground">Tổng quan on/off</p>
        </div>
        <Switch checked={state.statusChart} onCheckedChange={(value) => handleToggle("statusChart", value)} />
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Hoạt động gần đây</p>
          <p className="text-xs text-muted-foreground">Biểu đồ 14 ngày</p>
        </div>
        <Switch checked={state.activityTimeline} onCheckedChange={(value) => handleToggle("activityTimeline", value)} />
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Trợ lý import</p>
          <p className="text-xs text-muted-foreground">Hướng dẫn chuẩn hoá & nhập dữ liệu</p>
        </div>
        <Switch checked={state.importAssistant} onCheckedChange={(value) => handleToggle("importAssistant", value)} />
      </div>
    </div>
  );

  if (layout === "plain") {
    return content;
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Tùy chỉnh widget</CardTitle>
        <CardDescription>Chọn các khối thông tin muốn hiển thị</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

interface BulkActionsCardProps {
  label: string;
  selectionCount: number;
  totalCount: number;
  onUpdateAll: (status: boolean) => void;
  onUpdateSelected?: (status: boolean) => void;
  isUpdating: boolean;
  isUpdatingSelected?: boolean;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
  onExportAll: () => void;
  onExportSelected: () => void;
  onExportAllTxt?: () => void;
  onExportSelectedTxt?: () => void;
  onAssignTag?: () => void;
  disableAssignTag?: boolean;
  disableUpdateSelected?: boolean;
  disableDeleteSelected: boolean;
}

function BulkActionsCard({
  label,
  selectionCount,
  totalCount,
  onUpdateAll,
  onUpdateSelected,
  isUpdating,
  isUpdatingSelected,
  onDeleteSelected,
  onDeleteAll,
  onExportAll,
  onExportSelected,
  onExportAllTxt,
  onExportSelectedTxt,
  onAssignTag,
  disableAssignTag,
  disableUpdateSelected,
  disableDeleteSelected,
}: BulkActionsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Hành động nhanh</CardTitle>
        <CardDescription>
          {selectionCount > 0
            ? `${selectionCount} ${label.toLowerCase()} đang được chọn`
            : `${totalCount} ${label.toLowerCase()} sẵn sàng`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button className="flex-1" size="sm" variant="outline" onClick={() => onUpdateAll(true)} disabled={isUpdating}>
            Bật tất cả
          </Button>
          <Button className="flex-1" size="sm" variant="outline" onClick={() => onUpdateAll(false)} disabled={isUpdating}>
            Tắt tất cả
          </Button>
        </div>
        {onUpdateSelected ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              variant="outline"
              onClick={() => onUpdateSelected(true)}
              disabled={disableUpdateSelected || isUpdatingSelected}
            >
              Bật mục đã chọn            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant="outline"
              onClick={() => onUpdateSelected(false)}
              disabled={disableUpdateSelected || isUpdatingSelected}
            >
              Tắt mục đã chọn
            </Button>
          </div>
        ) : null}
        {onAssignTag ? (
          <Button size="sm" variant="outline" className="w-full" onClick={onAssignTag} disabled={disableAssignTag}>
            Gắn tag
          </Button>
        ) : null}
        <Separator />
        <div className="relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Xuất dữ liệu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Xuất mục đã chọn</DropdownMenuLabel>
              <DropdownMenuItem onClick={onExportSelected}>
                <FileText className="mr-2 h-4 w-4" />
                <span>File JS</span>
              </DropdownMenuItem>
              {onExportSelectedTxt ? (
                <DropdownMenuItem onClick={onExportSelectedTxt}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>File TXT</span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Xuất theo bộ lọc</DropdownMenuLabel>
              <DropdownMenuItem onClick={onExportAll}>
                <FileText className="mr-2 h-4 w-4" />
                <span>File JS</span>
              </DropdownMenuItem>
              {onExportAllTxt ? (
                <DropdownMenuItem onClick={onExportAllTxt}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>File TXT</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Separator />
        <Button
          size="sm"
          variant="destructive"
          className="w-full"
          onClick={onDeleteSelected}
          disabled={disableDeleteSelected}
        > 
           Xóa mục đã chọn 
        </Button>
        <Button
            size="sm"
          variant="destructive"
          className="w-full"
          onClick={onDeleteAll}
        >
         Xóa toàn bộ {label.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ImportPipelineAssistantProps {
  entity: EntityKey;
  onImport: (payload: ImportPayload) => Promise<void>;
  isImporting: boolean;
}

type PipelineStep = 1 | 2 | 3;

function ImportPipelineAssistant({ entity, onImport, isImporting }: ImportPipelineAssistantProps) {
  const LEVEL_MAPPING_NONE = "__none__";
  const entityLabel = ENTITY_CONFIG[entity].label;
  const [step, setStep] = useState<PipelineStep>(1);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ username: "", password: "", level: "" });
  const [validation, setValidation] = useState<NormalizationResult | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [sourceName, setSourceName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rawRows.length === 0) {
      setHeaders([]);
      setValidation(null);
      return;
    }
    const collected = collectHeaders(rawRows);
    setHeaders(collected);

    const autoMapping = autoDetectMapping(collected);
    const nextMapping: ColumnMapping = {
      username: mapping.username && collected.includes(mapping.username) ? mapping.username : autoMapping.username,
      password: mapping.password && collected.includes(mapping.password) ? mapping.password : autoMapping.password,
      level: mapping.level && mapping.level.length > 0 && collected.includes(mapping.level) ? mapping.level : (autoMapping.level ?? ""),
    };

    if (
      nextMapping.username !== mapping.username ||
      nextMapping.password !== mapping.password ||
      (nextMapping.level ?? "") !== (mapping.level ?? "")
    ) {
      setMapping(nextMapping);
    }
  }, [rawRows]);

  useEffect(() => {
    if (rawRows.length === 0) {
      setValidation(null);
      return;
    }
    if (!mapping.username || !mapping.password) {
      setValidation(null);
      return;
    }
    setValidation(normalizeRows(rawRows, mapping));
  }, [rawRows, mapping]);

  useEffect(() => {
    setPreviewPage(1);
  }, [validation?.rows.length]);

  const handleReset = () => {
    setStep(1);
    setRawRows([]);
    setHeaders([]);
    setMapping({ username: "", password: "", level: "" });
    setValidation(null);
    setSourceName("");
    setSheetUrl("");
    setPreviewPage(1);
    setError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setLoadingSource(true);
    try {
      const { rows, name } = await parseFileSource(file);
      if (!rows || rows.length === 0) {
        throw new Error("File không có dữ liệu");
      }
      setRawRows(rows);
      setSourceName(name);
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Không thể đọc file đã chọn");
    } finally {
      setLoadingSource(false);
      event.target.value = "";
    }
  };

  const handleLoadSheet = async () => {
    if (!sheetUrl) {
      return;
    }
    setError(null);
    setLoadingSource(true);
    try {
      const { rows, name } = await parseSheetLink(sheetUrl);
      if (!rows || rows.length === 0) {
        throw new Error("Sheet không có dữ liệu");
      }
      setRawRows(rows);
      setSourceName(name);
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Không thể tải sheet");
    } finally {
      setLoadingSource(false);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      return;
    }
    if (step === 3) {
      setStep(2);
    } else {
      handleReset();
    }
  };

  const handleContinue = () => {
    if (step === 2 && validation) {
      setStep(3);
      setPreviewPage(1);
    }
  };

  const handleImport = async () => {
    if (!validation || validation.ready.length === 0) {
      return;
    }
    await onImport({
      records: validation.ready,
      sourceName: sourceName || sheetUrl || entityLabel,
    });
    handleReset();
  };

  const previewTotalCount = validation?.rows.length ?? 0;
  const previewTotalPages = Math.max(1, Math.ceil(previewTotalCount / PREVIEW_PAGE_SIZE));
  const currentPreviewPage = Math.min(previewPage, previewTotalPages);
  const previewStartIndex = (currentPreviewPage - 1) * PREVIEW_PAGE_SIZE;
  const previewRows = validation?.rows.slice(previewStartIndex, previewStartIndex + PREVIEW_PAGE_SIZE) ?? [];
  const previewDisplayStart = previewTotalCount === 0 ? 0 : previewStartIndex + 1;
  const previewDisplayEnd = previewTotalCount === 0 ? 0 : Math.min(previewStartIndex + previewRows.length, previewTotalCount);
  const readyCount = validation?.ready.length ?? 0;
  const skippedCount = validation?.blockingIssueCount ?? 0;

  return (
    <Card className="border-dashed border-primary/30 bg-primary/5">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <UploadCloud className="h-4 w-4 text-primary" />
          Trợ lý import {entityLabel.toLowerCase()}
        </CardTitle>
        <CardDescription>Chuẩn hóa file CSV/XLSX/JSON/JS hoặc Google Sheets trước khi nhập.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span>B1</span>
          <Separator orientation="vertical" className="h-4" />
          <span>Chọn nguồn dữ liệu</span>
        </div>

        <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-4">
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Upload file (CSV/XLSX/JSON/JS)</Label>
            <Input type="file" accept=".csv,.txt,.xls,.xlsx,.json,.js,.ts" disabled={loadingSource || isImporting} onChange={handleFileChange} />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Hoặc dùng Google Sheets</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://docs.google.com/.../export?format=csv"
                value={sheetUrl}
                onChange={(event) => setSheetUrl(event.target.value)}
                disabled={loadingSource || isImporting}
              />
              <Button size="sm" onClick={handleLoadSheet} disabled={!sheetUrl || loadingSource || isImporting}>
                Tải
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Gợi ý: thêm cuối đường dẫn "/export?format=csv" để tải nhanh
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : null}

        {rawRows.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>B2</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Mapping cột</span>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Username</Label>
                <Select value={mapping.username} onValueChange={(value) => setMapping((prev) => ({ ...prev, username: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cột username" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Select value={mapping.password} onValueChange={(value) => setMapping((prev) => ({ ...prev, password: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cột password" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cấp độ</Label>
                <Select value={mapping.level && mapping.level.length > 0 ? mapping.level : LEVEL_MAPPING_NONE} onValueChange={(value) => setMapping((prev) => ({ ...prev, level: value === LEVEL_MAPPING_NONE ? "" : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cột cấp độ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEVEL_MAPPING_NONE}>(Không chọn)</SelectItem>
                    {headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="rounded-full">
                {rawRows.length} dòng nguồn
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {headers.length} cột phát hiện
              </Badge>
              {sourceName ? (
                <Badge variant="outline" className="rounded-full">
                  Từ: {sourceName}
                </Badge>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Quay lại
              </Button>
              <Button
                size="sm"
                onClick={handleContinue}
                disabled={!mapping.username || !mapping.password || !validation || validation.rows.length === 0}
              >
                Tiếp tục
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 && validation ? (
          <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>B3</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Kiểm tra và nhập</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-50/60 p-3 text-sm text-emerald-700">
                <CheckCircle className="h-4 w-4" />
                <span>{readyCount} dòng hợp lệ sẽ được nhập</span>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-50/60 p-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" />
                <span>{skippedCount} dòng sẽ bị bỏ qua</span>
              </div>
            </div>

            {validation.duplicateCount > 0 ? (
              <div className="rounded-md border border-amber-400/60 bg-amber-50/60 p-3 text-sm text-amber-700">
                Phát hiện {validation.duplicateCount} username trùng lặp trong file. Mỗi username chỉ giữ lại 1 dòng username đầu tiên.
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2">Cấp độ</th>
                    <th className="px-3 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.index} className="border-t">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.index + 1}</td>
                      <td className="truncate px-3 py-2 font-medium">{row.username || "(trong)"}</td>
                      <td className="truncate px-3 py-2 text-muted-foreground">{row.password || "(trong)"}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{row.lv}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.issues.length > 0 ? row.issues.join(", ") : "Hợp lệ"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {previewTotalCount > 0 ? (
                  <>
                    Hiển thị{" "}
                    <span className="font-semibold text-card-foreground">
                      {previewDisplayStart}-{previewDisplayEnd}
                    </span>{" "}
                    trên tổng{" "}
                    <span className="font-semibold text-card-foreground">{previewTotalCount}</span>{" "}
                    dòng đã kiểm tra. Các dòng lỗi sẽ được bỏ qua khi nhập.
                  </>
                ) : (
                  <>Không có dữ liệu xem trước. Các dòng lỗi sẽ được bỏ qua khi nhập.</>
                )}
              </p>
              {previewTotalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => setPreviewPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPreviewPage <= 1}
                  >
                    Trước
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Trang{" "}
                    <span className="font-semibold text-card-foreground">{currentPreviewPage}</span>/<span className="font-semibold text-card-foreground">{previewTotalPages}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => setPreviewPage((prev) => Math.min(previewTotalPages, prev + 1))}
                    disabled={currentPreviewPage >= previewTotalPages}
                  >
                    Sau
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Chỉnh sửa mapping
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={readyCount === 0 || isImporting}
              >
                {isImporting ? "Đang import..." : "Import vào hệ thống"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") === "logs" ? "logs" : "accounts") as EntityKey;
  const [activeTab, setActiveTab] = useState<EntityKey>(initialTab);

  useEffect(() => {
    const paramTab = (searchParams.get("tab") === "logs" ? "logs" : "accounts") as EntityKey;
    setActiveTab((prev) => (prev === paramTab ? prev : paramTab));
  }, [searchParams]);

  const [dateFilter, setDateFilter] = useState<DateFilterKey>("all");
  const [widgetState, setWidgetState] = useLocalStorage("dashboard-widget-state", DEFAULT_WIDGET_STATE);
  const [isFilterDialogOpen, setFilterDialogOpen] = useState(false);
  const [isWidgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [isChartsDialogOpen, setChartsDialogOpen] = useState(false);
  const [isImportDialogOpen, setImportDialogOpen] = useState(false);
  const [entityUi, setEntityUi] = useState<Record<EntityKey, EntityUiState>>({
    accounts: { searchTerm: "", statusFilter: "all", selectedIds: [], page: 1, pageSize: 20 },
    logs: { searchTerm: "", statusFilter: "all", selectedIds: [], page: 1, pageSize: 20 },
  });
  const [pendingDelete, setPendingDelete] = useState<{ entity: EntityKey; record: EntityRecord } | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{ entity: EntityKey; mode: "selected" | "all" } | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<ImportSummary | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const [tagModalState, setTagModalState] = useState<TagModalState | null>(null);
  const [isSetPriceDialogOpen, setSetPriceDialogOpen] = useState(false);
  const [updatingStatusIds, setUpdatingStatusIds] = useState<Set<number>>(new Set());
  const [activeCopyButtons, setActiveCopyButtons] = useState<Set<string>>(new Set());

  const accountsQuery = useQuery<Account[]>({ queryKey: [ENTITY_CONFIG.accounts.listKey] });
  const logsQuery = useQuery<AccLog[]>({ queryKey: [ENTITY_CONFIG.logs.listKey] });
  const accountStatsQuery = useQuery<SummaryStats | null>({ queryKey: [ENTITY_CONFIG.accounts.statsKey] });
  const logStatsQuery = useQuery<SummaryStats | null>({ queryKey: [ENTITY_CONFIG.logs.statsKey] });
  
  type RevenueStats = Array<{ date: string; revenue: number; accountCount: number }>;
  const revenueStatsQuery = useQuery<RevenueStats>({
    queryKey: ["/api/revenue/stats"],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, 30);
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      return apiRequest<RevenueStats>("GET", `/api/revenue/stats?${params.toString()}`);
    },
  });
  
  const activeSessionQuery = useQuery<{ id: number; sessionName: string; pricePerAccount: number; createdAt: Date; updatedAt: Date } | null>({
    queryKey: ["/api/revenue/active-session"],
    queryFn: async () => {
      return apiRequest<{ id: number; sessionName: string; pricePerAccount: number; createdAt: Date; updatedAt: Date } | null>("GET", "/api/revenue/active-session");
    },
  });

  const currentSessionRevenueQuery = useQuery<{ session: { id: number; sessionName: string; pricePerAccount: number; createdAt: Date; updatedAt: Date } | null; revenue: { totalRevenue: number; accountCount: number } }>({
    queryKey: ["/api/revenue/current-session"],
    queryFn: async () => {
      const data = await apiRequest<{ session: { id: number; sessionName: string; pricePerAccount: number; createdAt: Date; updatedAt: Date } | null; revenue: { totalRevenue: number; accountCount: number } }>("GET", "/api/revenue/current-session");
      console.log('[Frontend] Current session revenue:', data);
      return data;
    },
    refetchInterval: 2000, // Refetch every 2 seconds to get updated revenue
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const accountMutations = useEntityMutations("accounts", toast, queryClient);
  const logMutations = useEntityMutations("logs", toast, queryClient);

  const accountImportMutation = useMutation({
    mutationFn: async (payload: ImportPayload) => {
      return apiRequest<ImportApiResponse>("POST", ENTITY_CONFIG.accounts.importPath, payload);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể import tài khoản";
      toast({
        title: "Import thất bại",
        description: message,
        variant: "destructive",
      });
    },
  });

  const logImportMutation = useMutation({
    mutationFn: async (payload: ImportPayload) => {
      return apiRequest<ImportApiResponse>("POST", ENTITY_CONFIG.logs.importPath, payload);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể import acc log";
      toast({
        title: "Import thất bại",
        description: message,
        variant: "destructive",
      });
    },
  });

  const updateAccountTagMutation = useMutation({
    mutationFn: async ({ id, tag }: { id: number; tag: string | null }) => {
      return apiRequest<Account>("PATCH", `/api/accounts/${id}/tag`, { tag });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể cập nhật tag";
      toast({
        title: "Cập nhật thất bại",
        description: message,
        variant: "destructive",
      });
    },
  });

  const bulkUpdateAccountTagMutation = useMutation({
    mutationFn: async ({ ids, tag }: { ids: number[]; tag: string | null }) => {
      return apiRequest<{ updated: number; tag: string | null }>("PATCH", "/api/accounts/tag", { ids, tag });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể cập nhật tag hàng loạt";
      toast({
        title: "Cập nhật thất bại",
        description: message,
        variant: "destructive",
      });
    },
  });

  const accounts = accountsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const accountStats = accountStatsQuery.data;
  const logStats = logStatsQuery.data;

  const { tagOptions, hasUnassignedTag } = useMemo(() => {
    const uniqueTags = new Set<string>();
    let unassigned = false;
    for (const account of accounts) {
      const value = (account.tag ?? "").trim();
      if (value.length === 0) {
        unassigned = true;
      } else {
        uniqueTags.add(value);
      }
    }
    return {
      tagOptions: Array.from(uniqueTags).sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" })),
      hasUnassignedTag: unassigned,
    };
  }, [accounts]);

  const [accountTagFilter, setAccountTagFilter] = useState<TagFilterValue>("all");
  const [logLevelFilter, setLogLevelFilter] = useState<string>("all");

  const filteredAccounts = useMemo(() => {
    const base = filterRecords(accounts, dateFilter, entityUi.accounts, "accounts") as Account[];

    if (accountTagFilter === "all") {
      return base;
    }

    if (accountTagFilter === TAG_FILTER_UNASSIGNED) {
      return base.filter((account) => {
        const value = typeof account.tag === "string" ? account.tag.trim() : "";
        return value.length === 0;
      });
    }

    const normalized = accountTagFilter.trim().toLowerCase();
    return base.filter((account) => {
      const value = typeof account.tag === "string" ? account.tag.trim().toLowerCase() : "";
      return value === normalized;
    });
  }, [accounts, entityUi.accounts, dateFilter, accountTagFilter]);

  const baseFilteredLogs = useMemo(
    () => filterRecords(logs, dateFilter, entityUi.logs, "logs") as AccLog[],
    [logs, entityUi.logs, dateFilter],
  );

  const logLevelOptions = useMemo(() => {
    const levels = new Set<number>();
    for (const log of baseFilteredLogs) {
      if (typeof log.lv === "number" && Number.isFinite(log.lv)) {
        levels.add(log.lv);
      }
    }
    return Array.from(levels).sort((a, b) => a - b);
  }, [baseFilteredLogs]);

  const filteredLogs = useMemo(() => {
    if (logLevelFilter === "all") {
      return baseFilteredLogs;
    }
    return baseFilteredLogs.filter((log) => String(log.lv ?? "") === logLevelFilter);
  }, [baseFilteredLogs, logLevelFilter]);

  useEffect(() => {
    const totalPagesAccounts = Math.max(1, Math.ceil(filteredAccounts.length / entityUi.accounts.pageSize));
    const totalPagesLogs = Math.max(1, Math.ceil(filteredLogs.length / entityUi.logs.pageSize));

    setEntityUi((prev) => ({
      accounts: {
        ...prev.accounts,
        page: Math.min(prev.accounts.page, totalPagesAccounts),
        selectedIds: prev.accounts.selectedIds.filter((id) => accounts.some((record) => record.id === id)),
      },
      logs: {
        ...prev.logs,
        page: Math.min(prev.logs.page, totalPagesLogs),
        selectedIds: prev.logs.selectedIds.filter((id) => logs.some((record) => record.id === id)),
      },
    }));
  }, [accounts, logs, filteredAccounts.length, filteredLogs.length, entityUi.accounts.pageSize, entityUi.logs.pageSize]);

  useEffect(() => {
    setEntityUi((prev) => ({
      accounts: { ...prev.accounts, page: 1 },
      logs: { ...prev.logs, page: 1 },
    }));
  }, [dateFilter]);

  const paginate = (records: EntityRecord[], state: EntityUiState) => {
    const totalCount = records.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
    const currentPage = Math.min(state.page, totalPages);
    const startIndex = (currentPage - 1) * state.pageSize;
    const items = records.slice(startIndex, startIndex + state.pageSize);
    return {
      items,
      totalCount,
      currentPage,
      totalPages,
      canPrev: currentPage > 1,
      canNext: currentPage < totalPages,
    };
  };

  const accountPagination = paginate(filteredAccounts, entityUi.accounts);
  const logPagination = paginate(filteredLogs, entityUi.logs);

  const activitySeries = useMemo(() => buildActivitySeries(accounts, logs), [accounts, logs]);
  const dateFilterLabel = DATE_FILTERS.find((option) => option.key === dateFilter)?.label ?? "Tất cả";
  const teamFilterLabel = activeTab === "accounts"
    ? (accountTagFilter === "all"
      ? null
      : accountTagFilter === TAG_FILTER_UNASSIGNED
        ? "Chưa gán Tag"
        : `Team ${accountTagFilter}`)
    : null;
  const levelFilterLabel = activeTab === "logs" && logLevelFilter !== "all" ? `LV ${logLevelFilter}` : null;
  const isFilterDefault = dateFilter === "all" && accountTagFilter === "all" && logLevelFilter === "all";
  const canShowCharts = widgetState.statusChart || widgetState.activityTimeline;
  const canShowImportAssistant = widgetState.importAssistant;

  useEffect(() => {
    if (!canShowCharts) {
      setChartsDialogOpen(false);
    }
  }, [canShowCharts]);

  useEffect(() => {
    if (!canShowImportAssistant) {
      setImportDialogOpen(false);
    }
  }, [canShowImportAssistant]);

  const handleTabChange = (value: string) => {
    const nextTab = value === "logs" ? "logs" : "accounts";
    setActiveTab(nextTab);

    const params = new URLSearchParams(searchParams);
    if (nextTab === "logs") {
      params.set("tab", "logs");
    } else {
      params.delete("tab");
    }

    setSearchParams(params, { replace: true });
  };

  const handleSearchChange = (entity: EntityKey, value: string) => {
    setEntityUi((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], searchTerm: value, page: 1 },
    }));
  };

  const handleStatusFilterChange = (entity: EntityKey, value: "all" | "on" | "off") => {
    setEntityUi((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], statusFilter: value, page: 1 },
    }));
  };

  const handleTagFilterChange = useCallback((value: TagFilterValue) => {
    setAccountTagFilter(value);
    setEntityUi((prev) => ({
      ...prev,
      accounts: { ...prev.accounts, page: 1 },
    }));
  }, []);

  const handleLogLevelFilterChange = useCallback((value: string) => {
    setLogLevelFilter(value);
    setEntityUi((prev) => ({
      ...prev,
      logs: { ...prev.logs, page: 1 },
    }));
  }, []);

  useEffect(() => {
    if (accountTagFilter === "all") {
      return;
    }

    const normalizedCurrent = accountTagFilter.toLowerCase();
    if (normalizedCurrent === TAG_FILTER_UNASSIGNED) {
      if (!hasUnassignedTag) {
        handleTagFilterChange("all");
      }
      return;
    }

    const hasMatch = tagOptions.some((option) => option.trim().toLowerCase() === normalizedCurrent);
    if (!hasMatch) {
      handleTagFilterChange("all");
    }
  }, [accountTagFilter, tagOptions, hasUnassignedTag, handleTagFilterChange]);

  useEffect(() => {
    if (logLevelFilter === "all") {
      return;
    }

    const hasLevel = baseFilteredLogs.some((log) => String(log.lv ?? "") === logLevelFilter);
    if (!hasLevel) {
      setLogLevelFilter("all");
    }
  }, [baseFilteredLogs, logLevelFilter]);

  useEffect(() => {
    if (accountTagFilter !== "all" && accounts.length > 0 && filteredAccounts.length === 0) {
      handleTagFilterChange("all");
    }
  }, [accounts.length, filteredAccounts.length, accountTagFilter, handleTagFilterChange]);

  const handleResetQuickFilters = () => {
    setDateFilter("all");
    handleTagFilterChange("all");
    handleLogLevelFilterChange("all");
  };

  const handleSelectedChange = (entity: EntityKey, ids: number[]) => {
    setEntityUi((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], selectedIds: ids },
    }));
  };

  const handlePageChange = (entity: EntityKey, nextPage: number) => {
    setEntityUi((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], page: nextPage },
    }));
  };

  const handlePageSizeChange = (entity: EntityKey, pageSize: number) => {
    setEntityUi((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], pageSize, page: 1 },
    }));
  };

  const handleToggleStatus = (entity: EntityKey, record: EntityRecord) => {
    // Check if already updating
    if (updatingStatusIds.has(record.id)) {
      toast({
        title: "Đang xử lý",
        description: "Vui lòng chờ dữ liệu được cập nhật",
        variant: "default",
      });
      return;
    }

    // For accounts: require active live session before updating status
    if (entity === "accounts") {
      const activeSession = activeSessionQuery.data;
      if (!activeSession) {
        toast({
          title: "Chưa set buổi live",
          description: "Vui lòng set giá cho buổi live trước khi cập nhật trạng thái account. Nhấn vào nút 'Set giá' để thiết lập.",
          variant: "destructive",
        });
        // Auto-open set price dialog after a short delay
        setTimeout(() => {
          setSetPriceDialogOpen(true);
        }, 1000);
        return;
      }
    }

    const mutation = entity === "accounts" ? accountMutations.toggleStatusMutation : logMutations.toggleStatusMutation;
    
    // Save previous status before toggle
    const previousStatus = record.status;
    const newStatus = !record.status;
    const recordLabel = record.username || `#${record.id}`;
    const nextStatusLabel = newStatus ? "ON" : "OFF";
    const entityLabel = entity === "accounts" ? "Tài khoản" : "Acc log";
    
    // Add to updating set
    setUpdatingStatusIds((prev) => new Set(prev).add(record.id));
    
    // Show loading toast for this record
    const pendingToast = toast({
      title: "Đang cập nhật",
      description: `${entityLabel} ${recordLabel} đang chuyển sang ${nextStatusLabel}`,
    });

    mutation.mutate(
      { id: record.id, status: newStatus },
      {
        onSuccess: () => {
          pendingToast?.update?.({
            id: pendingToast.id,
            title: "Đã cập nhật",
            description: `${entityLabel} ${recordLabel} đã chuyển sang ${nextStatusLabel}`,
          });
          setTimeout(() => pendingToast?.dismiss?.(), 2500);
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Không thể cập nhật";
          pendingToast?.update?.({
            id: pendingToast.id,
            title: "Cập nhật thất bại",
            description: `${entityLabel} ${recordLabel}: ${message}`,
            variant: "destructive",
          });
        },
        onSettled: () => {
          // Remove from updating set when done
          setUpdatingStatusIds((prev) => {
            const next = new Set(prev);
            next.delete(record.id);
            return next;
          });
          // Invalidate revenue if turning OFF accounts (ON → OFF: account đã được sử dụng xong, tính doanh thu)
          // Chỉ tính doanh thu cho accounts, không tính cho acclogs
          if (entity === "accounts" && previousStatus && !newStatus) {
            console.log('[Frontend] Account turned OFF, invalidating revenue queries');
            queryClient.invalidateQueries({ queryKey: ["/api/revenue/current-session"] });
            queryClient.invalidateQueries({ queryKey: ["/api/revenue/stats"] });
            // Force immediate refetch
            setTimeout(() => {
              queryClient.refetchQueries({ queryKey: ["/api/revenue/current-session"], exact: false });
              queryClient.refetchQueries({ queryKey: ["/api/revenue/stats"], exact: false });
            }, 800);
          }
        },
      }
    );
  };

  const handleDeleteRecord = (entity: EntityKey, record: EntityRecord) => {
    setPendingDelete({ entity, record });
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const mutation = pendingDelete.entity === "accounts" ? accountMutations.deleteMutation : logMutations.deleteMutation;
    mutation.mutate(pendingDelete.record.id, {
      onSuccess: () => {
        setEntityUi((prev) => ({
          ...prev,
          [pendingDelete.entity]: {
            ...prev[pendingDelete.entity],
            selectedIds: prev[pendingDelete.entity].selectedIds.filter((id) => id !== pendingDelete.record.id),
          },
        }));
      },
      onSettled: () => setPendingDelete(null),
    });
  };

  const handleDeleteSelected = (entity: EntityKey) => {
    if (entityUi[entity].selectedIds.length === 0) {
      toast({
        title: "Chưa có mục nào",
        description: "Vui lòng chọn ít nhất một mục để xóa",
        variant: "destructive",
      });
      return;
    }
    setPendingBulkDelete({ entity, mode: "selected" });
  };

  const handleDeleteAll = (entity: EntityKey) => {
    setPendingBulkDelete({ entity, mode: "all" });
  };

  const handleConfirmBulkDelete = () => {
    if (!pendingBulkDelete) {
      return;
    }
    const { entity, mode } = pendingBulkDelete;
    const ids = mode === "selected" ? entityUi[entity].selectedIds : undefined;
    const mutation = entity === "accounts" ? accountMutations.deleteMultipleMutation : logMutations.deleteMultipleMutation;

    mutation.mutate(ids, {
      onSuccess: () => {
        setEntityUi((prev) => ({
          ...prev,
          [entity]: { ...prev[entity], selectedIds: [], page: 1 },
        }));
      },
      onSettled: () => setPendingBulkDelete(null),
    });
  };

  const handleExportSelected = (entity: EntityKey) => {
    const config = ENTITY_CONFIG[entity];
    const records = entity === "accounts" ? accounts : logs;
    const selectedIds = entityUi[entity].selectedIds;
    const selectedRecords = records.filter((record) => selectedIds.includes(record.id));
    exportRecords(selectedRecords, `${config.exportPrefix}-selected`, toast, "muc");
  };

  const handleExportFiltered = (entity: EntityKey) => {
    const config = ENTITY_CONFIG[entity];
    const filtered = entity === "accounts" ? filteredAccounts : filteredLogs;
    exportRecords(filtered, `${config.exportPrefix}-filtered`, toast, "muc");
  };

  const handleExportSelectedTxt = (entity: EntityKey) => {
    const config = ENTITY_CONFIG[entity];
    const records = entity === "accounts" ? accounts : logs;
    const selectedIds = entityUi[entity].selectedIds;
    const selectedRecords = records.filter((record) => selectedIds.includes(record.id));
    exportRecordsTxt(selectedRecords, `${config.exportPrefix}-selected`, toast, "muc");
  };

  const handleExportFilteredTxt = (entity: EntityKey) => {
    const config = ENTITY_CONFIG[entity];
    const filtered = entity === "accounts" ? filteredAccounts : filteredLogs;
    exportRecordsTxt(filtered, `${config.exportPrefix}-filtered`, toast, "muc");
  };

  const handleUpdateAll = (entity: EntityKey, status: boolean) => {
    // For accounts: require active live session before updating status
    if (entity === "accounts") {
      const activeSession = activeSessionQuery.data;
      if (!activeSession) {
        toast({
          title: "Chưa set buổi live",
          description: "Vui lòng set giá cho buổi live trước khi cập nhật trạng thái account. Nhấn vào nút 'Set giá' để thiết lập.",
          variant: "destructive",
        });
        // Auto-open set price dialog after a short delay
        setTimeout(() => {
          setSetPriceDialogOpen(true);
        }, 1000);
        return;
      }
    }

    const mutation = entity === "accounts" ? accountMutations.updateAllMutation : logMutations.updateAllMutation;
    mutation.mutate(status);
  };

  const handleUpdateSelected = (entity: EntityKey, status: boolean) => {
    const selectedIds = entityUi[entity].selectedIds;
    if (selectedIds.length === 0) {
      toast({
        title: "Chưa có mục nào",
        description: "Vui lòng chọn ít nhất một mục để cập nhật",
        variant: "destructive",
      });
      return;
    }

    // For accounts: require active live session before updating status
    if (entity === "accounts") {
      const activeSession = activeSessionQuery.data;
      if (!activeSession) {
        toast({
          title: "Chưa set buổi live",
          description: "Vui lòng set giá cho buổi live trước khi cập nhật trạng thái account. Nhấn vào nút 'Set giá' để thiết lập.",
          variant: "destructive",
        });
        // Auto-open set price dialog after a short delay
        setTimeout(() => {
          setSetPriceDialogOpen(true);
        }, 1000);
        return;
      }
    }

    const mutation = entity === "accounts"
      ? accountMutations.updateSelectedMutation
      : logMutations.updateSelectedMutation;
    mutation.mutate({ ids: selectedIds, status });
  };

  const handleOpenTagModalForAccount = (account: Account) => {
    setTagModalState({
      mode: "single",
      ids: [account.id],
      initialTag: account.tag ?? "",
      accountName: account.username,
    });
  };

  const handleOpenTagModalForSelection = () => {
    const ids = entityUi.accounts.selectedIds;
    if (ids.length === 0) {
      toast({
        title: "Chưa chọn tài khoản",
        description: "Vui lòng chọn ít nhất một tài khoản để gắn tag",
        variant: "destructive",
      });
      return;
    }

    const selectedAccounts = accounts.filter((account) => ids.includes(account.id));
    const uniqueTags = new Set(selectedAccounts.map((account) => account.tag ?? ""));
    const sharedTag = uniqueTags.size === 1 ? selectedAccounts[0]?.tag ?? "" : "";

    setTagModalState({ mode: "bulk", ids, initialTag: sharedTag ?? "" });
  };

  const handleImportRecords = async (entity: EntityKey, payload: ImportPayload) => {
    const mutation = entity === "accounts" ? accountImportMutation : logImportMutation;
    try {
      const response = await mutation.mutateAsync(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [ENTITY_CONFIG[entity].listKey] }),
        queryClient.invalidateQueries({ queryKey: [ENTITY_CONFIG[entity].statsKey] }),
      ]);
      const summary: ImportSummary = {
        entity,
        imported: response.imported,
        errors: response.errors,
        sourceName: payload.sourceName,
        timestamp: new Date().toISOString(),
      };
      setLastImportSummary(summary);
      setImportFeedback({ ...summary, errorDetails: response.errorDetails });
      toast({
        title: "Import thành công",
        description: `Đã thêm ${response.imported} ${ENTITY_CONFIG[entity].label.toLowerCase()}`,
      });
    } catch (error) {
      // error đã được xu ly trong mutation onError
    }
  };

  const handleTagSave = async (tag: string | null) => {
    if (!tagModalState) {
      return;
    }

    const normalizedTag = typeof tag === "string" && tag.length > 0 ? tag : null;

    try {
      if (tagModalState.mode === "single") {
        await updateAccountTagMutation.mutateAsync({ id: tagModalState.ids[0], tag: normalizedTag });
        toast({
          title: "Đã cập nhật tag",
          description: normalizedTag ? `Tag mới: ${normalizedTag}` : "Đã xóa tag",
        });
      } else {
        await bulkUpdateAccountTagMutation.mutateAsync({ ids: tagModalState.ids, tag: normalizedTag });
        toast({
          title: "Đã cập nhật tag",
          description: `Đã áp dụng tag cho ${tagModalState.ids.length} tài khoản`,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [ENTITY_CONFIG.accounts.listKey] }),
        queryClient.invalidateQueries({ queryKey: [ENTITY_CONFIG.accounts.statsKey] }),
      ]);

      setTagModalState(null);
    } catch (error) {
      // lỗi đã được xu ly trong mutation
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isDeletingSingle = pendingDelete
    ? pendingDelete.entity === "accounts"
      ? accountMutations.deleteMutation.isPending
      : logMutations.deleteMutation.isPending
    : false;

  const isDeletingMultiple = pendingBulkDelete
    ? pendingBulkDelete.entity === "accounts"
      ? accountMutations.deleteMultipleMutation.isPending
      : logMutations.deleteMultipleMutation.isPending
    : false;

  const isTagUpdating = updateAccountTagMutation.isPending || bulkUpdateAccountTagMutation.isPending;

  const pageSizeOptions = [10, 20, 50, 100, 500, 1000];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/70 bg-card/30 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Lượng chứ ai nữa</p>
              <p className="text-xs text-muted-foreground">Kho acc liên quân</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6">
        <OverviewCards
          accountStats={accountStats}
          logStats={logStats}
          dateFilter={dateFilter}
          tagFilter={accountTagFilter}
          accounts={accounts}
          logs={logs}
          lastImportSummary={lastImportSummary}
          currentSessionRevenue={currentSessionRevenueQuery.data ?? null}
        />

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/70 bg-card/50 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <Badge variant="outline" className="gap-1 rounded-full px-3 py-1">
              <CalendarClock className="mr-1 h-3.5 w-3.5" />
              {dateFilterLabel}
            </Badge>
            {activeTab === "accounts" && teamFilterLabel ? (
              <Badge variant="outline" className="gap-1 rounded-full px-3 py-1">
                <Users className="mr-1 h-3.5 w-3.5" />
                {teamFilterLabel}
              </Badge>
            ) : null}
            {activeTab === "logs" && levelFilterLabel ? (
              <Badge variant="outline" className="gap-1 rounded-full px-3 py-1">
                <Filter className="mr-1 h-3.5 w-3.5" />
                {levelFilterLabel}
              </Badge>
            ) : null}
            {isFilterDefault ? (
              <span className="text-xs text-muted-foreground">Đang dùng mặc định</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setFilterDialogOpen(true)}>
              <Filter className="h-4 w-4" />
              Bộ lọc
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleResetQuickFilters} disabled={isFilterDefault}>
              <CalendarClock className="h-4 w-4" />
              Đặt lại
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setWidgetDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              Tùy chỉnh widget
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setChartsDialogOpen(true)}
              disabled={!canShowCharts}
            >
              <LineChart className="h-4 w-4" />
              Biểu đồ
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setImportDialogOpen(true)}
              disabled={!canShowImportAssistant}
            >
              <UploadCloud className="h-4 w-4" />
              Trợ lý import
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setSetPriceDialogOpen(true)}
            >
              <DollarSign className="h-4 w-4" />
              Set giá live
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="accounts">Csuc</TabsTrigger>
              <TabsTrigger value="logs">Cần up</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4" />
              {activeTab === "accounts"
                ? `${formatNumber(filteredAccounts.length)} / ${formatNumber(accounts.length)} tài khoản hiện thị`
                : `${formatNumber(filteredLogs.length)} / ${formatNumber(logs.length)} acc log hiện thị`}
            </div>
          </div>

          <TabsContent value="accounts" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[3fr_1fr]">
              <AccountTable
                accounts={accountPagination.items as Account[]}
                isLoading={accountsQuery.isLoading}
                searchTerm={entityUi.accounts.searchTerm}
                statusFilter={entityUi.accounts.statusFilter}
                onSearchChange={(value) => handleSearchChange("accounts", value)}
                onStatusFilterChange={(value) => handleStatusFilterChange("accounts", value)}
                onCopyUsername={(username, accountId) => {
                  copyToClipboard(username, "Username", toast, `username-${accountId}`, setActiveCopyButtons);
                }}
                onCopyPassword={(password, accountId) => {
                  copyToClipboard(password, "Password", toast, `password-${accountId}`, setActiveCopyButtons);
                }}
                onToggleStatus={(record) => handleToggleStatus("accounts", record)}
                onDeleteClick={(record) => handleDeleteRecord("accounts", record)}
                updatingStatusIds={updatingStatusIds}
                activeCopyButtons={activeCopyButtons}
                selectedAccounts={entityUi.accounts.selectedIds}
                onSelectedAccountsChange={(ids) => handleSelectedChange("accounts", ids)}
                onDeleteSelected={() => handleDeleteSelected("accounts")}
                onExportSelected={() => handleExportSelected("accounts")}
                onExportAll={() => handleExportFiltered("accounts")}
                onDeleteAll={() => handleDeleteAll("accounts")}
                totalCount={accountPagination.totalCount}
                page={accountPagination.currentPage}
                pageSize={entityUi.accounts.pageSize}
                pageSizeOptions={pageSizeOptions}
                canPrev={accountPagination.canPrev}
                canNext={accountPagination.canNext}
                onPrevPage={() => handlePageChange("accounts", Math.max(1, accountPagination.currentPage - 1))}
                onNextPage={() => handlePageChange("accounts", Math.min(accountPagination.totalPages, accountPagination.currentPage + 1))}
                onPageSizeChange={(size) => handlePageSizeChange("accounts", size)}
                title="Clone csuc"
                emptyMessage={ENTITY_CONFIG.accounts.emptyMessage}
                showTagColumn
                onEditTag={(record) => handleOpenTagModalForAccount(record as Account)}
              />

              <div className="space-y-6">
                <BulkActionsCard
                  label={ENTITY_CONFIG.accounts.label}
                  selectionCount={entityUi.accounts.selectedIds.length}
                  totalCount={accounts.length}
                  onUpdateAll={(status) => handleUpdateAll("accounts", status)}
                  onUpdateSelected={(status) => handleUpdateSelected("accounts", status)}
                  isUpdatingSelected={accountMutations.updateSelectedMutation.isPending}
                  disableUpdateSelected={entityUi.accounts.selectedIds.length === 0}
                  isUpdating={accountMutations.updateAllMutation.isPending}
                  onDeleteSelected={() => handleDeleteSelected("accounts")}
                  onDeleteAll={() => handleDeleteAll("accounts")}
                  onExportAll={() => handleExportFiltered("accounts")}
                  onExportSelected={() => handleExportSelected("accounts")}
                  onExportAllTxt={() => handleExportFilteredTxt("accounts")}
                  onExportSelectedTxt={() => handleExportSelectedTxt("accounts")}
                  onAssignTag={handleOpenTagModalForSelection}
                  disableAssignTag={entityUi.accounts.selectedIds.length === 0}
                  disableDeleteSelected={entityUi.accounts.selectedIds.length === 0}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[3fr_1fr]">
              <AccountTable
                accounts={logPagination.items as AccLog[]}
                isLoading={logsQuery.isLoading}
                searchTerm={entityUi.logs.searchTerm}
                statusFilter={entityUi.logs.statusFilter}
                onSearchChange={(value) => handleSearchChange("logs", value)}
                onStatusFilterChange={(value) => handleStatusFilterChange("logs", value)}
                onCopyUsername={(username, accountId) => {
                  copyToClipboard(username, "Username", toast, `username-${accountId}`, setActiveCopyButtons);
                }}
                onCopyPassword={(password, accountId) => {
                  copyToClipboard(password, "Password", toast, `password-${accountId}`, setActiveCopyButtons);
                }}
                onToggleStatus={(record) => handleToggleStatus("logs", record)}
                onDeleteClick={(record) => handleDeleteRecord("logs", record)}
                updatingStatusIds={updatingStatusIds}
                activeCopyButtons={activeCopyButtons}
                selectedAccounts={entityUi.logs.selectedIds}
                onSelectedAccountsChange={(ids) => handleSelectedChange("logs", ids)}
                onDeleteSelected={() => handleDeleteSelected("logs")}
                onExportSelected={() => handleExportSelected("logs")}
                onExportAll={() => handleExportFiltered("logs")}
                onDeleteAll={() => handleDeleteAll("logs")}
                totalCount={logPagination.totalCount}
                page={logPagination.currentPage}
                pageSize={entityUi.logs.pageSize}
                pageSizeOptions={pageSizeOptions}
                canPrev={logPagination.canPrev}
                canNext={logPagination.canNext}
                onPrevPage={() => handlePageChange("logs", Math.max(1, logPagination.currentPage - 1))}
                onNextPage={() => handlePageChange("logs", Math.min(logPagination.totalPages, logPagination.currentPage + 1))}
                onPageSizeChange={(size) => handlePageSizeChange("logs", size)}
                title="Clone <lv11"
                emptyMessage={ENTITY_CONFIG.logs.emptyMessage}
                showLevelColumn
                levelFilter={logLevelFilter}
                levelOptions={logLevelOptions}
                onLevelFilterChange={handleLogLevelFilterChange}
              />

              <div className="space-y-6">
                <BulkActionsCard
                  label={ENTITY_CONFIG.logs.label}
                  selectionCount={entityUi.logs.selectedIds.length}
                  totalCount={logs.length}
                  onUpdateAll={(status) => handleUpdateAll("logs", status)}
                  onUpdateSelected={(status) => handleUpdateSelected("logs", status)}
                  isUpdatingSelected={logMutations.updateSelectedMutation.isPending}
                  disableUpdateSelected={entityUi.logs.selectedIds.length === 0}
                  isUpdating={logMutations.updateAllMutation.isPending}
                  onDeleteSelected={() => handleDeleteSelected("logs")}
                  onDeleteAll={() => handleDeleteAll("logs")}
                  onExportAll={() => handleExportFiltered("logs")}
                  onExportSelected={() => handleExportSelected("logs")}
                  onExportAllTxt={() => handleExportFilteredTxt("logs")}
                  onExportSelectedTxt={() => handleExportSelectedTxt("logs")}
                  disableDeleteSelected={entityUi.logs.selectedIds.length === 0}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={isFilterDialogOpen} onOpenChange={setFilterDialogOpen}>
          <DialogContent className="sm:max-w-xl border border-border/60 bg-[#EEEEEE] text-gray-900 shadow-lg backdrop-blur dark:bg-neutral-900 dark:text-gray-100">
            <DialogHeader>
              <DialogTitle>Bộ lọc</DialogTitle>
              <DialogDescription>Điều chỉnh phạm vi dữ liệu cho bảng và biểu đồ.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Khoảng thời gian</Label>
                <div className="flex flex-wrap gap-2">
                  {DATE_FILTERS.map((option) => (
                    <Button
                      key={option.key}
                      size="sm"
                      variant={dateFilter === option.key ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setDateFilter(option.key)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              {activeTab === "accounts" ? (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag</Label>
                  <Select value={accountTagFilter} onValueChange={(value) => handleTagFilterChange(value as TagFilterValue)}>
                    <SelectTrigger className="h-10 w-full rounded-full border-border/70 text-sm">
                      <SelectValue placeholder="Chọn Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả tag</SelectItem>
                      {hasUnassignedTag ? (<SelectItem value={TAG_FILTER_UNASSIGNED}>Chưa gắn tag</SelectItem>) : null}
                      {tagOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {activeTab === "logs" ? (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cấp độ</Label>
                  <Select value={logLevelFilter} onValueChange={handleLogLevelFilterChange}>
                    <SelectTrigger className="h-10 w-full rounded-full border-border/70 text-sm">
                      <SelectValue placeholder="Chọn cấp độ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả cấp độ</SelectItem>
                      {logLevelOptions.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          LV {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetQuickFilters}
                  disabled={isFilterDefault}
                >
                  Đặt lại mặc định
                </Button>
                <Button size="sm" onClick={() => setFilterDialogOpen(false)} className="gap-2">
                  Áp dụng
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isWidgetDialogOpen} onOpenChange={setWidgetDialogOpen}>
          <DialogContent className="sm:max-w-lg border border-border/60 bg-[#EEEEEE] text-gray-900 shadow-lg backdrop-blur dark:bg-neutral-900 dark:text-gray-100">
            <DialogHeader>
              <DialogTitle>Tùy chỉnh widget</DialogTitle>
              <DialogDescription>Chọn các khối thông tin muốn hiển thị trên bảng điều khiển.</DialogDescription>
            </DialogHeader>
            <WidgetTogglePanel state={widgetState} onChange={setWidgetState} layout="plain" />
          </DialogContent>
        </Dialog>

        <Dialog open={isChartsDialogOpen} onOpenChange={setChartsDialogOpen}>
          <DialogContent className="sm:max-w-5xl border border-border/60 bg-[#EEEEEE] text-gray-900 shadow-lg backdrop-blur dark:bg-neutral-900 dark:text-gray-100">
            <DialogHeader>
              <DialogTitle>Biểu đồ thống kê</DialogTitle>
              <DialogDescription>Quan sát trạng thái, hoạt động và doanh thu gần đây.</DialogDescription>
            </DialogHeader>
            {canShowCharts ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {widgetState.statusChart ? (
                  <StatusBreakdownChart accountStats={accountStats} logStats={logStats} />
                ) : null}
                {widgetState.activityTimeline ? (
                  <ActivityTimeline data={activitySeries.data} hasActivity={activitySeries.hasActivity} />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Biểu đồ đang bị tắt trong phần tùy chỉnh widget.
              </p>
            )}
            <div className="mt-6">
              <RevenueChart
                data={revenueStatsQuery.data ?? []}
                activeSession={activeSessionQuery.data ?? null}
              />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isImportDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="sm:max-w-4xl border border-border/60 bg-[#EEEEEE] text-gray-900 shadow-lg backdrop-blur dark:bg-neutral-900 dark:text-gray-100">
            <DialogHeader>
              <DialogTitle>Trợ lý import</DialogTitle>
              <DialogDescription>Chuẩn hoá dữ liệu trước khi đưa vào hệ thống.</DialogDescription>
            </DialogHeader>
            {canShowImportAssistant ? (
              <div className="max-h-[70vh] overflow-y-auto pr-1 sm:pr-2">
                <ImportPipelineAssistant
                  entity={activeTab}
                  onImport={(payload) => handleImportRecords(activeTab, payload)}
                  isImporting={activeTab === "accounts" ? accountImportMutation.isPending : logImportMutation.isPending}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Trợ lý import đang bị tắt. Bật lại trong phần tùy chỉnh widget.
              </p>
            )}
          </DialogContent>
        </Dialog>
      </main>

      <DeleteModal
        isOpen={!!pendingDelete}
        accountName={pendingDelete?.record.username ?? ""}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
        isDeleting={isDeletingSingle}
      />

      <DeleteMultipleModal
        isOpen={!!pendingBulkDelete}
        deleteCount={pendingBulkDelete?.mode === "all"
          ? (pendingBulkDelete?.entity === "accounts" ? accounts.length : logs.length)
          : (pendingBulkDelete?.entity === "accounts"
            ? entityUi.accounts.selectedIds.length
            : entityUi.logs.selectedIds.length)}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setPendingBulkDelete(null)}
        isDeleting={isDeletingMultiple}
      />

      <AlertDialog open={!!importFeedback} onOpenChange={() => setImportFeedback(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kết quả import</AlertDialogTitle>
            <AlertDialogDescription>
              {importFeedback ? (
                <div className="space-y-2 text-sm">
                  <p>
                    {ENTITY_CONFIG[importFeedback.entity].label}: {importFeedback.imported} dòng hợp lệ,
                    {" "}
                    {importFeedback.errors} dòng lỗi.
                  </p>
                  <p>Nguồn: {importFeedback.sourceName}</p>
                  {importFeedback.errorDetails.length > 0 ? (
                    <div className="max-h-48 overflow-auto rounded-md border p-3 text-xs">
                      <p className="mb-2 font-medium">Dòng lỗi:</p>
                      <ul className="list-disc space-y-1 pl-4">
                        {importFeedback.errorDetails.map((item, index) => (
                          <li key={index}>
                            <span className="font-semibold">{(item.account as any)?.username ?? "(không rõ)"}:</span>{" "}
                            {item.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>Khong co lỗi nao.</p>
                  )}
                </div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Đóng</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TeamDialog
        open={!!tagModalState}
        mode={tagModalState?.mode ?? "single"}
        subject={tagModalState?.mode === "single" ? tagModalState.accountName : undefined}
        itemCount={tagModalState?.mode === "bulk" ? tagModalState.ids.length : 1}
        currentValue={tagModalState?.initialTag ?? ""}
        isProcessing={isTagUpdating}
        onClose={() => {
          if (isTagUpdating) {
            return;
          }
          setTagModalState(null);
        }}
        onSave={handleTagSave}
      />
      <SetPriceDialog open={isSetPriceDialogOpen} onOpenChange={setSetPriceDialogOpen} />
    </div>
  );
}









