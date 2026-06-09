import { useEffect, useState, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, BarChart3, Users, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import api from '../../lib/api';
import type { User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { parseISO, isSameDay, getHours, getMinutes } from 'date-fns';

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];

export default function ManagerPage() {
  const { user } = useAuthStore();
  const [deptUsers, setDeptUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [teamEvents, setTeamEvents] = useState<any[]>([]);
  const [weekDate, setWeekDate] = useState(new Date());
  const [meetingStats, setMeetingStats] = useState<any[]>([]);
  const [taskOverview, setTaskOverview] = useState<any>(null);
  const [department, setDepartment] = useState(user?.department || '');
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    api.get('/api/users/departments').then(r => setDepartments(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!department) return;
    api.get(`/api/manager/department-users?department=${department}`).then(r => {
      setDeptUsers(r.data);
    }).catch(() => {});
    api.get(`/api/manager/meeting-stats?department=${department}`).then(r => {
      setMeetingStats(r.data);
    }).catch(() => {});
    api.get(`/api/manager/task-overview?department=${department}`).then(r => {
      setTaskOverview(r.data);
    }).catch(() => {});
  }, [department]);

  const fetchTeamCalendar = useCallback(async () => {
    if (selectedUsers.size === 0) return;
    const ws = startOfWeek(weekDate, { weekStartsOn: 0 });
    const we = endOfWeek(weekDate, { weekStartsOn: 0 });
    const ids = Array.from(selectedUsers).join('&user_ids=');
    try {
      const res = await api.get(`/api/manager/team-calendar?user_ids=${ids}&start=${ws.toISOString()}&end=${we.toISOString()}`);
      setTeamEvents(res.data);
    } catch { }
  }, [selectedUsers, weekDate]);

  useEffect(() => { fetchTeamCalendar(); }, [fetchTeamCalendar]);

  const toggleUser = (uid: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const userColorMap: Record<string, string> = {};
  Array.from(selectedUsers).forEach((uid, i) => { userColorMap[uid] = COLORS[i % COLORS.length]; });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(weekDate, { weekStartsOn: 0 }), i));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Team Overview</h2>
        <p className="text-sm text-muted-foreground">Monitor team schedules and performance</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Select department" /></SelectTrigger>
          <SelectContent>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar"><Calendar className="w-4 h-4 mr-1.5" />Team Calendar</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="w-4 h-4 mr-1.5" />Meeting Stats</TabsTrigger>
          <TabsTrigger value="tasks"><Users className="w-4 h-4 mr-1.5" />Task Overview</TabsTrigger>
        </TabsList>

        {/* Team Calendar */}
        <TabsContent value="calendar" className="mt-4">
          <div className="grid lg:grid-cols-4 gap-4">
            {/* User selector */}
            <Card className="border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Team Members</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deptUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1.5 rounded-lg">
                    <Checkbox checked={selectedUsers.has(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[Array.from(selectedUsers).indexOf(u.id) % COLORS.length] || '#64748b' }} />
                    <span className="text-sm text-white flex-1">{u.full_name}</span>
                  </label>
                ))}
              </CardContent>
            </Card>

            {/* Calendar */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" onClick={() => setWeekDate(w => subWeeks(w, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <p className="text-sm font-medium">
                  {format(startOfWeek(weekDate, { weekStartsOn: 0 }), 'MMM d')} – {format(endOfWeek(weekDate, { weekStartsOn: 0 }), 'MMM d, yyyy')}
                </p>
                <Button variant="ghost" size="icon" onClick={() => setWeekDate(w => addWeeks(w, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="border border-white/10 rounded-xl overflow-hidden">
                <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                  <div className="border-b border-white/10" />
                  {weekDays.map(d => (
                    <div key={d.toISOString()} className="border-b border-l border-white/10 py-2 text-center">
                      <p className="text-xs text-muted-foreground">{format(d, 'EEE')}</p>
                      <p className={`text-sm font-medium mx-auto w-7 h-7 flex items-center justify-center rounded-full ${isSameDay(d, new Date()) ? 'bg-blue-600 text-white' : 'text-white'}`}>
                        {format(d, 'd')}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                  <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                    <div>
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="h-12 border-b border-white/5 flex items-start justify-end pr-2 pt-1">
                          <span className="text-[10px] text-muted-foreground">{h === 0 ? '' : format(new Date().setHours(h, 0), 'h a')}</span>
                        </div>
                      ))}
                    </div>
                    {weekDays.map(day => (
                      <div key={day.toISOString()} className="relative border-l border-white/10">
                        {Array.from({ length: 24 }, (_, h) => (
                          <div key={h} className="h-12 border-b border-white/5" />
                        ))}
                        {teamEvents
                          .filter(e => isSameDay(parseISO(e.start), day))
                          .map((ev, i) => {
                            const startH = getHours(parseISO(ev.start));
                            const startM = getMinutes(parseISO(ev.start));
                            const endH = getHours(parseISO(ev.end));
                            const endM = getMinutes(parseISO(ev.end));
                            const top = (startH * 60 + startM) / 60 * 48;
                            const height = Math.max(((endH * 60 + endM) - (startH * 60 + startM)) / 60 * 48, 16);
                            const color = userColorMap[ev.user_id] || '#64748b';
                            return (
                              <div key={`${ev.id}-${i}`}
                                className="absolute left-0.5 right-0.5 rounded px-1 z-10 overflow-hidden"
                                style={{ top, height, backgroundColor: color + '33', borderLeft: `2px solid ${color}` }}>
                                <p className="text-[10px] text-white truncate">{ev.title}</p>
                                <p className="text-[9px]" style={{ color }}>{ev.user_name}</p>
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Meeting Stats */}
        <TabsContent value="stats" className="mt-4">
          <div className="space-y-3">
            {meetingStats.map(s => (
              <Card key={s.user.id} className="border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{s.user.full_name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-muted-foreground">Total: {s.total_invitations}</span>
                        <span className="text-xs text-green-400">✓ {s.accepted} accepted</span>
                        <span className="text-xs text-red-400">✗ {s.rejected} declined</span>
                        <span className="text-xs text-yellow-400">⏳ {s.pending} pending</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${s.rejection_rate > 30 ? 'text-red-400' : s.rejection_rate > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {s.rejection_rate}%
                      </p>
                      <p className="text-xs text-muted-foreground">rejection rate</p>
                      {s.rejection_rate > 30 && <Badge variant="destructive" className="text-xs mt-1">High rejection</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Task Overview */}
        <TabsContent value="tasks" className="mt-4">
          {taskOverview && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Total', value: taskOverview.total, color: 'text-white' },
                { label: 'To Do', value: taskOverview.todo, color: 'text-gray-400' },
                { label: 'In Progress', value: taskOverview.in_progress, color: 'text-blue-400' },
                { label: 'Done', value: taskOverview.done, color: 'text-green-400' },
                { label: 'Overdue', value: taskOverview.overdue, color: 'text-red-400' },
              ].map(s => (
                <Card key={s.label} className="border-white/10">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-3xl font-bold ${s.color} mt-1`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
