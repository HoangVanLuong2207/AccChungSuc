import { memo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

function ThemeToggleComponent({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        'relative h-10 w-10 rounded-2xl border-border/60 bg-background/70 text-foreground shadow-sm transition-colors hover:bg-background',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      aria-pressed={isDark}
    >
      <Sun className={cn('h-5 w-5 transition-all duration-300', isDark ? 'scale-0 opacity-0' : 'scale-100 opacity-100')} />
      <Moon className={cn('absolute h-5 w-5 transition-all duration-300', isDark ? 'scale-100 opacity-100' : 'scale-0 opacity-0')} />
    </Button>
  );
}

const ThemeToggle = memo(ThemeToggleComponent);

export default ThemeToggle;
