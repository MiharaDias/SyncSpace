import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, CheckSquare, Bell, Plus, FolderKanban, BarChart3, Building2 } from 'lucide-react';
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
  const { user, currentDepartment, setCurrentDepartment } = useAuthStore();
  const [todayMeetings, setTodayMeetings] = useState<Meeting[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [overview, setOverview] = useState<any>(null);
  // Build the department options for this user
  const userDepts: string[] = user?.departments?.length
    ? user.departments
    : user?.department ? [user.department] : [];
  const deptOptions: string[] = [];
  if (user?.role === 'administrator' || userDepts.length > 1) deptOptions.push('all');
  deptOptions.push(...userDepts);
  const canSwitch = deptOptions.length > 1;

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
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div>
            <h2 className="text-2xl font-bold text-white">{greeting()}, {user?.full_name.split(' ')[0]}!</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>

          {/* ── Department context ──────────────────────────────────────── */}
          {userDepts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="w-3.5 h-3.5" />
                <span>Viewing:</span>
              </div>

              {canSwitch ? (
                /* Multi-dept: clickable chips */
                deptOptions.map(d => (
                  <button
                    key={d}
                    onClick={() => setCurrentDepartment(d)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      currentDepartment === d
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/30'
                        : 'border-white/10 text-muted-foreground hover:border-blue-500/40 hover:text-white bg-white/5'
                    }`}
                  >
                    {d === 'all' ? 'All Departments' : d}
                  </button>
                ))
              ) : (
                /* Single-dept: static badge */
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-600/20 border border-blue-500/30 text-blue-200">
                  {currentDepartment === 'all' ? 'All Departments' : currentDepartment}
                </span>
              )}
            </div>
          )}
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

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Schedule + Projects */}
        <div className="lg:col-span-2 space-y-4">
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
