import { useEffect, useState } from 'react';
import { Plus, Clock, MapPin, Users, Check, X, ExternalLink, Tag } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Card, CardContent } from '../../components/ui/card';
import api from '../../lib/api';
import type { Meeting } from '../../types';
import { formatDateTime, minutesToDuration, isUrl } from '../../lib/utils';
import NewMeetingDialog from '../../components/meetings/NewMeetingDialog';
import { useAuthStore } from '../../store/authStore';

export default function MeetingsPage() {
  const { user } = useAuthStore();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [respondMeeting, setRespondMeeting] = useState<Meeting | null>(null);
  const [response, setResponse] = useState<'accepted' | 'rejected' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [search, setSearch] = useState('');

  const fetchMeetings = async () => {
    try {
      const res = await api.get('/api/meetings');
      setMeetings(res.data);
    } catch { }
  };

  useEffect(() => { fetchMeetings(); }, []);

  const submitResponse = async () => {
    if (!respondMeeting || !response) return;
    if (response === 'rejected' && !rejectionReason.trim()) return;
    try {
      await api.post(`/api/meetings/${respondMeeting.id}/respond`, {
        response,
        rejection_reason: rejectionReason,
      });
      setRespondMeeting(null);
      setResponse(null);
      setRejectionReason('');
      fetchMeetings();
    } catch { }
  };

  const cancelMeeting = async (meetingId: string) => {
    if (!confirm('Cancel this meeting?')) return;
    try {
      await api.delete(`/api/meetings/${meetingId}`);
      fetchMeetings();
    } catch { }
  };

  const filtered = meetings.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  const pending = filtered.filter(m => m.response_status === 'pending' && m.user_role === 'attendee');
  const upcoming = filtered.filter(m => m.status === 'active' && new Date(m.start_time) >= new Date());
  const past = filtered.filter(m => new Date(m.end_time) < new Date() && m.status === 'active');
  const cancelled = filtered.filter(m => m.status === 'cancelled');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Meetings</h2>
          <p className="text-sm text-muted-foreground mt-1">{upcoming.length} upcoming · {pending.length} pending response</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" />New Meeting
        </Button>
      </div>

      <Input placeholder="Search meetings..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full sm:max-w-sm" />

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming {upcoming.length > 0 && `(${upcoming.length})`}</TabsTrigger>
          <TabsTrigger value="pending" className={pending.length > 0 ? 'relative' : ''}>
            Pending {pending.length > 0 && <span className="ml-1 w-4 h-4 bg-orange-500 text-white text-[10px] rounded-full flex items-center justify-center inline-flex">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <MeetingList meetings={upcoming} onRespond={(m: Meeting) => setRespondMeeting(m)} onCancel={cancelMeeting} currentUserId={user?.id} />
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          <MeetingList meetings={pending} onRespond={(m: Meeting) => setRespondMeeting(m)} onCancel={cancelMeeting} currentUserId={user?.id} />
        </TabsContent>
        <TabsContent value="past" className="mt-4">
          <MeetingList meetings={past} onRespond={(m: Meeting) => setRespondMeeting(m)} onCancel={cancelMeeting} currentUserId={user?.id} />
        </TabsContent>
        <TabsContent value="cancelled" className="mt-4">
          <MeetingList meetings={cancelled} onRespond={() => {}} onCancel={() => {}} currentUserId={user?.id} />
        </TabsContent>
      </Tabs>

      {showNew && (
        <NewMeetingDialog open={showNew} onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); fetchMeetings(); }} />
      )}

      {/* Response Dialog */}
      {respondMeeting && (
        <Dialog open onOpenChange={() => { setRespondMeeting(null); setResponse(null); setRejectionReason(''); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Respond to Meeting</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-white/5">
                <p className="font-medium text-white">{respondMeeting.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{formatDateTime(respondMeeting.start_time)}</p>
                {respondMeeting.attendance_type && (
                  <span className={`mt-2 inline-block ${respondMeeting.attendance_type === 'required' ? 'badge-required' : 'badge-optional'}`}>
                    {respondMeeting.attendance_type === 'required' ? 'REQUIRED MEETING' : 'OPTIONAL MEETING'}
                  </span>
                )}
              </div>
              {!response ? (
                <div className="flex gap-3">
                  <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-500" onClick={() => setResponse('accepted')}>
                    <Check className="w-4 h-4" />Accept
                  </Button>
                  <Button variant="destructive" className="flex-1 gap-2" onClick={() => setResponse('rejected')}>
                    <X className="w-4 h-4" />Decline
                  </Button>
                </div>
              ) : response === 'rejected' ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Reason for declining (required):</p>
                  <Textarea rows={3} placeholder="Please provide a reason..."
                    value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="destructive" className="flex-1" onClick={submitResponse}
                      disabled={!rejectionReason.trim()}>Confirm Decline</Button>
                    <Button variant="ghost" onClick={() => setResponse(null)}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-green-400">Accepting this meeting...</p>
                  <Button className="w-full bg-green-600 hover:bg-green-500" onClick={submitResponse}>Confirm Accept</Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MeetingList({ meetings, onRespond, onCancel, currentUserId }: any) {
  if (meetings.length === 0) {
    return <div className="text-center py-12 text-muted-foreground"><Clock className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No meetings</p></div>;
  }

  return (
    <div className="space-y-3">
      {meetings.map((m: Meeting) => (
        <MeetingCard key={m.id} meeting={m} onRespond={onRespond} onCancel={onCancel} currentUserId={currentUserId} />
      ))}
    </div>
  );
}

function MeetingCard({ meeting, onRespond, onCancel, currentUserId }: any) {
  const [details, setDetails] = useState<Meeting | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadDetails = async () => {
    if (!expanded) {
      try {
        const res = await api.get(`/api/meetings/${meeting.id}`);
        setDetails(res.data);
      } catch { }
    }
    setExpanded(!expanded);
  };

  const isOrganizer = meeting.organizer_id === currentUserId;

  return (
    <Card className={`border-white/10 transition-all ${meeting.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0" onClick={loadDetails} style={{ cursor: 'pointer' }}>
            <div className={`w-1 h-full min-h-[3rem] rounded-full shrink-0 ${meeting.status === 'cancelled' ? 'bg-gray-500' : meeting.response_status === 'accepted' ? 'bg-green-500' : meeting.response_status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-white">{meeting.title}</p>
                {meeting.attendance_type && (
                  <span className={meeting.attendance_type === 'required' ? 'badge-required' : 'badge-optional'}>
                    {meeting.attendance_type === 'required' ? 'REQUIRED' : 'OPTIONAL'}
                  </span>
                )}
                {meeting.status === 'cancelled' && <Badge variant="destructive" className="text-xs">Cancelled</Badge>}
                {isOrganizer && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-300">Organizer</Badge>}
                {meeting.recurrence_type !== 'none' && <Badge variant="secondary" className="text-xs">↻ {meeting.recurrence_type}</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(meeting.start_time)} · {minutesToDuration(meeting.duration_minutes)}
                </span>
                {meeting.location && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {isUrl(meeting.location) ? (
                      <a href={meeting.location} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        className="text-blue-400 hover:underline flex items-center gap-1">
                        Join <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : meeting.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            {meeting.response_status === 'pending' && !isOrganizer && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onRespond(meeting)}>
                Respond
              </Button>
            )}
            {meeting.response_status && (
              <Badge variant={meeting.response_status === 'accepted' ? 'success' : meeting.response_status === 'rejected' ? 'destructive' : 'warning'} className="text-xs">
                {meeting.response_status}
              </Badge>
            )}
            {isOrganizer && meeting.status === 'active' && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300" onClick={() => onCancel(meeting.id)}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && details && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
            {details.purpose && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Purpose</p>
                <p className="text-sm text-foreground">{details.purpose}</p>
              </div>
            )}
            {details.attendees && details.attendees.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                  <Users className="w-3 h-3" />Attendees ({details.attendees.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {details.attendees.map(att => (
                    <div key={att.id} className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs">
                      <span className="truncate">{att.users?.full_name}</span>
                      <Badge variant={att.response_status === 'accepted' ? 'success' : att.response_status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] h-4 ml-1">
                        {att.response_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {details.task_links && details.task_links.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                  <Tag className="w-3 h-3" />Linked Tasks ({details.task_links.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {details.task_links.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs">
                      <span className="truncate">{t.title}</span>
                      <Badge variant={t.status === 'done' ? 'success' : t.status === 'in_progress' ? 'default' : 'secondary'} className="text-[10px] h-4 ml-1">
                        {t.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
