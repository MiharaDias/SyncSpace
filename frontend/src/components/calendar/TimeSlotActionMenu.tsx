import { useEffect, useRef } from 'react';
import { Plus, Clock } from 'lucide-react';

interface Props {
  position: { x: number; y: number };
  onClose: () => void;
  onNewMeeting: () => void;
  onMarkBusy: () => void;
}

export default function TimeSlotActionMenu({ position, onClose, onNewMeeting, onMarkBusy }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const { x, y } = position;
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 120);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[#0f1629] border border-white/10 rounded-xl shadow-xl overflow-hidden w-48"
      style={{ left, top }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-blue-600/20 transition-colors"
        onClick={onNewMeeting}
      >
        <Plus className="w-4 h-4 text-blue-400" />
        New Meeting
      </button>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors border-t border-white/10"
        onClick={onMarkBusy}
      >
        <Clock className="w-4 h-4 text-orange-400" />
        Mark as Busy
      </button>
    </div>
  );
}
