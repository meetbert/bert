import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PROJECT_STATUSES = ['Active', 'Completed'] as const;

interface ProjectStatusDropdownProps {
  status: string;
  onChangeStatus: (newStatus: string) => void;
}

export const ProjectStatusDropdown: React.FC<ProjectStatusDropdownProps> = ({ status, onChangeStatus }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer"><StatusBadge status={status} /></button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="start">
        {PROJECT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { onChangeStatus(s); setOpen(false); }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary ${s === status ? 'bg-secondary font-medium' : ''}`}
          >
            {s}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
