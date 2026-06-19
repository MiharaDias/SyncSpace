import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, CheckSquare, Bell, Plus, FolderKanban, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { formatDate, formatTime, minutesToDuration } from '../lib/utils';
import type { Meeting, Notification, Project } from '../types';
import { format, startOfDay, endOfDay } from 'date-fns';

// ── Circular Progress ─────────────────────────────────────────────────────────
function CircleProgress({ value, size = 56, stroke = 5, color = '#3b82f6' }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(value, 100)) / 100 * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 absolute">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span className="relative text-[10px] font-bold text-white z-10">{Math.round(value)}%</span>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, currentDepartment } = useAuthStore();
  const [todayMeetings, setTodayMeetings] = useState<Meeting[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number; minutes: number }[]>([]);
  const [monthsBack, setMonthsBack] = useState(0);

  useEffect(() => {
    const today = new Date();
    const start = startOfDay(today).toISOString();
    const end = endOfDay(today).toISOString();
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const deptParam = currentDepartment !== 'all' ? `&department=${currentDepartment}` : '';

    api.get(`/api/meetings?start=${start}&end=${weekEnd}`).then(r => {
      const meetings = r.data as Meeting[];
      setTodayMeetings(meetings.filter(m => m.start_time >= start && m.start_time <= end));
      setUpcomingMeetings(meetings.filter(m => m.start_time > end).slice(0, 5));
    }).catch(() => {});

    api.get('/api/notifications').then(r => {
      setNotifications(r.data.filter((n: Notification) => !n.is_read).slice(0, 5));
    }).catch(() => {});

    api.get('/api/tasks/dashboard').then(r => setTaskStats(r.data)).catch(() => {});

    // Project overview
    api.get(`/api/projects?${deptParam}`).then(r => setProjects(r.data.slice(0, 5))).catch(() => {});
    api.get(`/api/projects/analytics/overview?${deptParam}`).then(r => setOverview(r.data)).catch(() => {});
  }, [currentDepartment]);

  useEffect(() => {
    if (!user?.id) return;
    const currentYear = new Date().getFullYear();
    Promise.all([
      api.get(`/api/tasks/heatmap?user_id=${user.id}&year=${currentYear}`).catch(() => ({ data: [] })),
      api.get(`/api/tasks/heatmap?user_id=${user.id}&year=${currentYear - 1}`).catch(() => ({ data: [] })),
    ]).then(([cur, prev]) => setHeatmapData([...(cur as any).data, ...(prev as any).data]));
  }, [user?.id]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const completionPct = overview
    ? (overview.total_tasks > 0 ? Math.round((overview.completed_tasks / overview.total_tasks) * 100) : 0)
    : 0;
  const progressColor = completionPct === 100 ? '#22c55e' : completionPct > 60 ? '#3b82f6' : completionPct > 30 ? '#f59e0b' : '#6b7280';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">{greeting()}, {user?.full_name.split(' ')[0]}!</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Link to="/meetings">
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />New Meeting
          </Button>
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Clock className="w-5 h-5 text-blue-400" />} label="Today's Meetings" value={todayMeetings.length} color="blue" />
        <StatCard icon={<Bell className="w-5 h-5 text-yellow-400" />} label="Unread Alerts" value={notifications.length} color="yellow" />
        <StatCard icon={<CheckSquare className="w-5 h-5 text-green-400" />} label="Tasks Done" value={taskStats?.done ?? 0} color="green" />
        <StatCard icon={<FolderKanban className="w-5 h-5 text-purple-400" />} label="Active Projects" value={overview?.active_projects ?? 0} color="purple" />
      </div>

      {/* Today's Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />Today's Schedule
            </CardTitle>
            <Link to="/calendar" className="text-xs text-blue-400 hover:text-blue-300">View calendar →</Link>
          </div>
        </CardHeader>
        <CardContent>
          {todayMeetings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No meetings today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayMeetings.map(m => <MeetingRow key={m.id} meeting={m} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Activity Heatmap */}
      <div className="w-fit">
        <Card className="border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-0.5">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-400" />Task Activity
                </CardTitle>
                {user?.id && (() => {
                  const today = new Date();
                  const refStart = new Date(today.getFullYear(), today.getMonth() - monthsBack - 2, 1);
                  const refEnd = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 0);
                  const startStr = refStart.toISOString().slice(0, 10);
                  const endStr = refEnd.toISOString().slice(0, 10);
                  const vis = heatmapData.filter(d => d.date >= startStr && d.date <= endStr);
                  return (
                    <p className="text-xs text-muted-foreground">
                      {vis.reduce((a, d) => a + d.count, 0)} tasks · {Math.round(vis.reduce((a, d) => a + d.minutes, 0) / 60 * 10) / 10}h · {vis.filter(d => d.count > 0).length} active days
                    </p>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMonthsBack(b => b + 3)}
                  disabled={monthsBack >= 12}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="View earlier months"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground min-w-[80px] text-center">
                  {monthsBack === 0 ? 'Last 3 months' : `${monthsBack + 3}–${monthsBack + 1} months ago`}
                </span>
                <button
                  onClick={() => setMonthsBack(b => Math.max(0, b - 3))}
                  disabled={monthsBack === 0}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="View more recent months"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TaskHeatmap data={heatmapData} monthsBack={monthsBack} />
          </CardContent>
        </Card>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Upcoming Meetings + Projects */}
        <div className="lg:col-span-2 space-y-4">
          {upcomingMeetings.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Upcoming Meetings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {upcomingMeetings.map(m => <MeetingRow key={m.id} meeting={m} showDate />)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project Progress */}
          {projects.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-purple-400" />Projects
                  </CardTitle>
                  <Link to="/projects" className="text-xs text-blue-400 hover:text-blue-300">View all →</Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {projects.map(p => {
                  const pct = p.progress ?? 0;
                  const col = pct === 100 ? '#22c55e' : pct > 60 ? '#3b82f6' : pct > 30 ? '#f59e0b' : '#6b7280';
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group">
                      <CircleProgress value={pct} size={44} stroke={4} color={col} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.completed_tasks}/{p.total_tasks} tasks · {p.member_count} members
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                        {p.status.replace('_',' ')}
                      </Badge>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Overall completion */}
          {overview && overview.total_tasks > 0 && (
            <Card className="border-blue-500/20 bg-blue-600/5">
              <CardContent className="p-5 flex items-center gap-4">
                <CircleProgress value={completionPct} size={72} stroke={7} color={progressColor} />
                <div>
                  <p className="text-sm font-semibold text-white">Overall Progress</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overview.completed_tasks}/{overview.total_tasks} tasks
                  </p>
                  {overview.overdue_tasks > 0 && (
                    <p className="text-xs text-red-400 mt-1">{overview.overdue_tasks} overdue</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notifications */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="w-4 h-4 text-yellow-400" />Recent Alerts
                </CardTitle>
                <Link to="/notifications" className="text-xs text-blue-400 hover:text-blue-300">See all →</Link>
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">All caught up!</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div key={n.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-white leading-tight">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Task summary */}
          {taskStats && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-green-400" />Tasks Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Not Started', value: taskStats.not_started ?? taskStats.todo, color: 'bg-gray-500' },
                    { label: 'In Progress',  value: taskStats.in_progress,                   color: 'bg-blue-500' },
                    { label: 'Completed',    value: taskStats.done,                           color: 'bg-green-500' },
                    { label: 'High Priority',value: taskStats.high_priority,                  color: 'bg-orange-500' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${item.color}`} />
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                      </div>
                      <span className="text-sm font-medium text-white">{item.value ?? 0}</span>
                    </div>
                  ))}
                  {(taskStats.overdue ?? 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-sm text-red-400">Overdue</span>
                      <Badge variant="destructive" className="text-xs">{taskStats.overdue}</Badge>
                    </div>
                  )}
                </div>
                <Link to="/tasks" className="block mt-3 text-xs text-blue-400 hover:text-blue-300 text-center">
                  View all tasks →
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Top performer (managers/admins) */}
          {overview?.user_performance?.length > 0 && user?.role !== 'user' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />Top Performers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.user_performance.slice(0, 3).map((u: any) => (
                  <div key={u.user?.id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs text-white shrink-0 font-medium">
                      {u.user?.full_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{u.user?.full_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 bg-white/10 rounded-full h-1 overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${u.completion_rate}%` }} />
                        </div>
                        <span className="text-[10px] text-indigo-300 shrink-0">{u.completion_rate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
                <Link to="/projects" className="block text-xs text-blue-400 hover:text-blue-300 text-center mt-1">
                  Full analytics →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bgMap: Record<string, string> = {
    blue:   'bg-blue-600/10 border-blue-500/20',
    yellow: 'bg-yellow-600/10 border-yellow-500/20',
    green:  'bg-green-600/10 border-green-500/20',
    purple: 'bg-purple-600/10 border-purple-500/20',
  };
  return (
    <Card className={`${bgMap[color]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingRow({ meeting, showDate }: { meeting: Meeting; showDate?: boolean }) {
  return (
    <Link to="/meetings" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group">
      <div className="w-1 h-full min-h-[2.5rem] rounded-full bg-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{meeting.title}</p>
          {meeting.attendance_type && (
            <span className={meeting.attendance_type === 'required' ? 'badge-required' : 'badge-optional'}>
              {meeting.attendance_type === 'required' ? 'REQ' : 'OPT'}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {showDate ? formatDate(meeting.start_time, 'EEE, MMM d · ') : ''}
          {formatTime(meeting.start_time)} · {minutesToDuration(meeting.duration_minutes)}
        </p>
      </div>
      {meeting.response_status === 'pending' && (
        <Badge variant="warning" className="text-xs shrink-0">Pending</Badge>
      )}
    </Link>
  );
}

// ── Task Activity Heatmap ─────────────────────────────────────────────────────
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEVEL_COLORS = ['bg-white/5', 'bg-blue-950', 'bg-blue-800', 'bg-blue-600', 'bg-blue-400'];

function TaskHeatmap({ data, monthsBack = 0 }: {
  data: { date: string; count: number; minutes: number }[];
  monthsBack?: number;
}) {
  const map = Object.fromEntries(data.map(d => [d.date, d]));
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const level = (dateStr: string) => {
    const d = map[dateStr];
    if (!d || d.count === 0) return 0;
    const score = d.count + d.minutes / 60 * 0.5;
    if (score >= 8) return 4;
    if (score >= 4) return 3;
    if (score >= 2) return 2;
    return 1;
  };

  const tooltip = (dateStr: string) => {
    const d = map[dateStr];
    if (!d || d.count === 0) return dateStr;
    return `${dateStr}: ${d.count} task${d.count !== 1 ? 's' : ''} · ${Math.round(d.minutes / 60 * 10) / 10}h`;
  };

  // Render 3 months starting at monthsBack offset (oldest left → newest right)
  const months = [monthsBack + 2, monthsBack + 1, monthsBack].map(offset => {
    const ref = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const mi = ref.getMonth();
    const yr = ref.getFullYear();
    const daysInMonth = new Date(yr, mi + 1, 0).getDate();
    const firstDow = new Date(yr, mi, 1).getDay();
    const days = Array.from({ length: daysInMonth }, (_, i) =>
      `${yr}-${String(mi + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    );
    const cells: (string | null)[] = [...Array(firstDow).fill(null), ...days];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { name: MONTH_LABELS[mi], weeks };
  });

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-2">
          {months.map((month, mi) => (
            <div key={mi} className="flex flex-col gap-0.5">
              <p className="text-[10px] text-muted-foreground font-medium h-[14px] leading-[14px]">{month.name}</p>
              <div className="flex gap-[3px]">
                {month.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((dateStr, di) =>
                      dateStr ? (
                        <div
                          key={di}
                          title={tooltip(dateStr)}
                          className={`w-[11px] h-[11px] rounded-[2px] cursor-default transition-opacity hover:opacity-80 ${LEVEL_COLORS[level(dateStr)]} ${dateStr === todayStr ? 'ring-1 ring-white/50' : ''}`}
                        />
                      ) : (
                        <div key={di} className="w-[11px] h-[11px]" />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {LEVEL_COLORS.map((c, i) => <div key={i} className={`w-[11px] h-[11px] rounded-[2px] ${c}`} />)}
        <span>More</span>
      </div>
    </div>
  );
}
