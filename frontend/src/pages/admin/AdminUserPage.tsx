import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Mail, Building2, Shield, CheckSquare, Clock,
  Calendar, AlertTriangle, FolderKanban, Save, X, ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import api from '../../lib/api';
import { formatDate, formatDateTime, getPriorityColor } from '../../lib/utils';
import { useDepartmentsStore } from '../../lib/departments';

// ── Mini heatmap ──────────────────────────────────────────────────────────────
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEVEL_COLORS = ['bg-white/5', 'bg-blue-950', 'bg-blue-800', 'bg-blue-600', 'bg-blue-400'];

function Mini3MonthHeatmap({ userId }: { userId: string }) {
  const [data, setData] = useState<{ date: string; count: number; minutes: number }[]>([]);

  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.all([
      api.get(`/api/tasks/heatmap?user_id=${userId}&year=${year}`).catch(() => ({ data: [] })),
      api.get(`/api/tasks/heatmap?user_id=${userId}&year=${year - 1}`).catch(() => ({ data: [] })),
    ]).then(([cur, prev]) => setData([...(cur as any).data, ...(prev as any).data]));
  }, [userId]);

  const map = Object.fromEntries(data.map(d => [d.date, d]));
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const level = (dateStr: string) => {
    const d = map[dateStr];
    if (!d || d.count === 0) return 0;
    const score = d.count + d.minutes / 60 * 0.5;
    if (score >= 8) return 4; if (score >= 4) return 3; if (score >= 2) return 2; return 1;
  };

  const tooltip = (dateStr: string) => {
    const d = map[dateStr];
    if (!d || d.count === 0) return dateStr;
    return `${dateStr}: ${d.count} task${d.count !== 1 ? 's' : ''} · ${Math.round(d.minutes / 60 * 10) / 10}h`;
  };

  const months = [2, 1, 0].map(offset => {
    const ref = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const mi = ref.getMonth(); const yr = ref.getFullYear();
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
        <div className="flex gap-4 min-w-max pb-1">
          {months.map((month, mi) => (
            <div key={mi} className="flex flex-col gap-0.5">
              <p className="text-[10px] text-muted-foreground font-medium h-[14px]">{month.name}</p>
              <div className="flex gap-[3px]">
                {month.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((dateStr, di) =>
                      dateStr ? (
                        <div key={di} title={tooltip(dateStr)}
                          className={`w-[11px] h-[11px] rounded-[2px] cursor-default ${LEVEL_COLORS[level(dateStr)]} ${dateStr === todayStr ? 'ring-1 ring-white/50' : ''}`} />
                      ) : <div key={di} className="w-[11px] h-[11px]" />
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

// ── Status colors ─────────────────────────────────────────────────────────────
function taskStatusColor(s: string) {
  const l = s.toLowerCase();
  if (l.includes('complet') || l === 'done') return 'bg-green-600/20 text-green-400 border-green-500/30';
  if (l.includes('progress')) return 'bg-blue-600/20 text-blue-400 border-blue-500/30';
  if (l.includes('hold')) return 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30';
  if (l.includes('cancel')) return 'bg-red-600/20 text-red-400 border-red-500/30';
  return 'bg-white/10 text-muted-foreground border-white/10';
}

// ── Circular progress ─────────────────────────────────────────────────────────
function CircleProgress({ value, size = 44, stroke = 4, color = '#3b82f6' }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(value, 100)) / 100 * circ;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 absolute">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 0.4s ease' }} />
      </svg>
      <span className="relative text-[10px] font-bold text-white z-10">{Math.round(value)}%</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { departments: allDepts, fetch: fetchDepts } = useDepartmentsStore();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'projects' | 'audit'>('overview');

  // Edit state
  const [editRole, setEditRole] = useState('');
  const [editDepts, setEditDepts] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showDeptPicker, setShowDeptPicker] = useState(false);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  const load = () => {
    if (!userId) return;
    api.get(`/api/admin/users/${userId}`)
      .then(r => {
        setDetail(r.data);
        setEditRole(r.data.role);
        setEditDepts(r.data.departments?.length ? r.data.departments : r.data.department ? [r.data.department] : []);
        setEditActive(r.data.is_active);
      })
      .catch(() => navigate('/admin?tab=users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await api.put(`/api/admin/users/${userId}`, {
        role: editRole,
        departments: editDepts,
        is_active: editActive,
      });
      setSaveMsg('Saved');
      load();
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e: any) {
      setSaveMsg(e.response?.data?.error || 'Failed to save');
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">Loading…</div>
  );
  if (!detail) return null;

  const hasChanges = editRole !== detail.role
    || JSON.stringify(editDepts) !== JSON.stringify(detail.departments?.length ? detail.departments : detail.department ? [detail.department] : [])
    || editActive !== detail.is_active;

  const roleColor = (r: string) => {
    if (r === 'administrator') return 'bg-red-600/20 text-red-300 border-red-500/30';
    if (r === 'manager') return 'bg-blue-600/20 text-blue-300 border-blue-500/30';
    return 'bg-white/10 text-muted-foreground border-white/10';
  };

  const auditLabel = (action: string) => {
    const map: Record<string, string> = {
      status_changed: 'Status changed', assigned: 'Task assigned', created: 'Task created',
      admin_updated: 'Admin updated', completed: 'Task completed',
    };
    return map[action] || action.replace(/_/g, ' ');
  };

  const stats = detail.task_stats || {};
  const tasks: any[] = detail.assigned_tasks || [];
  const projects: any[] = detail.projects || [];
  const auditLog: any[] = detail.audit_log || [];

  const completedTasks = tasks.filter((t: any) => t.completed_at);
  const pendingTasks = tasks.filter((t: any) => !t.completed_at);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: `Tasks (${tasks.length})` },
    { key: 'projects', label: `Projects (${projects.length})` },
    { key: 'audit', label: `Activity (${auditLog.length})` },
  ] as const;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back */}
      <button onClick={() => navigate('/admin?tab=users')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to Users
      </button>

      {/* Profile header */}
      <Card className="border-white/10">
        <CardContent className="p-5">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-2xl font-bold text-white shrink-0">
              {detail.full_name?.[0]?.toUpperCase() || '?'}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white">{detail.full_name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${roleColor(detail.role)}`}>{detail.role}</span>
                {!detail.is_approved && <Badge variant="warning" className="text-xs">Pending Approval</Badge>}
                {!detail.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{detail.email}</span>
                {detail.username && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />@{detail.username}</span>}
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {new Date(detail.created_at).toLocaleDateString()}</span>
              </div>
              {(detail.departments?.length || detail.department) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  {(detail.departments?.length ? detail.departments : [detail.department]).map((d: string) => (
                    <span key={d} className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-muted-foreground">{d}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex gap-5 shrink-0">
              {[
                { label: 'Assigned', value: stats.total ?? 0, color: 'text-white' },
                { label: 'Completed', value: stats.completed ?? 0, color: 'text-green-400' },
                { label: 'Overdue', value: stats.overdue ?? 0, color: 'text-red-400' },
                { label: 'Hours', value: `${stats.total_hours ?? 0}h`, color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-blue-500 text-white'
                : 'border-transparent text-muted-foreground hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Edit user */}
          <Card className="border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />Edit User
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Role */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <Select value={editRole} onValueChange={setEditRole}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="administrator">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Active status */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Account Status</Label>
                  <Select value={editActive ? 'active' : 'inactive'} onValueChange={v => setEditActive(v === 'active')}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Department picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Departments</Label>
                  <div className="relative">
                    <button
                      onClick={() => setShowDeptPicker(v => !v)}
                      className="w-full h-8 px-3 flex items-center justify-between rounded-md border border-white/10 bg-transparent text-sm text-left hover:border-white/20 transition-colors"
                    >
                      <span className="truncate text-xs text-muted-foreground">
                        {editDepts.length > 0 ? editDepts.join(', ') : 'None selected'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
                    </button>
                    {showDeptPicker && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#0f1629] border border-white/15 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {allDepts.map(d => (
                          <label key={d} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer">
                            <input type="checkbox" className="accent-blue-500"
                              checked={editDepts.includes(d)}
                              onChange={e => setEditDepts(prev =>
                                e.target.checked ? [...prev, d] : prev.filter(x => x !== d)
                              )} />
                            <span className="text-sm text-white">{d}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Selected dept chips */}
              {editDepts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editDepts.map(d => (
                    <span key={d} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-200">
                      {d}
                      <button onClick={() => setEditDepts(prev => prev.filter(x => x !== d))} className="hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges} className="gap-1.5">
                  <Save className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save Changes'}
                </Button>
                {saveMsg && (
                  <span className={`text-xs ${saveMsg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card className="border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-400" />Task Activity — Last 3 Months
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Mini3MonthHeatmap userId={userId!} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TASKS TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No tasks assigned to this user.</p>
          ) : (
            <>
              {pendingTasks.length > 0 && (
                <Card className="border-white/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400" />Pending ({pendingTasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pendingTasks.map((t: any) => {
                        const now = new Date().toISOString().slice(0, 10);
                        const overdue = t.due_date && t.due_date.slice(0, 10) < now;
                        return (
                          <div key={t.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${overdue ? 'border-red-500/20 bg-red-600/5' : 'border-white/5 bg-white/5'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{t.title}</p>
                              {t.project?.name && <p className="text-xs text-blue-400 mt-0.5">{t.project.name}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {t.due_date && (
                                <span className={`text-xs flex items-center gap-0.5 ${overdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                                  {overdue && <AlertTriangle className="w-3 h-3" />}
                                  {formatDate(t.due_date)}
                                </span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${taskStatusColor(t.status || '')}`}>{t.status}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getPriorityColor(t.priority)}`}>{t.priority}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {completedTasks.length > 0 && (
                <Card className="border-white/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-green-400" />Completed ({completedTasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {completedTasks.map((t: any) => (
                        <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/5 bg-white/5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/70 line-through truncate">{t.title}</p>
                            {t.project?.name && <p className="text-xs text-blue-400/70 mt-0.5">{t.project.name}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                            {t.time_spent_minutes > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />{Math.round(t.time_spent_minutes / 60 * 10) / 10}h
                              </span>
                            )}
                            {t.completed_at && <span>{formatDate(t.completed_at)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PROJECTS TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'projects' && (
        <div className="space-y-3">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">This user is not a member of any projects.</p>
          ) : (
            projects.map((p: any) => {
              const pct = p.progress ?? 0;
              const col = pct === 100 ? '#22c55e' : pct > 60 ? '#3b82f6' : pct > 30 ? '#f59e0b' : '#6b7280';
              return (
                <Card key={p.id} className="border-white/10">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <CircleProgress value={pct} size={48} stroke={4} color={col} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-white">{p.name}</p>
                          <Badge variant="secondary" className="text-[10px] capitalize">{p.status?.replace('_', ' ')}</Badge>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30 capitalize">{p.member_role}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: col }} />
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {p.completed_tasks}/{p.total_tasks} tasks
                          </span>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/projects/${p.id}`)}
                        className="text-xs text-blue-400 hover:text-blue-300 shrink-0">
                        View →
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── AUDIT TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <Card className="border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />Activity Log ({auditLog.length} entries)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No activity logged yet.</p>
            ) : (
              <div className="space-y-0">
                {auditLog.map((log: any, idx: number) => (
                  <div key={log.id || idx} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                    <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                      log.action === 'admin_updated' ? 'bg-yellow-400' :
                      log.action === 'status_changed' ? 'bg-blue-400' :
                      log.action === 'assigned' ? 'bg-green-400' : 'bg-purple-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-medium text-white">{auditLabel(log.action)}</span>
                          {log.task?.title && (
                            <span className="text-xs text-muted-foreground ml-1.5 truncate">· {log.task.title}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(log.created_at)}</span>
                      </div>
                      {(log.old_value || log.new_value) && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {log.old_value && log.new_value ? `${log.old_value} → ${log.new_value}` : log.new_value || log.old_value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Button variant="outline" size="sm" onClick={() => navigate('/admin?tab=users')}>
        <ArrowLeft className="w-4 h-4 mr-2" />Back to Users
      </Button>
    </div>
  );
}
