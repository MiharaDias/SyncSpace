import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import type { CalendarEvent, Meeting } from '../../types';
import { formatDateTime, minutesToDuration, isUrl } from '../../lib/utils';
import { Clock, MapPin, Users, ExternalLink, Trash2, Check, X } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

interface Props {
  event: CalendarEvent;
  onClose: () => void;
  onRefresh: () => void;
}

export default function EventDetailModal({ event, onClose, onRefresh }: Props) {
  const { user } = useAuthStore();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // External Google Calendar event — show minimal info only
  const isExternalGoogleEvent = (event as any).source === 'google_calendar';
  if (isExternalGoogleEvent) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-500" />
              Busy (Google Calendar)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatDateTime(event.start)} – {formatDateTime(event.end)}</span>
            </div>
            <p className="text-xs text-muted-foreground p-3 rounded-lg bg-white/5">
              This time block is from your personal Google Calendar. Details are private and only visible there.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const meeting = event.type === 'meeting' ? (event.raw as Meeting) : null;
  const isOrganizer = meeting?.organizer_id === user?.id;
  const needsResponse = event.response_status === 'pending' && !isOrganizer;

  const respond = async (response: 'accepted' | 'rejected') => {
    if (!meeting) return;
    if (response === 'rejected' && !rejectionReason.trim()) return;
    setLoading(true);
    try {
      await api.post(`/api/meetings/${meeting.id}/respond`, {
        response,
        rejection_reason: rejectionReason
      });
      onRefresh();
      onClose();
    } catch { }
    setLoading(false);
  };

  const cancelMeeting = async () => {
    if (!meeting || !confirm('Cancel this meeting?')) return;
    setLoading(true);
    try {
      await api.delete(`/api/meetings/${meeting.id}`);
      onRefresh();
      onClose();
    } catch { }
    setLoading(false);
  };

  const deleteBusy = async () => {
    if (!confirm('Remove this busy slot?')) return;
    setLoading(true);
    try {
      await api.delete(`/api/busy/${event.id}`);
      onRefresh();
      onClose();
    } catch { }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: event.color }} />
            <div className="flex-1">
              <DialogTitle className="text-left">{event.title}</DialogTitle>
              {event.attendance_type && (
                <span className={`mt-1 inline-block ${event.attendance_type === 'required' ? 'badge-required' : 'badge-optional'}`}>
                  {event.attendance_type === 'required' ? 'REQUIRED MEETING' : 'OPTIONAL MEETING'}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 shrink-0" />
            <span>{formatDateTime(event.start)}</span>
            {meeting && <span>· {minutesToDuration(meeting.duration_minutes)}</span>}
          </div>

          {meeting?.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              {isUrl(meeting.location) ? (
                <a href={meeting.location} target="_blank" rel="noreferrer"
                  className="text-blue-400 hover:underline flex items-center gap-1">
                  Join Meeting <ExternalLink className="w-3 h-3" />
                </a>
              ) : <span>{meeting.location}</span>}
            </div>
          )}

          {meeting?.purpose && (
            <div className="p-3 rounded-lg bg-white/5 text-foreground">
              <p className="text-xs font-medium text-muted-foreground mb-1">Purpose</p>
              <p>{meeting.purpose}</p>
            </div>
          )}

          {meeting?.attendees && meeting.attendees.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Users className="w-4 h-4" />
                <span className="text-xs font-medium">Attendees ({meeting.attendees.length})</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {meeting.attendees.map(att => (
                  <div key={att.id} className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                    <span className="text-xs">{att.users?.full_name || att.user_id}</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] ${att.attendance_type === 'required' ? 'text-blue-400' : 'text-purple-400'}`}>
                        {att.attendance_type}
                      </span>
                      <Badge variant={att.response_status === 'accepted' ? 'success' : att.response_status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                        {att.response_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response Status */}
          {event.response_status && !isOrganizer && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Your response:</span>
              <Badge variant={event.response_status === 'accepted' ? 'success' : event.response_status === 'rejected' ? 'destructive' : 'warning'}>
                {event.response_status}
              </Badge>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          {needsResponse && !showRejectForm && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-2 bg-green-600 hover:bg-green-500" onClick={() => respond('accepted')} disabled={loading}>
                <Check className="w-3 h-3" />Accept
              </Button>
              <Button size="sm" variant="destructive" className="flex-1 gap-2" onClick={() => setShowRejectForm(true)}>
                <X className="w-3 h-3" />Decline
              </Button>
            </div>
          )}

          {showRejectForm && (
            <div className="space-y-2">
              <Textarea
                placeholder="Please provide a reason for declining..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1" onClick={() => respond('rejected')}
                  disabled={!rejectionReason.trim() || loading}>
                  Confirm Decline
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {isOrganizer && meeting && (
            <Button size="sm" variant="destructive" className="w-full gap-2" onClick={cancelMeeting} disabled={loading}>
              <Trash2 className="w-3 h-3" />Cancel Meeting
            </Button>
          )}

          {event.type === 'busy' && (
            <Button size="sm" variant="destructive" className="w-full gap-2" onClick={deleteBusy} disabled={loading}>
              <Trash2 className="w-3 h-3" />Remove Busy Slot
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
