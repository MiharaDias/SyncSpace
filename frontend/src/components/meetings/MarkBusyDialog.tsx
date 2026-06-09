import { useState, useEffect } from 'react';
import { format, addMinutes } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import api from '../../lib/api';

const REASONS = ['Lunch Break', 'Client Visit', 'Personal Work', 'Out of Office', 'Doctor Appointment', 'Other'];
const DURATION_OPTIONS = [
  { label: '30 min', value: 30 }, { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 }, { label: 'All day', value: 480 },
  { label: 'Custom', value: 0 },
];

interface Props {
  open: boolean;
  initialTime?: Date;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MarkBusyDialog({ open, initialTime, onClose, onSuccess }: Props) {
  const [startTime, setStartTime] = useState(
    initialTime ? format(initialTime, "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [duration, setDuration] = useState(60);
  const [customEnd, setCustomEnd] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isAllDay] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialTime) {
      setStartTime(format(initialTime, "yyyy-MM-dd'T'HH:mm"));
    }
  }, [initialTime]);

  const getEndTime = () => {
    if (duration === 0) return customEnd;
    const start = new Date(startTime);
    return format(addMinutes(start, duration), "yyyy-MM-dd'T'HH:mm");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endTime = getEndTime();
      if (!endTime) return;
      await api.post('/api/busy', {
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        reason: reason === 'Other' ? customReason : reason || 'Busy',
        is_all_day: isAllDay,
      });
      onSuccess();
    } catch (err: any) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Busy</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input type="datetime-local" value={startTime}
              onChange={e => setStartTime(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {duration === 0 && (
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="datetime-local" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)} required />
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {reason === 'Other' && (
            <div className="space-y-2">
              <Label>Custom Reason</Label>
              <Input placeholder="Enter reason..." value={customReason}
                onChange={e => setCustomReason(e.target.value)} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Mark as Busy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
