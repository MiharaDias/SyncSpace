import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { CalendarEvent, Meeting, User } from '../../types';
import { formatDateTime, minutesToDuration, isUrl } from '../../lib/utils';
import { Clock, MapPin, Users, ExternalLink, Trash2, Check, X, Pencil, Search, Plus, Video } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 }, { label: '30 min', value: 30 },
  { label: '45 min', value: 45 }, { label: '1 hour', value: 60 },
  { label: '1h 30min', value: 90 }, { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 }, { label: 'All day', value: 480 },
];

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
  const [editMode, setEditMode] = useState(false);
  const [editError, setEditError] = useState('');

  // edit form state
  const [editForm, setEditForm] = useState({
    title: '',
    purpose: '',
    location: '',
    start_time: '',
    duration_minutes: 60,
  });

  // attendee management in edit mode
  const [attendees, setAttendees] = useState<Meeting['attendees']>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [addRequired, setAddRequired] = useState<User[]>([]);
  const [addOptional, setAddOptional] = useState<User[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);

  // External Google Calendar event
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
  const canEdit = isOrganizer || user?.role === 'administrator';
  const needsResponse = event.response_status === 'pending' && !isOrganizer;

  const startEdit = () => {
    if (!meeting) return;
    setEditForm({
      title: meeting.title,
      purpose: meeting.purpose || '',
      location: meeting.location || '',
      start_time: format(new Date(meeting.start_time), "yyyy-MM-dd'T'HH:mm"),
      duration_minutes: meeting.duration_minutes,
    });
    setAttendees(meeting.attendees ? [...meeting.attendees] : []);
    setRemovedIds([]);
    setAddRequired([]);
    setAddOptional([]);
    setEditMode(true);
    setEditError('');
  };

  // Fetch users for attendee search
  useEffect(() => {
    if (!editMode || !attendeeSearch.trim()) { setSearchResults([]); return; }
    const params = new URLSearchParams({ search: attendeeSearch });
    api.get(`/api/users?${params}`).then(r => {
      const currentIds = new Set([
        ...(attendees?.map(a => a.user_id) ?? []),
        ...addRequired.map(u => u.id),
        ...addOptional.map(u => u.id),
        user?.id,
      ]);
      setSearchResults(r.data.filter((u: User) => !currentIds.has(u.id)));
    }).catch(() => {});
  }, [attendeeSearch, editMode]);

  const removeAttendee = (uid: string) => {
    setRemovedIds(prev => [...prev, uid]);
    setAttendees(prev => prev?.filter(a => a.user_id !== uid));
  };

  const addToRequired = (u: User) => {
    setAddRequired(prev => [...prev, u]);
    setSearchResults(prev => prev.filter(r => r.id !== u.id));
    setAttendeeSearch('');
  };

  const addToOptional = (u: User) => {
    setAddOptional(prev => [...prev, u]);
    setSearchResults(prev => prev.filter(r => r.id !== u.id));
    setAttendeeSearch('');
  };

  const saveEdit = async () => {
    if (!meeting) return;
    if (!editForm.title.trim()) { setEditError('Title is required'); return; }
    if (new Date(editForm.start_time) <= new Date()) {
      setEditError('Cannot reschedule to a past time (IST)');
      return;
    }
    setLoading(true);
    setEditError('');
    try {
      // Update meeting fields
      await api.put(`/api/meetings/${meeting.id}`, {
        title: editForm.title,
        purpose: editForm.purpose,
        location: editForm.location,
        start_time: new Date(editForm.start_time).toISOString(),
        duration_minutes: editForm.duration_minutes,
      });
      // Update attendees if changed
      if (removedIds.length || addRequired.length || addOptional.length) {
        await api.put(`/api/meetings/${meeting.id}/attendees`, {
          remove_ids: removedIds,
          add_required: addRequired.map(u => u.id),
          add_optional: addOptional.map(u => u.id),
        });
      }
      onRefresh();
      onClose();
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Failed to save changes');
    }
    setLoading(false);
  };

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

  // ── View mode ──────────────────────────────────────────────────────────────
  if (!editMode) {
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
              {canEdit && meeting?.status !== 'cancelled' && (
                <button onClick={startEdit} className="text-muted-foreground hover:text-white p-1 rounded hover:bg-white/10" title="Edit meeting">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatDateTime(event.start)}</span>
              {meeting && <span>· {minutesToDuration(meeting.duration_minutes)}</span>}
            </div>

            {meeting?.location && (
              isUrl(meeting.location) ? (
                <a
                  href={meeting.location}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600/15 border border-green-500/30 text-green-300 hover:bg-green-600/25 transition-colors w-fit"
                >
                  <Video className="w-4 h-4" />
                  <span className="text-sm font-medium">Join Meeting</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{meeting.location}</span>
                </div>
              )
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
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {meeting.attendees.map(att => (
                    <div key={att.id} className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                      <span className="text-xs">{att.users?.full_name || att.user_id}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] ${att.attendance_type === 'required' ? 'text-blue-400' : 'text-purple-400'}`}>
                          {att.attendance_type}
                        </span>
                        <Badge
                          variant={att.response_status === 'accepted' ? 'success' : att.response_status === 'rejected' ? 'destructive' : 'secondary'}
                          className="text-[10px] h-4"
                        >
                          {att.response_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {event.response_status && !isOrganizer && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Your response:</span>
                <Badge variant={event.response_status === 'accepted' ? 'success' : event.response_status === 'rejected' ? 'destructive' : 'warning'}>
                  {event.response_status}
                </Badge>
              </div>
            )}
          </div>

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
                  <Button size="sm" variant="destructive" className="flex-1"
                    onClick={() => respond('rejected')} disabled={!rejectionReason.trim() || loading}>
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

  // ── Edit mode ──────────────────────────────────────────────────────────────
  const endTimePreview = () => {
    try {
      return format(addMinutes(new Date(editForm.start_time), editForm.duration_minutes), 'h:mm a');
    } catch { return ''; }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Meeting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {editError && (
            <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">{editError}</div>
          )}

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Purpose</Label>
            <Textarea value={editForm.purpose} onChange={e => setEditForm(f => ({ ...f, purpose: e.target.value }))} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Location / Link</Label>
            <Input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder="Room or https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Input type="datetime-local" value={editForm.start_time}
                onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={String(editForm.duration_minutes)}
                onValueChange={v => setEditForm(f => ({ ...f, duration_minutes: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {editForm.start_time && <p className="text-xs text-muted-foreground">Ends at {endTimePreview()}</p>}
            </div>
          </div>

          {/* Attendee management */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Attendees
            </Label>

            {/* Current attendees */}
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {attendees?.map(att => (
                <div key={att.user_id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${att.attendance_type === 'required' ? 'text-blue-400' : 'text-purple-400'}`}>
                      {att.attendance_type === 'required' ? 'R' : 'O'}
                    </span>
                    <span className="text-xs text-white">{att.users?.full_name || att.user_id}</span>
                    <Badge variant={att.response_status === 'accepted' ? 'success' : att.response_status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                      {att.response_status}
                    </Badge>
                  </div>
                  {att.user_id !== user?.id && (
                    <button onClick={() => removeAttendee(att.user_id)} className="text-muted-foreground hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {/* newly added attendees */}
              {addRequired.map(u => (
                <div key={u.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-blue-400">R</span>
                    <span className="text-xs text-white">{u.full_name}</span>
                    <span className="text-[10px] text-blue-300">· new invite</span>
                  </div>
                  <button onClick={() => setAddRequired(prev => prev.filter(x => x.id !== u.id))} className="text-muted-foreground hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {addOptional.map(u => (
                <div key={u.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-purple-600/10 border border-purple-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-purple-400">O</span>
                    <span className="text-xs text-white">{u.full_name}</span>
                    <span className="text-[10px] text-purple-300">· new invite</span>
                  </div>
                  <button onClick={() => setAddOptional(prev => prev.filter(x => x.id !== u.id))} className="text-muted-foreground hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Search to add new attendees */}
            <div className="space-y-2 p-2 rounded-lg border border-white/10 bg-white/3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search to add attendees…"
                  value={attendeeSearch}
                  onChange={e => setAttendeeSearch(e.target.value)}
                  className="pl-6 h-7 text-xs"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {searchResults.map(u => (
                    <div key={u.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-white/5">
                      <div className="min-w-0">
                        <span className="text-xs text-white truncate block">{u.full_name}</span>
                        <span className="text-[10px] text-muted-foreground">{u.department}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => addToRequired(u)} className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded" title="Add as required">
                          <Plus className="w-3 h-3 inline" /> R
                        </button>
                        <button onClick={() => addToOptional(u)} className="text-[10px] text-purple-400 hover:text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded" title="Add as optional">
                          <Plus className="w-3 h-3 inline" /> O
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
          <Button onClick={saveEdit} disabled={loading}>
            {loading ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
