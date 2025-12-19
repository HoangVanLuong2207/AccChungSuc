import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CloneReg } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function parseListInput(value: string): string[] {
  return value
    .split(/\r?\n|,/) // split by newline or comma
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function listToTextarea(list?: string[]): string {
  return (list ?? []).join("\n");
}

type EditState =
  | { mode: "create"; open: boolean }
  | { mode: "edit"; open: boolean; account: CloneReg };

export default function AccountsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<EditState>({ mode: "create", open: false });

  const { data: accounts = [], isLoading } = useQuery<CloneReg[]>({
    queryKey: ["/api/cloneregs"],
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter((a) => {
      const champs = Array.isArray((a as any).champions) ? ((a as any).champions as string[]).join(" ") : (a.champion ?? "");
      const haystack = `${a.username} ${a.password} ${champs} ${(a.skins ?? []).join(" ")}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [accounts, search]);

  // Suggestions for champion and skins based on existing records
  const championSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const r of accounts) {
      const champs = Array.isArray((r as any).champions) ? ((r as any).champions as string[]) : [];
      for (const c of champs) {
        const v = String(c || "").trim();
        if (v) set.add(v);
      }
      const c1 = (r.champion ?? "").trim();
      if (c1) set.add(c1);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  const skinSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const r of accounts) {
      for (const s of r.skins ?? []) {
        const v = String(s || "").trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  const createMutation = useMutation({
    // Create: username/password bắt buộc; champion/skins tùy chọn
    mutationFn: async (payload: { username: string; password: string; champion?: string | null; champions?: string[]; skins?: string[] }) =>
      apiRequest<CloneReg>("POST", "/api/cloneregs", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cloneregs"] });
      toast({ title: "Thành công", description: "Đã thêm tài khoản" });
      setEdit({ mode: "create", open: false });
    },
    onError: (err: any) => {
      toast({ title: "Không thể thêm", description: err?.message ?? "Thử lại sau", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Pick<CloneReg, "username" | "password" | "champion" | "skins">> & { champions?: string[] } }) =>
      apiRequest<CloneReg>("PUT", `/api/cloneregs/${id}` , data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cloneregs"] });
      toast({ title: "Đã lưu", description: "Cập nhật tài khoản thành công" });
      setEdit({ mode: "create", open: false });
    },
    onError: (err: any) => {
      toast({ title: "Không thể cập nhật", description: err?.message ?? "Thử lại sau", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/cloneregs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cloneregs"] });
      toast({ title: "Đã xóa", description: "Xóa tài khoản thành công" });
    },
    onError: (err: any) => {
      toast({ title: "Không thể xóa", description: err?.message ?? "Thử lại sau", variant: "destructive" });
    },
  });

  const [form, setForm] = useState({ username: "", password: "", championsText: "", skinsText: "" });

  const parsedSkins = useMemo(() => parseListInput(form.skinsText), [form.skinsText]);
  const parsedChampions = useMemo(() => parseListInput(form.championsText), [form.championsText]);
  const currentSkinQuery = useMemo(() => {
    const lines = form.skinsText.split(/\r?\n/);
    return (lines[lines.length - 1] || "").trim().toLowerCase();
  }, [form.skinsText]);
  const currentChampionQuery = useMemo(() => {
    const lines = form.championsText.split(/\r?\n/);
    return (lines[lines.length - 1] || "").trim().toLowerCase();
  }, [form.championsText]);
  const filteredSkinSuggestions = useMemo(() => {
    const have = new Set(parsedSkins.map((s) => s.toLowerCase()));
    const pool = currentSkinQuery
      ? skinSuggestions.filter((s) => s.toLowerCase().includes(currentSkinQuery))
      : skinSuggestions;
    return pool.filter((s) => !have.has(s.toLowerCase())).slice(0, 12);
  }, [skinSuggestions, parsedSkins, currentSkinQuery]);

  const filteredChampionSuggestions = useMemo(() => {
    const have = new Set(parsedChampions.map((s) => s.toLowerCase()));
    const pool = currentChampionQuery
      ? championSuggestions.filter((s) => s.toLowerCase().includes(currentChampionQuery))
      : championSuggestions;
    return pool.filter((s) => !have.has(s.toLowerCase())).slice(0, 12);
  }, [championSuggestions, parsedChampions, currentChampionQuery]);

  function addSkinSuggestion(s: string) {
    // Replace last line if it's a partial, otherwise append
    const lines = form.skinsText.split(/\r?\n/);
    if (currentSkinQuery.length > 0) {
      lines[lines.length - 1] = s;
    } else {
      lines.push(s);
    }
    const next = parseListInput(lines.join("\n"));
    const dedup = Array.from(new Set(next));
    setForm((f) => ({ ...f, skinsText: dedup.join("\n") }));
  }

  function addChampionSuggestion(s: string) {
    // Replace last line if it's a partial, otherwise append
    const lines = form.championsText.split(/\r?\n/);
    if (currentChampionQuery.length > 0) {
      lines[lines.length - 1] = s;
    } else {
      lines.push(s);
    }
    const next = parseListInput(lines.join("\n"));
    const dedup = Array.from(new Set(next));
    setForm((f) => ({ ...f, championsText: dedup.join("\n") }));
  }

  const openCreate = () => {
    setForm({ username: "", password: "", championsText: "", skinsText: "" });
    setEdit({ mode: "create", open: true });
  };

  const openEdit = (acc: CloneReg) => {
    setForm({
      username: acc.username,
      password: acc.password,
      championsText: listToTextarea((acc as any).champions ?? (acc.champion ? [acc.champion] : [])),
      skinsText: listToTextarea(acc.skins ?? []),
    });
    setEdit({ mode: "edit", open: true, account: acc });
  };

  const closeDialog = () => setEdit({ mode: "create", open: false });

  const onSubmit = () => {
    const username = form.username.trim();
    const password = form.password.trim();
    if (edit.mode === "create") {
      const champions = parseListInput(form.championsText);
      const skins = parseListInput(form.skinsText);
      createMutation.mutate({ username, password, champions, skins });
    } else {
      const champions = parseListInput(form.championsText);
      const skins = parseListInput(form.skinsText);
      updateMutation.mutate({ id: edit.account.id, data: { username, password, champions, skins } });
    }
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Đã sao chép", description: "Đã lưu vào clipboard" });
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quản lý tài khoản</h1>
        <Button onClick={openCreate} size="sm"><Plus className="mr-2 h-4 w-4" /> Thêm tài khoản</Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Danh sách tài khoản</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-2">
            <Input placeholder="Tìm kiếm username / tướng / skin" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Tài khoản</TableHead>
                  <TableHead className="w-[200px]">Mật khẩu</TableHead>
                  <TableHead className="w-[220px]">Tên tướng</TableHead>
                  <TableHead>Skins / Ghi chú</TableHead>
                  <TableHead className="w-[140px]">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5}>Đang tải...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>Không có tài khoản</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((acc) => (
                    <TableRow key={acc.id}>
                      <TableCell className="font-medium">{acc.username}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[140px]">••••••••</span>
                          <Button variant="ghost" size="icon" onClick={() => copy(acc.password)} title="Copy mật khẩu">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray((acc as any).champions) && (acc as any).champions.length > 0 ? (
                            ((acc as any).champions as string[]).map((c, i) => (
                              <Badge key={`${acc.id}-champion-${i}`} variant="outline">{c}</Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">{acc.champion ?? "--"}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(acc.skins ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">--</span>
                          ) : (
                            (acc.skins ?? []).map((s, i) => (
                              <Badge key={`${acc.id}-skin-${i}`} variant="secondary">{s}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(acc)} title="Chỉnh sửa">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(acc.id)} title="Xóa">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={edit.open} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{edit.mode === "create" ? "Thêm tài khoản" : `Sửa tài khoản`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Tài khoản</label>
              <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="username" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Mật khẩu</label>
              <Input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="password" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Tên tướng (mỗi dòng một tướng)</label>
              <Textarea rows={4} value={form.championsText} onChange={(e) => setForm((f) => ({ ...f, championsText: e.target.value }))} placeholder={"Ví dụ:\nYasuo\nAhri\n..."} />
              {filteredChampionSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {filteredChampionSuggestions.map((s) => (
                    <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => addChampionSuggestion(s)}>
                      {s}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Skins / Ghi chú (mỗi dòng một mục)</label>
              <Textarea rows={5} value={form.skinsText} onChange={(e) => setForm((f) => ({ ...f, skinsText: e.target.value }))} placeholder={"Ví dụ:\nSK Chân Chính\nHuyền Thoại\n..."} />
              {filteredSkinSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {filteredSkinSuggestions.map((s) => (
                    <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => addSkinSuggestion(s)}>
                      {s}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeDialog}>Hủy</Button>
              <Button onClick={onSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {edit.mode === "create" ? "Thêm" : "Lưu"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
