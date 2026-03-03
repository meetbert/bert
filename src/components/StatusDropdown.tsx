import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const STATUSES = ['unpaid', 'paid'] as const;

interface StatusDropdownProps {
  status: string;
  onChangeStatus: (newStatus: string) => void;
}

export const StatusDropdown: React.FC<StatusDropdownProps> = ({ status, onChangeStatus }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer"><StatusBadge status={status} /></button>
      </PopoverTrigger>
      <PopoverContent className="w-32 p-1" align="start">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { onChangeStatus(s); setOpen(false); }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs capitalize hover:bg-secondary ${s === status ? 'bg-secondary font-medium' : ''}`}
          >
            {s}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
