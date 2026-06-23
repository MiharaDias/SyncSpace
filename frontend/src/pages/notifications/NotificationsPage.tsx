import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellOff, Check, CheckCheck, Search, Calendar,
  CheckSquare, FolderKanban, UserPlus, Clock, X, Video, ExternalLink,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import api from '../../lib/api';
import type { CalendarEvent, Notification } from '../../types';
import { formatDateTime, isUrl } from '../../lib/utils';
import EventDetailModal from '../../components/calendar/EventDetailModal';

// ── Types ──────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'unread' | 'tasks' | 'projects' | 'meetings' | 'assignments' | 'overdue';

const FILTERS: { key: FilterKey; label: string; icon: React.ElementType }[] = [
  { key: 'all',         label: 'All',         icon: BellOff    },
  { key: 'unread',      label: 'Unread',      icon: Check      },
  { key: 'meetings',    label: 'Meetings',    icon: Calendar   },
  { key: 'tasks',       label: 'Tasks',       icon: CheckSquare },
  { key: 'projects',    label: 'Projects',    icon: FolderKanban },
  { key: 'assignments', label: 'Assignments', icon: UserPlus   },
];

const typeConfig: Record<string, { color: string; label: string }> = {
  meeting_invite:    { color: 'bg-blue-500',    label: 'Invite'       },
  meeting_update:    { color: 'bg-yellow-500',  label: 'Update'       },
  meeting_cancelled: { color: 'bg-red-500',     label: 'Cancelled'    },
  response_accepted: { color: 'bg-green-500',   label: 'Accepted'     },
  response_rejected: { color: 'bg-red-500',     label: 'Declined'     },
  task_assigned:     { color: 'bg-purple-500',  label: 'Task'         },
  project_assigned:  { color: 'bg-indigo-500',  label: 'Project'      },
  approval_status:   { color: 'bg-emerald-500', label: 'Approval'     },
  user_registration: { color: 'bg-orange-500',  label: 'Registration' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [responding, setResponding] = useState<string | null>(null);
  const [meetingModal, setMeetingModal] = useState<CalendarEvent | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState<string | null>(null);

  const openMeetingModal = async (meetingId: string, notifId: string) => {
    setLoadingMeeting(notifId);
    try {
      const res = await api.get(`/api/meetings/${meetingId}`);
      const m = res.data;
      const calEvent: CalendarEvent = {
        id: m.id,
        type: 'meeting',
        title: m.title,
        start: m.start_time,
        end: m.end_time,
        color: '#3b82f6',
        role: m.user_role,
        attendance_type: m.attendance_type,
        response_status: m.response_status,
        raw: m,
      };
      setMeetingModal(calEvent);
    } catch {
      navigate('/meetings');
    }
    setLoadingMeeting(null);
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);

    switch (n.type) {
      case 'user_registration':
        navigate('/admin?tab=approvals');
        break;
      case 'task_assigned':
        navigate('/tasks');
        break;
      case 'meeting_invite':
      case 'meeting_update':
      case 'meeting_cancelled':
      case 'response_accepted':
      case 'response_rejected':
        if (n.reference_id) {
          openMeetingModal(n.reference_id, n.id);
        } else {
          navigate('/meetings');
        }
        break;
      case 'project_assigned':
        if (n.reference_id && n.reference_type === 'project') {
          navigate(`/projects/${n.reference_id}`);
        } else {
          navigate('/projects');
        }
        break;
      case 'approval_status':
        navigate('/dashboard');
        break;
      default:
        if (n.reference_type === 'task') navigate('/tasks');
        else if (n.reference_type === 'meeting' && n.reference_id) openMeetingModal(n.reference_id, n.id);
        else if (n.reference_type === 'project') navigate(n.reference_id ? `/projects/${n.reference_id}` : '/projects');
        break;
    }
  };

  const fetchNotifications = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filter !== 'all') params.set('filter', filter);
      const res = await api.get(`/api/notifications?${params}`);
      setNotifications(res.data);
    } catch { }
  };

  useEffect(() => { fetchNotifications(); }, [search, filter]);

  const markRead = async (id: string) => {
    await api.put(`/api/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    await api.put('/api/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const meetingRespond = async (notifId: string, response: 'accepted' | 'rejected') => {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif?.meeting) return;
    setResponding(notifId);
    try {
      await api.post(`/api/notifications/${notifId}/meeting-response`, { response });
      // Update local state
      setNotifications(prev => prev.map(n =>
        n.id === notifId
          ? { ...n, is_read: true, meeting: n.meeting ? { ...n.meeting, my_response: response } : undefined }
          : n
      ));
    } catch { }
    setResponding(null);
  };

  const unread = notifications.filter(n => !n.is_read);

  // Client-side filter for display (backend also filters, but re-filter for instant UI)
  const displayed = notifications.filter(n => {
    const matchSearch = !search
      || n.title.toLowerCase().includes(search.toLowerCase())
      || n.message.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  return (
    <div className="space-y-5 max-w-2xl">
      {meetingModal && (
        <EventDetailModal
          event={meetingModal}
          onClose={() => setMeetingModal(null)}
          onRefresh={() => { setMeetingModal(null); fetchNotifications(); }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            {unread.length} unread · {notifications.length} total
          </p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4" />Mark All Read
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search notifications…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              filter === key
                ? 'bg-blue-600/30 border-blue-500/40 text-white'
                : 'border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
            }`}
          >
            {label}
            {key === 'unread' && unread.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {unread.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BellOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search || filter !== 'all' ? 'No matching notifications' : 'No notifications yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(n => {
            const config = typeConfig[n.type] || { color: 'bg-gray-500', label: n.type };
            const isMeetingInvite = n.type === 'meeting_invite' && n.meeting;
            const responded = n.meeting?.my_response && n.meeting.my_response !== 'pending';

            return (
              <Card
                key={n.id}
                onClick={() => loadingMeeting !== n.id && handleNotificationClick(n)}
                className={`border-white/10 transition-all cursor-pointer hover:border-white/25 ${n.is_read ? 'opacity-60' : 'border-blue-500/20 bg-blue-600/5'} ${loadingMeeting === n.id ? 'opacity-50 cursor-wait' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-white">{n.title}</p>
                            <Badge variant="secondary" className="text-[10px] h-4">{config.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                          {n.meeting && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-xs text-blue-300 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(n.meeting.start_time).toLocaleString()} – {new Date(n.meeting.end_time).toLocaleTimeString()}
                              </p>
                              {n.meeting.location && isUrl(n.meeting.location) && (
                                <a
                                  href={n.meeting.location}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-xs text-green-400 flex items-center gap-1 hover:underline w-fit"
                                >
                                  <Video className="w-3 h-3" />
                                  Join Meeting
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                              {n.meeting.location && !isUrl(n.meeting.location) && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  📍 {n.meeting.location}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(n.created_at)}
                          </p>
                          {!n.is_read && (
                            <button
                              onClick={e => { e.stopPropagation(); markRead(n.id); }}
                              className="text-blue-400 hover:text-blue-300"
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline meeting accept/reject */}
                      {isMeetingInvite && n.meeting?.status !== 'cancelled' && (
                        <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
                          {responded ? (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              n.meeting!.my_response === 'accepted'
                                ? 'bg-green-600/20 text-green-400'
                                : 'bg-red-600/20 text-red-400'
                            }`}>
                              {n.meeting!.my_response === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                            </span>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-3 text-xs bg-green-600/10 border-green-500/30 text-green-400 hover:bg-green-600/20"
                                onClick={() => meetingRespond(n.id, 'accepted')}
                                disabled={responding === n.id}
                              >
                                {responding === n.id ? '…' : 'Accept'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-3 text-xs bg-red-600/10 border-red-500/30 text-red-400 hover:bg-red-600/20"
                                onClick={() => meetingRespond(n.id, 'rejected')}
                                disabled={responding === n.id}
                              >
                                {responding === n.id ? '…' : 'Decline'}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
