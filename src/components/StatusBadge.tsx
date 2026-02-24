import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';
  const variants: Record<string, string> = {
    unpaid: 'border-foreground/20 text-foreground',
    paid: 'border-foreground bg-foreground text-background',
    overdue: 'border-primary text-primary',
    Active: 'border-foreground/20 text-foreground',
    Completed: 'border-foreground bg-foreground text-background',
  };

  return <span className={cn(base, variants[status] ?? 'border-foreground/20 text-foreground', className)}>{status}</span>;
};
