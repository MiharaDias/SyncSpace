import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, ArrowLeft, Users, Settings, BarChart3, ListChecks,
  Pencil, Trash2, UserPlus, X,
  FolderOpen, Calendar, Lock, Building2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import api from '../../lib/api';
import type { Project, Task, User, ProjectMember, ProjectCustomStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useDepartmentsStore } from '../../lib/departments';
import { useProjectsCache } from '../../lib/projectsCache';
import { useTasksCache } from '../../lib/tasksCache';
import { formatDate, getPriorityColor } from '../../lib/utils';

// ── Circular Progress ─────────────────────────────────────────────────────────
function CircleProgress({ value, size = 64, stroke = 5, color = '#3b82f6' }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(value, 100)) / 100 * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 absolute">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span className="relative text-xs font-bold text-white z-10">{Math.round(value)}%</span>
    </div>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
const PROJECT_STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-500',
  archived:  'bg-gray-500',
  completed: 'bg-blue-500',
  on_hold:   'bg-yellow-500',
  deleted:   'bg-red-500',
};

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const pct = project.progress ?? 0;
  const progressColor = pct === 100 ? '#22c55e' : pct > 60 ? '#3b82f6' : pct > 30 ? '#f59e0b' : '#6b7280';

  return (
    <Card
      className="border-white/10 hover:border-blue-500/30 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full shrink-0 ${PROJECT_STATUS_COLORS[project.status] || 'bg-gray-500'}`} />
              <p className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                {project.name}
              </p>
            </div>
            {project.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
            )}
          </div>
          <CircleProgress value={pct} size={56} stroke={5} color={progressColor} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ListChecks className="w-3 h-3" />
            {project.completed_tasks}/{project.total_tasks} tasks
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {project.member_count} member{project.member_count !== 1 ? 's' : ''}
          </span>
        </div>

        {project.end_date && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Due {formatDate(project.end_date)}
          </p>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: progressColor }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({
  status, tasks, onTaskClick,
}: {
  status: ProjectCustomStatus;
  tasks: Task[];
  onTaskClick: (t: Task) => void;
}) {
  const isOverdue = (t: Task) =>
    t.due_date && !['completed','done'].includes((t.status || '').toLowerCase()) && new Date(t.due_date) < new Date();

  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px]">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
          <span className="text-sm font-medium text-white">{status.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {tasks.map(task => (
          <div
            key={task.id}
            onClick={() => onTaskClick(task)}
            className={`p-3 rounded-lg border cursor-pointer transition-all hover:border-white/20 ${
              isOverdue(task) ? 'border-red-500/30 bg-red-600/5' : 'border-white/10 bg-white/5'
            }`}
          >
            <p className="text-sm text-white line-clamp-2 mb-2">{task.title}</p>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}>
                {task.priority}
              </span>
              {task.due_date && (
                <span className={`text-[10px] ${isOverdue(task) ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {formatDate(task.due_date)}
                </span>
              )}
            </div>
            {task.assigned_user && (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{task.assigned_user.full_name}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Task quick-view dialog ────────────────────────────────────────────────────
function TaskQuickDialog({ task, statuses, onClose, onUpdate }: {
  task: Task; statuses: ProjectCustomStatus[]; onClose: () => void; onUpdate: () => void;
}) {
  const { user } = useAuthStore();
  const [status, setStatus] = useState(task.status || 'Not Started');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority || 'medium',
    due_date: task.due_date ? task.due_date.split('T')[0] : '',
    assigned_to: task.assigned_to || '',
    status: task.status || 'Not Started',
  });
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [timeH, setTimeH] = useState(0);
  const [timeM, setTimeM] = useState(0);

  const canEditTask = user?.role === 'administrator'
    || task.created_by === user?.id
    || user?.role === 'manager';

  const opts = statuses.length ? statuses.map(s => s.name) : ['Not Started','In Progress','Completed','On Hold','Cancelled'];
  const isCompletionStatus = (s: string) => ['completed', 'done'].includes(s.toLowerCase());
  const statusChanged = status !== (task.status || 'Not Started');

  useEffect(() => {
    api.get(`/api/tasks/${task.id}/comments`).then(r => setComments(r.data)).catch(() => {});
  }, [task.id]);

  useEffect(() => {
    if (editing) api.get('/api/users').then(r => setAllUsers(r.data)).catch(() => {});
  }, [editing]);

  const openSaveConfirm = () => { setTimeH(0); setTimeM(0); setShowConfirm(true); };

  const handleStatusSave = async () => {
    setConfirmSaving(true);
    try {
      const payload: Record<string, any> = { status };
      if (isCompletionStatus(status)) {
        const minutes = timeH * 60 + timeM;
        if (minutes > 0) payload.time_spent_minutes = minutes;
      }
      await api.put(`/api/tasks/${task.id}`, payload);
      setShowConfirm(false);
      onUpdate();
    } catch {}
    setConfirmSaving(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/api/tasks/${task.id}`, {
        ...editForm,
        due_date: editForm.due_date || undefined,
        assigned_to: editForm.assigned_to || undefined,
      });
      setEditing(false);
      onUpdate();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save');
    }
    setSaving(false);
  };

  const deleteTask = async () => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      onUpdate();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const send = async () => {
    if (!comment.trim()) return;
    setSending(true);
    await api.post(`/api/tasks/${task.id}/comments`, { content: comment }).catch(() => {});
    const res = await api.get(`/api/tasks/${task.id}/comments`).catch(() => null);
    if (res) setComments(res.data);
    setComment('');
    setSending(false);
  };

  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <DialogTitle className="text-left">
              {editing ? (
                <Input className="h-8 text-base font-semibold" value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              ) : task.title}
            </DialogTitle>
            {canEditTask && !editing && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(true)}
                  className="text-muted-foreground hover:text-white p-1 rounded transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={deleteTask}
                  className="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="space-y-3">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Description</p>
                <Textarea rows={2} className="text-sm" value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{opts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <Select value={editForm.priority} onValueChange={v => setEditForm(f => ({ ...f, priority: v as 'low' | 'medium' | 'high' | 'urgent' }))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['low','medium','high','urgent'] as const).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Assign To</p>
                  <Select value={editForm.assigned_to || '_none'} onValueChange={v => setEditForm(f => ({ ...f, assigned_to: v === '_none' ? '' : v }))}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Unassigned</SelectItem>
                      {allUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <Input type="date" className="h-8 text-xs" value={editForm.due_date}
                    onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveEdit} disabled={saving} className="h-7 text-xs">
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {opts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {statusChanged && (
                      <Button size="sm" className="h-8 shrink-0 px-3" onClick={openSaveConfirm}>Save</Button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Priority</p>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs ${getPriorityColor(task.priority)}`}>
                    {task.priority}
                  </span>
                </div>
              </div>
              {task.description && (
                <p className="text-sm text-muted-foreground bg-white/5 rounded-lg p-3">{task.description}</p>
              )}
              {task.assigned_user && (
                <p className="text-xs text-muted-foreground">Assigned: <span className="text-white">{task.assigned_user.full_name}</span></p>
              )}
            </>
          )}

          {!editing && (
            <div>
              <p className="text-xs font-medium mb-2">Comments ({comments.length})</p>
              <div className="max-h-28 overflow-y-auto space-y-1.5 mb-2">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-700 text-white text-[10px] flex items-center justify-center shrink-0">{c.user?.full_name?.[0] || '?'}</div>
                    <div className="bg-white/5 rounded px-2 py-1 flex-1">
                      <p className="text-[10px] font-medium text-white">{c.user?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input className="h-8 text-xs" placeholder="Comment…" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
                <Button size="sm" onClick={send} disabled={sending || !comment.trim()} className="h-8 text-xs px-3">Send</Button>
              </div>
            </div>
          )}
        </div>
        {!editing && <DialogFooter><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
    <Dialog open={showConfirm} onOpenChange={open => { if (!open) setShowConfirm(false); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isCompletionStatus(status) ? 'Complete Task' : 'Change Status'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Change status to <span className="text-white font-medium">"{status}"</span>?
          </p>
          {isCompletionStatus(status) && (
            <div className="space-y-2 pt-1 border-t border-white/10">
              <p className="text-xs text-muted-foreground">How long did this task take? (optional)</p>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Hours</Label>
                  <Input type="number" min={0} max={999} value={timeH}
                    onChange={e => setTimeH(Math.max(0, +e.target.value))} className="h-8" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Minutes</Label>
                  <Input type="number" min={0} max={59} value={timeM}
                    onChange={e => setTimeM(Math.max(0, Math.min(59, +e.target.value)))} className="h-8" />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button>
          <Button size="sm" onClick={handleStatusSave} disabled={confirmSaving}>
            {confirmSaving ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Create / Edit Project Dialog ──────────────────────────────────────────────
function ProjectFormDialog({
  existing, onClose, onSuccess,
}: {
  existing?: Project | null;
  onClose: () => void;
  onSuccess: (p: Project) => void;
}) {
  const { departments: allDepts, fetch: fetchDepts } = useDepartmentsStore();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    name: existing?.name || '',
    description: existing?.description || '',
    visibility: existing?.visibility || 'department',
    visibility_departments: existing?.visibility_departments || [] as string[],
    start_date: existing?.start_date || today,
    end_date: existing?.end_date || '',
    status: existing?.status || 'active',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Members-only people picker state
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const memberPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  // Search users as they type in member picker
  useEffect(() => {
    if (!memberSearch.trim() || form.visibility !== 'users') { setMemberResults([]); return; }
    const t = setTimeout(async () => {
      const res = await api.get(`/api/users?search=${encodeURIComponent(memberSearch.trim())}`).catch(() => null);
      if (res) setMemberResults(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [memberSearch, form.visibility]);

  // Click outside to close member search
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (memberPickerRef.current && !memberPickerRef.current.contains(e.target as Node)) {
        setMemberResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleDept = (d: string) =>
    setForm(f => ({
      ...f,
      visibility_departments: f.visibility_departments.includes(d)
        ? f.visibility_departments.filter(x => x !== d)
        : [...f.visibility_departments, d],
    }));

  const addMember = (u: User) => {
    if (!selectedMembers.find(m => m.id === u.id)) {
      setSelectedMembers(prev => [...prev, u]);
    }
    setMemberSearch('');
    setMemberResults([]);
  };

  const removeMemberFromPicker = (uid: string) =>
    setSelectedMembers(prev => prev.filter(m => m.id !== uid));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Project name is required'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      };
      const res = existing
        ? await api.put(`/api/projects/${existing.id}`, payload)
        : await api.post('/api/projects', payload);
      const project: Project = res.data;

      // If members-only, add selected members
      if (form.visibility === 'users' && !existing && selectedMembers.length > 0) {
        await Promise.all(
          selectedMembers.map(m =>
            api.post(`/api/projects/${project.id}/members`, { user_id: m.id, role: 'member' }).catch(() => {})
          )
        );
      }
      onSuccess(project);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save project');
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Project' : 'New Project'}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Project Name *</Label>
            <Input placeholder="e.g. Website Redesign" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={form.visibility} onValueChange={v => setForm({ ...form, visibility: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="department">By Department</SelectItem>
                  <SelectItem value="users">Members Only</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {existing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {form.visibility === 'department' && (
            <div className="space-y-2">
              <Label>Visible to Departments</Label>
              <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg border border-white/10 bg-white/5 max-h-40 overflow-y-auto">
                {allDepts.map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-blue-500 w-3.5 h-3.5"
                      checked={form.visibility_departments.includes(d)}
                      onChange={() => toggleDept(d)} />
                    <span className="text-sm text-muted-foreground">{d}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {form.visibility === 'users' && !existing && (
            <div className="space-y-2">
              <Label>Add Members</Label>
              {/* Selected chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map(m => (
                    <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/20 border border-blue-500/30 text-xs text-blue-200">
                      {m.full_name}
                      <button type="button" onClick={() => removeMemberFromPicker(m.id)}
                        className="hover:text-red-400 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative" ref={memberPickerRef}>
                <Input
                  placeholder="Search users by name or email…"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                {memberResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#1a1f2e] border border-white/15 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {memberResults
                      .filter(u => !selectedMembers.find(m => m.id === u.id))
                      .map(u => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors flex flex-col gap-0.5"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => addMember(u)}
                        >
                          <span className="text-sm text-white font-medium">{u.full_name}</span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Only selected members can access this project</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : existing ? 'Save Changes' : 'Create Project'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Task Dialog ───────────────────────────────────────────────────────────
function AddTaskDialog({
  projectId, statuses, onClose, onSuccess,
}: {
  projectId: string; statuses: ProjectCustomStatus[]; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '',
    due_date: '', priority: 'medium',
    status: statuses[0]?.name || 'Not Started',
  });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title required'); return; }
    setLoading(true);
    try {
      await api.post('/api/tasks', {
        ...form,
        project_id: projectId,
        assigned_to: form.assigned_to || undefined,
        due_date: form.due_date || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create task');
    }
    setLoading(false);
  };

  const statusOpts = statuses.length ? statuses.map(s => s.name) : ['Not Started','In Progress','Completed','On Hold','Cancelled'];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input placeholder="Task title" value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statusOpts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['low','medium','high','urgent'] as const).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={form.assigned_to || '_none'} onValueChange={v => setForm({ ...form, assigned_to: v === '_none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Unassigned</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Adding…' : 'Add Task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Project Detail View ───────────────────────────────────────────────────────
type DetailTab = 'board' | 'members' | 'analytics' | 'settings';

function ProjectDetail({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statuses, setStatuses] = useState<ProjectCustomStatus[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [tab, setTab] = useState<DetailTab>('board');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newStatus, setNewStatus] = useState({ name: '', color: '#6366f1' });
  const [addingMember, setAddingMember] = useState(false);
  // Member search state
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<User[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const memberSearchRef = useRef<HTMLDivElement>(null);

  const { fetchDetail, invalidateDetail, invalidateList: invalidateProjectList } = useProjectsCache();
  const { invalidate: invalidateTasks } = useTasksCache();

  const load = useCallback(async () => {
    try {
      const data = await fetchDetail(projectId);
      setProject(data.project);
      setTasks(data.tasks);
      setStatuses(data.statuses);
      setMembers(data.members);
    } catch { }
  }, [projectId, fetchDetail]);

  // Search members as user types
  useEffect(() => {
    if (!memberSearch.trim() || selectedMemberId) {
      if (!memberSearch.trim()) setMemberSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/users?search=${encodeURIComponent(memberSearch.trim())}`);
        setMemberSearchResults(res.data);
      } catch { setMemberSearchResults([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [memberSearch, selectedMemberId]);

  // Click-outside to close member search dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (memberSearchRef.current && !memberSearchRef.current.contains(e.target as Node)) {
        setMemberSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab === 'analytics') {
      api.get(`/api/projects/${projectId}/analytics`)
        .then(r => setAnalytics(r.data)).catch(() => {});
    }
  }, [tab, projectId]);

  if (!project) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm">Loading project…</p>
      </div>
    </div>
  );

  // Compute edit permission: admin always, manager only if they created it
  const isCreator = project.creator_id === user?.id;
  const canEdit = user?.role === 'administrator' || (user?.role === 'manager' && isCreator);

  // Tasks grouped by status
  const tasksByStatus: Record<string, Task[]> = {};
  statuses.forEach(s => { tasksByStatus[s.name] = []; });
  tasks.forEach(t => {
    const bucket = t.status && tasksByStatus[t.status] ? t.status : (statuses[0]?.name || 'Not Started');
    if (!tasksByStatus[bucket]) tasksByStatus[bucket] = [];
    tasksByStatus[bucket].push(t);
  });

  const addMember = async () => {
    if (!selectedMemberId) return;
    await api.post(`/api/projects/${projectId}/members`, { user_id: selectedMemberId, role: 'member' }).catch(() => {});
    setSelectedMemberId('');
    setMemberSearch('');
    setMemberSearchResults([]);
    setAddingMember(false);
    invalidateDetail(projectId);
    load();
  };

  const removeMember = async (uid: string) => {
    await api.delete(`/api/projects/${projectId}/members/${uid}`).catch(() => {});
    invalidateDetail(projectId);
    load();
  };

  const addCustomStatus = async () => {
    if (!newStatus.name.trim()) return;
    await api.post(`/api/projects/${projectId}/statuses`, newStatus).catch(() => {});
    setNewStatus({ name: '', color: '#6366f1' });
    invalidateDetail(projectId);
    load();
  };

  const deleteStatus = async (sid: string) => {
    await api.delete(`/api/projects/${projectId}/statuses/${sid}`).catch(() => {});
    invalidateDetail(projectId);
    load();
  };

  const deleteProject = async () => {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    await api.delete(`/api/projects/${projectId}`).catch(() => {});
    invalidateProjectList();
    onBack();
  };

  const tabs: { key: DetailTab; label: string; icon: React.ElementType }[] = [
    { key: 'board',     label: 'Board',     icon: ListChecks },
    { key: 'members',   label: 'Members',   icon: Users },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    ...(canEdit ? [{ key: 'settings' as DetailTab, label: 'Settings', icon: Settings }] : []),
  ];

  const pct = project.progress ?? 0;
  const progressColor = pct === 100 ? '#22c55e' : pct > 60 ? '#3b82f6' : pct > 30 ? '#f59e0b' : '#6b7280';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="text-muted-foreground hover:text-white transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-white">{project.name}</h2>
            <Badge variant="secondary" className="capitalize">{project.status.replace('_', ' ')}</Badge>
            {project.visibility === 'private' && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
            {project.visibility === 'department' && <Building2 className="w-3.5 h-3.5 text-muted-foreground" />}
            {project.visibility === 'users' && <Users className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <CircleProgress value={pct} size={60} stroke={5} color={progressColor} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Tasks', value: project.total_tasks },
          { label: 'Completed',   value: project.completed_tasks },
          { label: 'Members',     value: project.member_count },
          { label: 'Progress',    value: `${pct}%` },
          ...(project.end_date ? [{ label: 'Deadline', value: formatDate(project.end_date) }] : []),
        ].map(s => (
          <Card key={s.label} className="border-white/10">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold text-white mt-0.5">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-500 text-white'
                : 'border-transparent text-muted-foreground hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* BOARD TAB */}
      {tab === 'board' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddTask(true)}>
              <Plus className="w-3.5 h-3.5" />Add Task
            </Button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3">
            {statuses.map(s => (
              <KanbanColumn
                key={s.id}
                status={s}
                tasks={tasksByStatus[s.name] || []}
                onTaskClick={setSelectedTask}
              />
            ))}
            {statuses.length === 0 && tasks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {tasks.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    className="p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:border-white/20 transition-all"
                  >
                    <p className="text-sm text-white">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MEMBERS TAB */}
      {tab === 'members' && (
        <div className="space-y-4 max-w-xl">
          {canEdit && (
            <div className="flex gap-2">
              {addingMember ? (
                <div className="flex-1 space-y-2" ref={memberSearchRef}>
                  <div className="relative">
                    <Input
                      autoFocus
                      placeholder="Search by name or email…"
                      value={memberSearch}
                      onChange={e => { setMemberSearch(e.target.value); setSelectedMemberId(''); }}
                      className="h-8 text-sm"
                    />
                    {memberSearchResults.length > 0 && !selectedMemberId && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[#1a1f2e] border border-white/15 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                        {memberSearchResults
                          .filter(u => !members.find(m => m.user_id === u.id))
                          .map(u => (
                            <button
                              key={u.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors flex flex-col gap-0.5"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setSelectedMemberId(u.id);
                                setMemberSearch(u.full_name);
                                setMemberSearchResults([]);
                              }}
                            >
                              <span className="text-sm text-white font-medium">{u.full_name}</span>
                              <span className="text-xs text-muted-foreground">{u.email}</span>
                            </button>
                          ))}
                        {memberSearchResults.every(u => members.find(m => m.user_id === u.id)) && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">All matching users are already members</p>
                        )}
                      </div>
                    )}
                    {memberSearch && !memberSearchResults.length && !selectedMemberId && (
                      <p className="absolute top-full left-0 mt-1 text-xs text-muted-foreground px-1">No users found</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addMember} disabled={!selectedMemberId}>Add Member</Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setAddingMember(false); setMemberSearch(''); setSelectedMemberId(''); setMemberSearchResults([]);
                    }}>
                      <X className="w-3.5 h-3.5 mr-1" />Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddingMember(true)}>
                  <UserPlus className="w-3.5 h-3.5" />Add Member
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            {members.map(m => {
              const memberUser = (m as any).users || { full_name: 'Unknown', email: '' };
              return (
                <Card key={m.id} className="border-white/10">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{memberUser.full_name}</p>
                      <p className="text-xs text-muted-foreground">{memberUser.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={m.role === 'manager' ? 'default' : 'secondary'} className="capitalize">
                        {m.role}
                      </Badge>
                      {canEdit && m.user_id !== project.creator_id && (
                        <button onClick={() => removeMember(m.user_id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && analytics && (
        <div className="space-y-6 max-w-2xl">
          {/* Progress overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: analytics.total, color: 'text-white' },
              { label: 'Completed', value: analytics.completed, color: 'text-green-400' },
              { label: 'In Progress', value: analytics.in_progress, color: 'text-blue-400' },
              { label: 'Overdue', value: analytics.overdue, color: 'text-red-400' },
            ].map(s => (
              <Card key={s.label} className="border-white/10">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Progress circle big */}
          <Card className="border-white/10">
            <CardContent className="p-6 flex items-center gap-6">
              <CircleProgress value={analytics.progress} size={100} stroke={8} color={progressColor} />
              <div>
                <p className="text-lg font-bold text-white">{analytics.progress}% Complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {analytics.completed} of {analytics.total} tasks completed
                </p>
                {analytics.overdue > 0 && (
                  <p className="text-sm text-red-400 mt-1">{analytics.overdue} tasks overdue</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status breakdown */}
          {analytics.status_breakdown && Object.keys(analytics.status_breakdown).length > 0 && (
            <Card className="border-white/10">
              <CardHeader className="pb-3"><CardTitle className="text-sm">By Status</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(analytics.status_breakdown).map(([s, count]) => {
                  const pctS = analytics.total > 0 ? ((count as number) / analytics.total) * 100 : 0;
                  const st = statuses.find(x => x.name === s);
                  return (
                    <div key={s} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{s}</span>
                        <span className="text-white font-medium">{count as number}</span>
                      </div>
                      <div className="bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pctS}%`, backgroundColor: st?.color || '#6366f1' }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Member performance */}
          {analytics.member_stats?.length > 0 && (
            <Card className="border-white/10">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Member Performance</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {analytics.member_stats.map((m: any) => (
                  <div key={m.user?.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-xs text-white shrink-0">
                      {m.user?.full_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white font-medium truncate">{m.user?.full_name || 'Unknown'}</span>
                        <span className="text-muted-foreground shrink-0">{m.completed}/{m.assigned}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${m.completion_rate}%` }} />
                        </div>
                        <span className="text-xs text-blue-300 shrink-0">{m.completion_rate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === 'settings' && canEdit && (
        <div className="space-y-6 max-w-xl">
          {/* Edit project */}
          <Card className="border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Project Details</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                  onClick={() => setShowEditProject(true)}>
                  <Pencil className="w-3 h-3" />Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="text-white font-medium">{project.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Visibility</span>
                <span className="text-white capitalize">{project.visibility}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="text-white capitalize">{project.status.replace('_', ' ')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Custom statuses */}
          <Card className="border-white/10">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Custom Statuses</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {statuses.map(s => (
                <div key={s.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-white">{s.name}</span>
                  </div>
                  <button onClick={() => deleteStatus(s.id)} className="text-muted-foreground hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 items-center border-t border-white/10 pt-3">
                <input type="color" value={newStatus.color}
                  onChange={e => setNewStatus(s => ({ ...s, color: e.target.value }))}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
                <Input placeholder="New status name…" value={newStatus.name}
                  onChange={e => setNewStatus(s => ({ ...s, name: e.target.value }))}
                  className="flex-1 h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && addCustomStatus()} />
                <Button size="sm" variant="outline" onClick={addCustomStatus}
                  disabled={!newStatus.name.trim()} className="h-8 text-xs px-3">
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-red-500/20">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-red-400">Danger Zone</CardTitle></CardHeader>
            <CardContent>
              <Button variant="destructive" size="sm" onClick={deleteProject} className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />Delete Project
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      {showAddTask && (
        <AddTaskDialog
          projectId={projectId}
          statuses={statuses}
          onClose={() => setShowAddTask(false)}
          onSuccess={() => { setShowAddTask(false); invalidateDetail(projectId); invalidateTasks(); load(); }}
        />
      )}
      {showEditProject && (
        <ProjectFormDialog
          existing={project}
          onClose={() => setShowEditProject(false)}
          onSuccess={updated => { setProject(updated); setShowEditProject(false); invalidateDetail(projectId); invalidateProjectList(); load(); }}
        />
      )}
      {selectedTask && (
        <TaskQuickDialog
          task={selectedTask}
          statuses={statuses}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); invalidateDetail(projectId); invalidateTasks(); load(); }}
        />
      )}
    </div>
  );
}

// ── Main Projects Page ────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { projectId: paramProjectId } = useParams();
  const navigate = useNavigate();
  const { user, currentDepartment } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const canCreate = user?.role === 'administrator' || user?.role === 'manager';

  const { fetchList, invalidateList } = useProjectsCache();
  const { invalidate: invalidateAllTasks } = useTasksCache();

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const { projects, overview } = await fetchList(currentDepartment || '');
      setProjects(projects);
      setOverview(overview);
    } catch { }
    setLoading(false);
  }, [currentDepartment, fetchList]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // If URL has projectId, show detail view
  if (paramProjectId) {
    return <ProjectDetail projectId={paramProjectId} onBack={() => navigate('/projects')} />;
  }

  const filtered = projects.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Projects</h2>
          <p className="text-sm text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
            {currentDepartment !== 'all' && ` · ${currentDepartment}`}
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />New Project
          </Button>
        )}
      </div>

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Projects',    value: overview.total_projects,           color: 'text-white' },
            { label: 'Active',            value: overview.active_projects,          color: 'text-green-400' },
            { label: 'Total Tasks',       value: overview.total_tasks,              color: 'text-white' },
            { label: 'Completed Tasks',   value: overview.completed_tasks,          color: 'text-blue-400' },
            { label: 'Overall Progress',  value: `${overview.overall_completion_rate}%`, color: 'text-purple-400' },
          ].map(s => (
            <Card key={s.label} className="border-white/10">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-xl font-bold ${s.color} mt-1`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User performance (managers/admins) */}
      {overview?.user_performance?.length > 0 && user?.role !== 'user' && (
        <Card className="border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              Team Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {overview.user_performance.slice(0, 6).map((u: any) => (
                <div key={u.user?.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center text-sm text-white font-medium shrink-0">
                    {u.user?.full_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.user?.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${u.completion_rate}%` }} />
                      </div>
                      <span className="text-xs text-blue-300 shrink-0">{u.completion_rate}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{u.completed}/{u.assigned} tasks</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search projects…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-[220px]"
        />
        <div className="flex gap-1">
          {(['all','active','on_hold','completed','archived'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border capitalize ${
                statusFilter === s
                  ? 'bg-blue-600/30 border-blue-500/40 text-white'
                  : 'border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <Card key={i} className="border-white/10 animate-pulse">
              <CardContent className="p-5 h-36" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search || statusFilter !== 'all' ? 'No matching projects' : 'No projects yet'}</p>
          {canCreate && !search && (
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />Create First Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <ProjectFormDialog
          onClose={() => setShowCreate(false)}
          onSuccess={newProj => {
            setShowCreate(false);
            invalidateList();
            invalidateAllTasks();
            navigate(`/projects/${newProj.id}`);
          }}
        />
      )}
    </div>
  );
}
