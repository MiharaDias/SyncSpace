import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronRight, ListChecks, Calendar, Flag, CheckCircle2, Clock, LayoutGrid, List } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import api from '../../lib/api';
import type { Task, User, Project, SubDeadline, ProjectCustomStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useTasksCache } from '../../lib/tasksCache';
import { formatDate, getPriorityColor } from '../../lib/utils';
import { Link } from 'react-router-dom';

const PRIORITY_LIST = ['low', 'medium', 'high', 'urgent'] as const;

// ── Circular progress ─────────────────────────────────────────────────────────
function MiniProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={pct === 100 ? 'text-green-400' : 'text-blue-300'}>{pct}%</span>
    </span>
  );
}

// ── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const isOverdue = task.due_date && task.status?.toLowerCase() !== 'completed' && task.status?.toLowerCase() !== 'done'
    && new Date(task.due_date) < new Date();

  const statusColor = (s: string) => {
    const l = s.toLowerCase();
    if (l.includes('complet') || l === 'done') return 'bg-green-600/20 text-green-400 border-green-500/30';
    if (l.includes('progress')) return 'bg-blue-600/20 text-blue-400 border-blue-500/30';
    if (l.includes('hold')) return 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30';
    if (l.includes('cancel')) return 'bg-red-600/20 text-red-400 border-red-500/30';
    return 'bg-white/10 text-muted-foreground border-white/10';
  };

  return (
    <Card
      className={`border-white/10 cursor-pointer hover:border-blue-500/30 transition-all ${isOverdue ? 'border-red-500/30' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-white line-clamp-2 flex-1">{task.title}</p>
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusColor(task.status || '')}`}>
            {task.status}
          </span>
        </div>

        {task.project && (
          <p className="text-[11px] text-blue-400 flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />{task.project.name}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
          {task.due_date && (
            <span className={`text-xs flex items-center gap-0.5 ${isOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
              <Calendar className="w-3 h-3" />{formatDate(task.due_date)}
            </span>
          )}
        </div>

        {(task.sub_deadline_count ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ListChecks className="w-3 h-3" />
            <span>{task.sub_deadline_done}/{task.sub_deadline_count} sub-tasks</span>
          </div>
        )}

        {task.assigned_user && (
          <p className="text-xs text-muted-foreground truncate">{task.assigned_user.full_name}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState({ status: '', priority: '', project_id: '' });

  const { fetchTasks: fetchTasksCache, invalidate: invalidateTasksCache } = useTasksCache();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [dragging, setDragging] = useState<Task | null>(null);
  const draggingRef = useRef<Task | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ task: Task; newStatus: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchTasks = async () => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.priority) params.set('priority', filter.priority);
    if (filter.project_id) params.set('project_id', filter.project_id);
    const filterKey = params.toString();
    try {
      const data = await fetchTasksCache(filterKey, params.toString());
      setTasks(data.tasks);
      setDashboard(data.dashboard);
      setProjects(data.projects);
    } catch { }
  };

  useEffect(() => { fetchTasks(); }, [filter]);

  const filteredTasks = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const [boardTimeH, setBoardTimeH] = useState(0);
  const [boardTimeM, setBoardTimeM] = useState(0);
  const boardIsCompletion = pendingMove
    ? ['completed', 'done'].includes(pendingMove.newStatus.toLowerCase())
    : false;

  const confirmMove = async () => {
    if (!pendingMove) return;
    setConfirming(true);
    try {
      const payload: Record<string, any> = { status: pendingMove.newStatus };
      if (boardIsCompletion) {
        const minutes = boardTimeH * 60 + boardTimeM;
        if (minutes > 0) payload.time_spent_minutes = minutes;
      }
      await api.put(`/api/tasks/${pendingMove.task.id}`, payload);
      invalidateTasksCache();
      await fetchTasks();
    } catch { }
    setConfirming(false);
    setPendingMove(null);
    setBoardTimeH(0); setBoardTimeM(0);
  };

  // Board columns: standard order + any custom statuses found in tasks
  const STANDARD_STATUSES = ['not started', 'to do', 'in progress', 'on hold', 'done', 'completed', 'cancelled'];
  const taskStatuses = Array.from(new Set(filteredTasks.map(t => t.status?.toLowerCase() || 'not started')));
  const boardStatuses = [
    ...STANDARD_STATUSES.filter(s => taskStatuses.includes(s)),
    ...taskStatuses.filter(s => !STANDARD_STATUSES.includes(s)),
  ];
  if (boardStatuses.length === 0) boardStatuses.push('not started', 'in progress', 'done');

  const statusLabel = (s: string) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const columnColor = (s: string) => {
    const l = s.toLowerCase();
    if (l.includes('complet') || l === 'done') return 'border-green-500/40';
    if (l.includes('progress')) return 'border-blue-500/40';
    if (l.includes('hold')) return 'border-yellow-500/40';
    if (l.includes('cancel')) return 'border-red-500/40';
    return 'border-white/10';
  };

  // Group by project for better UX
  const tasksByProject: Record<string, Task[]> = {};
  const noProjectTasks: Task[] = [];
  filteredTasks.forEach(t => {
    if (t.project_id) {
      if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = [];
      tasksByProject[t.project_id].push(t);
    } else {
      noProjectTasks.push(t);
    }
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">My Tasks</h2>
          <p className="text-sm text-muted-foreground">{filteredTasks.length} tasks across {projects.length} projects</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
            >
              <List className="w-4 h-4" />List
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'board' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
            >
              <LayoutGrid className="w-4 h-4" />Board
            </button>
          </div>
          <Link to="/projects">
            <Button variant="outline" size="sm" className="gap-2">
              View Projects
            </Button>
          </Link>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />New Task
          </Button>
        </div>
      </div>

      {/* Stats */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Not Started', value: dashboard.not_started ?? dashboard.todo, color: 'text-gray-400', icon: Clock },
            { label: 'In Progress',  value: dashboard.in_progress, color: 'text-blue-400',  icon: Flag },
            { label: 'Completed',    value: dashboard.done,        color: 'text-green-400', icon: CheckCircle2 },
            { label: 'Overdue',      value: dashboard.overdue,     color: 'text-red-400',   icon: Calendar },
          ].map(s => (
            <Card key={s.label} className="border-white/10">
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color} mt-0.5`}>{s.value ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-[200px]"
        />
        <Select value={filter.project_id || '_all'} onValueChange={v => setFilter(f => ({ ...f, project_id: v === '_all' ? '' : v }))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.priority || '_all'} onValueChange={v => setFilter(f => ({ ...f, priority: v === '_all' ? '' : v }))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Priority</SelectItem>
            {PRIORITY_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Board view */}
      {viewMode === 'board' && (
        filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tasks found</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />Create Task
            </Button>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {boardStatuses.map(status => {
              const colTasks = filteredTasks.filter(t => (t.status?.toLowerCase() || 'not started') === status);
              const isOver = dragOver === status;
              return (
                <div
                  key={status}
                  className={`flex-shrink-0 w-72 rounded-xl border bg-white/3 transition-colors ${columnColor(status)} ${isOver ? 'bg-white/8 ring-1 ring-blue-500/40' : ''}`}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(status); }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(null);
                    const dropped = draggingRef.current;
                    draggingRef.current = null;
                    setDragging(null);
                    if (dropped && (dropped.status?.toLowerCase() || 'not started') !== status) {
                      setPendingMove({ task: dropped, newStatus: status });
                    }
                  }}
                >
                  <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{statusLabel(status)}</span>
                    <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                  </div>
                  <div className="p-2 space-y-2 min-h-[80px]">
                    {colTasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', task.id);
                          draggingRef.current = task;
                          setTimeout(() => setDragging(task), 0);
                        }}
                        onDragEnd={() => { draggingRef.current = null; setDragging(null); setDragOver(null); }}
                        onSelectStart={e => e.preventDefault()}
                        style={{ WebkitUserDrag: 'element', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties}
                        className={`cursor-grab active:cursor-grabbing transition-opacity ${dragging?.id === task.id ? 'opacity-40' : ''}`}
                      >
                        <TaskCard task={task} onClick={() => { if (!dragging) setSelectedTask(task); }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* List view grouped by project */}
      {viewMode === 'list' && (
        filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tasks found</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />Create Task
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(tasksByProject).map(([projectId, ptasks]) => {
              const project = projects.find(p => p.id === projectId) || ptasks[0]?.project;
              const done = ptasks.filter(t => ['completed','done'].includes(t.status?.toLowerCase())).length;
              return (
                <div key={projectId}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/projects/${projectId}`} className="text-sm font-semibold text-white hover:text-blue-300 transition-colors">
                        {project?.name || 'Unknown Project'}
                      </Link>
                      <Badge variant="secondary" className="text-xs">{ptasks.length}</Badge>
                    </div>
                    <MiniProgress done={done} total={ptasks.length} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {ptasks.map(task => (
                      <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                    ))}
                  </div>
                </div>
              );
            })}

            {noProjectTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-semibold text-muted-foreground">General Tasks</p>
                  <Badge variant="secondary" className="text-xs">{noProjectTasks.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {noProjectTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Dialogs */}
      {showCreate && (
        <CreateTaskDialog
          projects={projects}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); invalidateTasksCache(); fetchTasks(); }}
        />
      )}
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); invalidateTasksCache(); fetchTasks(); }}
        />
      )}

      {/* Drag & drop confirmation */}
      <Dialog open={!!pendingMove} onOpenChange={open => {
        if (!open) { setPendingMove(null); setBoardTimeH(0); setBoardTimeM(0); }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{boardIsCompletion ? 'Complete Task' : 'Move Task'}</DialogTitle>
          </DialogHeader>
          {pendingMove && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Move <span className="text-white font-medium">"{pendingMove.task.title}"</span> to{' '}
                <span className="text-white font-medium">{statusLabel(pendingMove.newStatus)}</span>?
              </p>
              {boardIsCompletion && (
                <div className="space-y-2 pt-1 border-t border-white/10">
                  <p className="text-xs text-muted-foreground">How long did this task take? (optional)</p>
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Hours</Label>
                      <Input type="number" min={0} max={999} value={boardTimeH}
                        onChange={e => setBoardTimeH(Math.max(0, +e.target.value))} className="h-8" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Minutes</Label>
                      <Input type="number" min={0} max={59} value={boardTimeM}
                        onChange={e => setBoardTimeM(Math.max(0, Math.min(59, +e.target.value)))} className="h-8" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPendingMove(null); setBoardTimeH(0); setBoardTimeM(0); }}>Cancel</Button>
            <Button size="sm" onClick={confirmMove} disabled={confirming}>
              {confirming ? 'Moving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Create Task Dialog ────────────────────────────────────────────────────────
function CreateTaskDialog({
  projects, onClose, onSuccess, defaultProjectId,
}: {
  projects: Project[];
  onClose: () => void;
  onSuccess: () => void;
  defaultProjectId?: string;
}) {
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '',
    due_date: '', priority: 'medium', project_id: defaultProjectId || '',
    status: 'Not Started',
  });
  const [users, setUsers] = useState<User[]>([]);
  const [statuses, setStatuses] = useState<ProjectCustomStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subDeadlines, setSubDeadlines] = useState<{ title: string; due_date: string }[]>([]);

  useEffect(() => {
    api.get('/api/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.project_id) {
      api.get(`/api/projects/${form.project_id}/statuses`)
        .then(r => { setStatuses(r.data); if (r.data[0]) setForm(f => ({ ...f, status: r.data[0].name })); })
        .catch(() => {});
    }
  }, [form.project_id]);

  const addSub = () => setSubDeadlines(prev => [...prev, { title: '', due_date: '' }]);
  const removeSub = (i: number) => setSubDeadlines(prev => prev.filter((_, idx) => idx !== i));
  const updateSub = (i: number, field: string, val: string) =>
    setSubDeadlines(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (user?.role === 'user' && !form.project_id) {
      setError('Please select a project'); return;
    }
    setLoading(true);
    try {
      await api.post('/api/tasks', {
        ...form,
        assigned_to: form.assigned_to || undefined,
        due_date: form.due_date || undefined,
        project_id: form.project_id || undefined,
        sub_deadlines: subDeadlines.filter(s => s.title && s.due_date),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create task');
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-red-400 px-1">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input placeholder="Task title" value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} placeholder="Details…" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Project {user?.role === 'user' ? '*' : ''}</Label>
              <Select value={form.project_id || '_none'} onValueChange={v => setForm({ ...form, project_id: v === '_none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {user?.role !== 'user' && <SelectItem value="_none">No project</SelectItem>}
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.length > 0
                    ? statuses.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)
                    : ['Not Started','In Progress','Completed','On Hold','Cancelled'].map(s =>
                        <SelectItem key={s} value={s}>{s}</SelectItem>)
                  }
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
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>

          {/* Sub-deadlines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sub-deadlines</Label>
              <button type="button" onClick={addSub} className="text-xs text-blue-400 hover:text-blue-300">
                + Add sub-deadline
              </button>
            </div>
            {subDeadlines.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input placeholder="Sub-task title" value={s.title}
                  onChange={e => updateSub(i, 'title', e.target.value)} className="flex-1" />
                <Input type="date" value={s.due_date}
                  onChange={e => updateSub(i, 'due_date', e.target.value)} className="w-36" />
                <button type="button" onClick={() => removeSub(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create Task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Task Detail Dialog ────────────────────────────────────────────────────────
function TaskDetailDialog({
  task, onClose, onUpdate,
}: {
  task: Task; onClose: () => void; onUpdate: () => void;
}) {
  const [status, setStatus] = useState(task.status || 'Not Started');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [subDeadlines, setSubDeadlines] = useState<SubDeadline[]>(task.sub_deadlines || []);
  const [statuses, setStatuses] = useState<ProjectCustomStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSub, setNewSub] = useState({ title: '', due_date: '' });
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [timeH, setTimeH] = useState(0);
  const [timeM, setTimeM] = useState(0);

  useEffect(() => {
    api.get(`/api/tasks/${task.id}/comments`).then(r => setComments(r.data)).catch(() => {});
    api.get(`/api/tasks/${task.id}/audit`).then(r => setAuditLog(r.data)).catch(() => {});
    if (task.project_id) {
      api.get(`/api/projects/${task.project_id}/statuses`)
        .then(r => setStatuses(r.data)).catch(() => {});
    }
  }, [task.id, task.project_id]);

  const isCompletionStatus = (s: string) => ['completed', 'done'].includes(s.toLowerCase());

  const updateStatus = async (newStatus: string) => {
    if (isCompletionStatus(newStatus)) {
      setTimeH(0); setTimeM(0);
      setPendingStatus(newStatus);
    } else {
      setStatus(newStatus);
      await api.put(`/api/tasks/${task.id}`, { status: newStatus }).catch(() => {});
    }
  };

  const confirmWithTime = async (skip = false) => {
    if (!pendingStatus) return;
    const minutes = skip ? 0 : timeH * 60 + timeM;
    setStatus(pendingStatus);
    setPendingStatus(null);
    const payload: Record<string, any> = { status: pendingStatus };
    if (minutes > 0) payload.time_spent_minutes = minutes;
    await api.put(`/api/tasks/${task.id}`, payload).catch(() => {});
    onUpdate();
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setLoading(true);
    try {
      await api.post(`/api/tasks/${task.id}/comments`, { content: comment });
      const res = await api.get(`/api/tasks/${task.id}/comments`);
      setComments(res.data);
      setComment('');
    } catch { }
    setLoading(false);
  };

  const toggleSub = async (sub: SubDeadline) => {
    await api.put(`/api/tasks/${task.id}/sub-deadlines/${sub.id}`, {
      is_completed: !sub.is_completed,
    }).catch(() => {});
    setSubDeadlines(prev => prev.map(s => s.id === sub.id ? { ...s, is_completed: !s.is_completed } : s));
  };

  const addSubDeadline = async () => {
    if (!newSub.title || !newSub.due_date) return;
    const res = await api.post(`/api/tasks/${task.id}/sub-deadlines`, newSub).catch(() => null);
    if (res?.data) {
      setSubDeadlines(prev => [...prev, res.data]);
      setNewSub({ title: '', due_date: '' });
    }
  };

  const isOverdue = task.due_date && !['completed','done'].includes(status?.toLowerCase()) && new Date(task.due_date) < new Date();
  const statusOptions = statuses.length > 0
    ? statuses.map(s => s.name)
    : ['Not Started','In Progress','Completed','On Hold','Cancelled'];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left pr-8">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select value={pendingStatus || status} onValueChange={updateStatus}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Priority</p>
              <span className={`inline-block px-2 py-1 rounded-full text-xs ${getPriorityColor(task.priority)}`}>
                {task.priority}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Due Date</p>
              <p className={`text-sm ${isOverdue ? 'text-red-400' : ''}`}>
                {task.due_date ? formatDate(task.due_date) : '—'}
                {isOverdue && ' (Overdue)'}
              </p>
            </div>
          </div>

          {/* Inline time logging when completing */}
          {pendingStatus && (
            <div className="p-3 rounded-lg bg-green-600/10 border border-green-500/25 space-y-2">
              <p className="text-xs font-medium text-green-300">How long did this task take? (optional)</p>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hours</Label>
                  <Input type="number" min={0} max={999} value={timeH}
                    onChange={e => setTimeH(Math.max(0, +e.target.value))} className="h-7 w-20 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Minutes</Label>
                  <Input type="number" min={0} max={59} value={timeM}
                    onChange={e => setTimeM(Math.max(0, Math.min(59, +e.target.value)))} className="h-7 w-20 text-sm" />
                </div>
                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500" onClick={() => confirmWithTime()}>
                  Save & Complete
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => confirmWithTime(true)}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {task.project && (
            <p className="text-xs text-blue-400">
              Project: <Link to={`/projects/${task.project_id}`} className="underline hover:text-blue-300" onClick={onClose}>{task.project.name}</Link>
            </p>
          )}

          {task.description && (
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {task.assigned_user && (
            <p className="text-sm text-muted-foreground">
              Assigned to: <span className="text-white">{task.assigned_user.full_name}</span>
            </p>
          )}

          {/* Sub-deadlines */}
          {(subDeadlines.length > 0 || true) && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Sub-deadlines</p>
              <div className="space-y-1.5">
                {subDeadlines.map(sub => (
                  <label key={sub.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={sub.is_completed}
                      onChange={() => toggleSub(sub)}
                      className="w-3.5 h-3.5 rounded accent-blue-500"
                    />
                    <span className={`text-sm flex-1 ${sub.is_completed ? 'line-through text-muted-foreground' : 'text-white'}`}>
                      {sub.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(sub.due_date)}</span>
                  </label>
                ))}
              </div>
              {/* Add new sub-deadline */}
              <div className="flex gap-2 items-center">
                <Input placeholder="New sub-task…" value={newSub.title}
                  onChange={e => setNewSub(s => ({ ...s, title: e.target.value }))}
                  className="flex-1 h-8 text-xs" />
                <Input type="date" value={newSub.due_date}
                  onChange={e => setNewSub(s => ({ ...s, due_date: e.target.value }))}
                  className="w-32 h-8 text-xs" />
                <Button size="sm" variant="outline" onClick={addSubDeadline} className="h-8 text-xs px-2">
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Comments</p>
            <div className="max-h-36 overflow-y-auto space-y-2">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center text-[10px] text-white shrink-0">
                    {c.user?.full_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 bg-white/5 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-white">{c.user?.full_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add a comment…" value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComment()} />
              <Button size="sm" onClick={addComment} disabled={loading || !comment.trim()}>Send</Button>
            </div>
          </div>

          {/* Audit */}
          {auditLog.length > 0 && (
            <div className="space-y-1 border-t border-white/10 pt-3">
              <p className="text-xs font-medium text-muted-foreground">Activity Log</p>
              {auditLog.slice(0, 5).map(log => (
                <p key={log.id} className="text-xs text-muted-foreground">
                  {log.user?.full_name} — {log.action.replace('_', ' ')}
                  {log.old_value && log.new_value ? ` (${log.old_value} → ${log.new_value})` : ''}
                  · {formatDate(log.created_at, 'MMM d, h:mm a')}
                </p>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={onUpdate}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
