import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { Loader2, ShieldCheck, Sparkles, Clock3 } from 'lucide-react';
import ThemeToggle from '@/components/theme-toggle';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const featureHighlights: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: ShieldCheck,
    title: 'Bảo mật nhiều lớp',
    description: 'Mật khẩu, phiên đăng nhập và luồng import đều được mã hóa và giám sát liên tục.',
  },
  {
    icon: Sparkles,
    title: 'Trải nghiệm tối ưu',
    description: 'Được tinh chỉnh cho desktop, tablet và mobile với các thao tác quen thuộc.',
  },
  {
    icon: Clock3,
    title: 'Theo dõi realtime',
    description: 'Nhật ký truy cập, trạng thái acc và tiến trình import được cập nhật từng giây.',
  },
];

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, isAuthenticated, isAuthenticating } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isAuthenticating) {
      return;
    }
    await login(username, password);
  };

  const gradientClass = isDark
    ? 'from-slate-950 via-slate-900 to-slate-950 text-slate-100'
    : 'from-slate-100 via-white to-slate-100 text-slate-900';

  const primaryGlowClass = isDark ? 'bg-primary/25' : 'bg-primary/30';
  const secondaryGlowClass = isDark ? 'bg-sky-500/20' : 'bg-sky-300/30';
  const dividerClass = isDark ? 'bg-white/20' : 'bg-slate-400/30';

  const toggleClass = isDark
    ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
    : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-100';

  const showcasePanelClass = isDark
    ? 'border-white/10 bg-white/5 text-white'
    : 'border-slate-200 bg-white/85 text-slate-800';

  const showcaseBadgeClass = isDark ? 'bg-white/10 text-white/80' : 'bg-primary/10 text-primary/80';
  const featureCardClass = isDark ? 'border-white/10 bg-white/10 text-white/80' : 'border-slate-200 bg-white text-slate-700';
  const infoPanelClass = isDark ? 'border-white/10 bg-white/10 text-white/80' : 'border-slate-200 bg-white text-slate-700';

  return (
    <div className={cn('relative min-h-screen overflow-hidden bg-gradient-to-br transition-colors duration-500', gradientClass)}>
      <div className="absolute right-4 top-4 z-20 flex justify-end sm:right-6 sm:top-6">
        <ThemeToggle className={cn('h-11 w-11 rounded-2xl backdrop-blur', toggleClass)} />
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className={cn('absolute -top-32 left-[-10%] h-80 w-80 rounded-full blur-3xl', primaryGlowClass)} />
        <div className={cn('absolute bottom-[-20%] right-[-10%] h-[420px] w-[420px] rounded-full blur-3xl', secondaryGlowClass)} />
        <div className={cn('absolute inset-x-0 top-1/2 h-px', dividerClass)} />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <Card className="relative order-1 overflow-hidden rounded-3xl border border-border/60 bg-card/95 text-foreground shadow-[0_30px_90px_-30px_rgba(15,23,42,0.9)] backdrop-blur-md lg:order-2">
            <div className="pointer-events-none absolute inset-x-0 -top-52 h-60 bg-gradient-to-b from-primary/30 via-transparent to-transparent" />
            <CardHeader className="relative space-y-4">
              <Badge
                variant="outline"
                className="w-fit rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary"
              >
                Khu vực nội bộ
              </Badge>
              <CardTitle className="text-3xl font-semibold">Đăng nhập hệ thống</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Nhập thông tin được cấp để truy cập kho chung sức, theo dõi acc log và bảng điều khiển realtime.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium text-muted-foreground">
                    Tên đăng nhập
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    disabled={isAuthenticating}
                    className="h-11 rounded-2xl border-border/60 bg-background/70 px-4 text-sm shadow-inner"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                    Mật khẩu
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={isAuthenticating}
                    className="h-11 rounded-2xl border-border/60 bg-background/70 px-4 text-sm shadow-inner"
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary/80 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/40 transition-all hover:from-primary/90 hover:to-primary/70"
                  disabled={isAuthenticating}
                  aria-busy={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                      Đang xác thực...
                    </>
                  ) : (
                    'Đăng nhập'
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Cần hỗ trợ? Liên hệ quản trị viên để được cấp lại thông tin đăng nhập.
                </p>
              </form>
            </CardContent>
          </Card>

          <div
            className={cn(
              'order-2 flex flex-col justify-between gap-10 rounded-3xl border p-8 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.8)] backdrop-blur lg:order-1',
              showcasePanelClass
            )}
          >
            <div className="space-y-4">
              <Badge className={cn('w-fit rounded-full px-3 py-1 text-[11px] uppercase tracking-wider', showcaseBadgeClass)} variant="secondary">
                2025 dashboard mới
              </Badge>
              <h2 className="text-3xl font-semibold leading-snug sm:text-4xl">
                Không chỉ là đăng nhập, mà là cánh cổng vào trung tâm điều hành dữ liệu.
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                Làm việc hiệu quả hơn với giao diện tinh chỉnh cho mọi thiết bị, khả năng import hàng loạt và báo cáo realtime.
              </p>
            </div>

            <div className="grid gap-4">
              {featureHighlights.map(({ icon: Icon, title, description }) => (
                <div key={title} className={cn('flex items-start gap-3 rounded-2xl border p-4', featureCardClass)}>
                  <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className={cn('rounded-2xl border p-5 text-sm', infoPanelClass)}>
              <p className="font-medium text-foreground">Trung tâm hỗ trợ 24/7</p>
              <p className="text-muted-foreground">
                Lịch bảo trì và cập nhật sẽ được thông báo trực tiếp trong dashboard sau khi bạn đăng nhập.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
