import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Building2, Shield, CheckSquare, Clock, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import api from '../../lib/api';
import { formatDateTime } from '../../lib/utils';

// ── Heatmap (3-month view) ────────────────────────────────────────────────────
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEVEL_COLORS = ['bg-white/5', 'bg-blue-950', 'bg-blue-800', 'bg-blue-600', 'bg-blue-400'];

function Mini3MonthHeatmap({ userId }: { userId: string }) {
  const [data, setData] = useState<{ date: string; count: number; minutes: number }[]>([]);

  useEffect(() => {
    const year = new Date().getFullYear();
    api.get(`/api/tasks/heatmap?user_id=${userId}&year=${year}`)
      .then(r => setData(r.data)).catch(() => {});
  }, [userId]);

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

  // Last 3 months
  const months = [2, 1, 0].map(offset => {
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

  const totalCompleted = data.reduce((a, d) => a + d.count, 0);
  const totalMinutes = data.reduce((a, d) => a + d.minutes, 0);
  const activeDays = data.filter(d => d.count > 0).length;

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <span>{totalCompleted} tasks completed this year</span>
        <span>·</span>
        <span>{Math.round(totalMinutes / 60 * 10) / 10}h logged</span>
        <span>·</span>
        <span>{activeDays} active days</span>
      </div>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    api.get(`/api/admin/users/${userId}`)
      .then(r => setDetail(r.data))
      .catch(() => navigate('/admin?tab=users'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!detail) return null;

  const depts: string[] = detail.departments?.length ? detail.departments : detail.department ? [detail.department] : [];

  const roleColor = (r: string) => {
    if (r === 'administrator') return 'bg-red-600/20 text-red-300 border-red-500/30';
    if (r === 'manager') return 'bg-blue-600/20 text-blue-300 border-blue-500/30';
    return 'bg-white/10 text-muted-foreground border-white/10';
  };

  const auditLabel = (action: string) => {
    if (action === 'status_changed') return 'Status changed';
    if (action === 'assigned') return 'Task assigned';
    if (action === 'created') return 'Task created';
    return action.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back */}
      <button onClick={() => navigate('/admin?tab=users')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to Users
      </button>

      {/* Profile card */}
      <Card className="border-white/10">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center text-xl font-bold text-white shrink-0">
              {detail.full_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white">{detail.full_name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${roleColor(detail.role)}`}>
                  {detail.role}
                </span>
                {!detail.is_approved && <Badge variant="warning" className="text-xs">Pending</Badge>}
                {!detail.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
              </div>

              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{detail.email}</span>
                {detail.username && <span className="flex items-center gap-2"><User className="w-3.5 h-3.5" />@{detail.username}</span>}
                <span className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />Joined {new Date(detail.created_at).toLocaleDateString()}
                </span>
              </div>

              {depts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  {depts.map(d => (
                    <span key={d} className="text-xs bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full">{d}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Task stats */}
            {detail.task_stats && (
              <div className="flex gap-4 shrink-0 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{detail.task_stats.total}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-400">{detail.task_stats.completed}</p>
                  <p className="text-[10px] text-muted-foreground">Done</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">{detail.task_stats.total_hours}h</p>
                  <p className="text-[10px] text-muted-foreground">Logged</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Task Activity */}
      <Card className="border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-400" />Task Activity (last 3 months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Mini3MonthHeatmap userId={userId!} />
        </CardContent>
      </Card>

      {/* Recent audit log */}
      {detail.recent_audit?.length > 0 && (
        <Card className="border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {detail.recent_audit.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-white">{auditLabel(log.action)}</span>
                      {log.task?.title && (
                        <span className="text-xs text-muted-foreground truncate">· {log.task.title}</span>
                      )}
                    </div>
                    {log.old_value && log.new_value && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {log.old_value} → {log.new_value}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" size="sm" onClick={() => navigate('/admin?tab=users')}>
        <ArrowLeft className="w-4 h-4 mr-2" />Back to Users
      </Button>
    </div>
  );
}
