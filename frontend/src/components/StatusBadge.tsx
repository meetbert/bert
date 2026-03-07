import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  const variants: Record<string, string> = {
    paid: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
    unpaid: 'bg-destructive text-destructive-foreground',
    overdue: 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]',
    Active: 'bg-primary text-primary-foreground',
    Completed: 'bg-foreground text-background',
  };

  return <span className={cn(base, variants[status] ?? 'bg-secondary text-secondary-foreground', className)}>{status}</span>;
};
