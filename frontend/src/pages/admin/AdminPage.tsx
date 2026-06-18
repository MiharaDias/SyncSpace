import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  UserCheck, Users, Calendar, Activity, BarChart3, Trash2,
  Plus, X, Search, Mail, Building2, Send, Settings, Eye, EyeOff,
  CheckCircle2, AlertCircle, ExternalLink, Pencil,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import api from '../../lib/api';
import { useDepartmentsStore } from '../../lib/departments';
import type { User, Meeting } from '../../types';
import { formatDateTime, getRoleColor } from '../../lib/utils';

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'approvals';

  const setTab = (tab: string) => setSearchParams({ tab });

  const [pendingUsers, setPendingUsers]   = useState<User[]>([]);
  const [allUsers, setAllUsers]           = useState<User[]>([]);
  const [meetings, setMeetings]           = useState<Meeting[]>([]);
  const [stats, setStats]                 = useState<any>(null);
  const [activityLogs, setActivityLogs]   = useState<any>(null);
  const [invitations, setInvitations]     = useState<any[]>([]);
  const [loading, setLoading]             = useState<Record<string, boolean>>({});

  // Department management
  const { fetch: fetchDepts } = useDepartmentsStore();
  const [adminDepts, setAdminDepts]       = useState<string[]>([]);
  const [newDeptName, setNewDeptName]     = useState('');
  const [deptError, setDeptError]         = useState('');

  // Users filter
  const [userSearch, setUserSearch]       = useState('');
  const [roleFilter, setRoleFilter]       = useState('all');
  const [deptFilter, setDeptFilter]       = useState('all');

  // Invitation form
  const [invEmail, setInvEmail]           = useState('');
  const [invRole, setInvRole]             = useState('user');
  const [invDepts, setInvDepts]           = useState<string[]>([]);
  const [invError, setInvError]           = useState('');
  const [invSuccess, setInvSuccess]       = useState('');
  const [invLoading, setInvLoading]       = useState(false);

  // Edit-before-approve dialog
  const [editApproveUser, setEditApproveUser] = useState<User | null>(null);
  const [editApproveForm, setEditApproveForm] = useState({ role: 'user' as User['role'], departments: [] as string[] });

  // Email config
  const [emailCfg, setEmailCfg]           = useState({ smtp_email: '', frontend_url: '', has_password: false, configured: false });
  const [emailForm, setEmailForm]         = useState({ smtp_email: '', smtp_app_password: '', frontend_url: '' });
  const [showPass, setShowPass]           = useState(false);
  const [emailSaving, setEmailSaving]     = useState(false);
  const [emailTesting, setEmailTesting]   = useState(false);
  const [emailMsg, setEmailMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    Promise.allSettled([
      api.get('/api/admin/pending-users'),
      api.get('/api/admin/users'),
      api.get('/api/admin/meetings'),
      api.get('/api/admin/stats'),
      api.get('/api/admin/activity-logs'),
      api.get('/api/admin/invitations'),
      api.get('/api/admin/departments'),
      api.get('/api/admin/email-config'),
    ]).then(([pending, users, mtgs, statsRes, logs, invRes, deptsRes, emailRes]) => {
      if (pending.status   === 'fulfilled') setPendingUsers(pending.value.data);
      if (users.status     === 'fulfilled') setAllUsers(users.value.data);
      if (mtgs.status      === 'fulfilled') setMeetings(mtgs.value.data);
      if (statsRes.status  === 'fulfilled') setStats(statsRes.value.data);
      if (logs.status      === 'fulfilled') setActivityLogs(logs.value.data);
      if (invRes.status    === 'fulfilled') setInvitations(invRes.value.data);
      if (deptsRes.status  === 'fulfilled') setAdminDepts(deptsRes.value.data);
      if (emailRes.status  === 'fulfilled') {
        const d = emailRes.value.data;
        setEmailCfg(d);
        setEmailForm(f => ({ ...f, smtp_email: d.smtp_email || '', frontend_url: d.frontend_url || '' }));
      }
    });
  }, []);

  useEffect(() => { load(); fetchDepts(); }, [load, fetchDepts]);

  // ── User actions ─────────────────────────────────────────────────────────────

  const approveUser = async (userId: string, overrides?: { role: User['role']; departments: string[] }) => {
    setLoading(l => ({ ...l, [userId]: true }));
    try {
      await api.post(`/api/admin/approve-user/${userId}`, overrides ?? {});
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      setAllUsers(prev => prev.map(u => u.id === userId
        ? { ...u, is_approved: true, ...(overrides ?? {}), department: overrides?.departments[0] ?? u.department }
        : u));
      if (overrides) setEditApproveUser(null);
    } catch { }
    setLoading(l => ({ ...l, [userId]: false }));
  };

  const openEditApprove = (u: User) => {
    setEditApproveForm({
      role: u.role,
      departments: (u as any).departments?.length ? (u as any).departments : (u.department ? [u.department] : []),
    });
    setEditApproveUser(u);
  };

  const toggleEditDept = (d: string) =>
    setEditApproveForm(f => ({
      ...f,
      departments: f.departments.includes(d) ? f.departments.filter(x => x !== d) : [...f.departments, d],
    }));

  const rejectUser = async (userId: string) => {
    if (!confirm('Reject this user? They will be deactivated.')) return;
    setLoading(l => ({ ...l, [userId]: true }));
    try {
      await api.post(`/api/admin/reject-user/${userId}`);
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
    } catch { }
    setLoading(l => ({ ...l, [userId]: false }));
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      await api.put(`/api/admin/users/${userId}/role`, { role });
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as any } : u));
    } catch { }
  };

  const toggleActive = async (userId: string, currentlyActive: boolean) => {
    if (!confirm(currentlyActive ? 'Deactivate this user?' : 'Activate this user?')) return;
    try {
      await api[currentlyActive ? 'post' : 'post'](
        `/api/admin/users/${userId}/${currentlyActive ? 'deactivate' : 'activate'}`
      );
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentlyActive } : u));
    } catch { }
  };

  const cancelMeeting = async (meetingId: string) => {
    if (!confirm('Cancel this meeting?')) return;
    try {
      await api.delete(`/api/admin/meetings/${meetingId}`);
      setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'cancelled' } : m));
    } catch { }
  };

  // ── Department actions ────────────────────────────────────────────────────────

  const addDept = async () => {
    setDeptError('');
    const name = newDeptName.trim();
    if (!name) return;
    try {
      const res = await api.post('/api/admin/departments', { name });
      setAdminDepts(res.data.departments);
      fetchDepts();
      setNewDeptName('');
    } catch (err: any) {
      setDeptError(err.response?.data?.error || 'Failed to add department');
    }
  };

  const removeDept = async (name: string) => {
    if (!confirm(`Remove department "${name}"? Users with only this department will have it cleared.`)) return;
    try {
      const res = await api.delete(`/api/admin/departments/${encodeURIComponent(name)}`);
      setAdminDepts(res.data.departments);
      fetchDepts();
    } catch (err: any) {
      setDeptError(err.response?.data?.error || 'Failed to remove');
    }
  };

  // ── Invitation actions ────────────────────────────────────────────────────────

  const toggleInvDept = (d: string) =>
    setInvDepts(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const sendInvite = async () => {
    setInvError('');
    setInvSuccess('');
    if (!invEmail.trim()) { setInvError('Email required'); return; }
    if (invDepts.length === 0) { setInvError('Select at least one department'); return; }
    setInvLoading(true);
    try {
      const res = await api.post('/api/admin/invite', {
        email:       invEmail.trim(),
        role:        invRole,
        departments: invDepts,
        department:  invDepts[0],
      });
      const emailSent = res.data.email_sent;
      setInvSuccess(
        emailSent
          ? `Invitation sent to ${invEmail}`
          : `Invitation created — ${res.data.email_error ? `email failed (${res.data.email_error})` : 'link logged to console'}. Configure email in Settings tab to send automatically.`
      );
      setInvEmail('');
      setInvRole('user');
      setInvDepts([]);
      setInvitations(prev => [res.data, ...prev]);
      api.get('/api/admin/invitations').then(r => setInvitations(r.data)).catch(() => {});
    } catch (err: any) {
      setInvError(err.response?.data?.error || 'Failed to send invitation');
    }
    setInvLoading(false);
  };

  const cancelInvitation = async (id: string) => {
    try {
      await api.delete(`/api/admin/invitations/${id}`);
      setInvitations(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled' } : i));
    } catch { }
  };

  // ── Email config actions ──────────────────────────────────────────────────────

  const saveEmailConfig = async () => {
    setEmailMsg(null);
    setEmailSaving(true);
    try {
      await api.post('/api/admin/email-config', emailForm);
      const res = await api.get('/api/admin/email-config');
      setEmailCfg(res.data);
      setEmailForm(f => ({ ...f, smtp_app_password: '' })); // clear password field after save
      setEmailMsg({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err: any) {
      setEmailMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save' });
    }
    setEmailSaving(false);
  };

  const testEmail = async () => {
    setEmailMsg(null);
    setEmailTesting(true);
    try {
      const res = await api.post('/api/admin/email-config/test');
      setEmailMsg({ type: 'success', text: res.data.message });
    } catch (err: any) {
      setEmailMsg({ type: 'error', text: err.response?.data?.error || 'Test failed' });
    }
    setEmailTesting(false);
  };

  // ── Filtered users ────────────────────────────────────────────────────────────

  const filteredUsers = allUsers.filter(u => {
    const searchMatch = !userSearch ||
      u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const roleMatch = roleFilter === 'all' || u.role === roleFilter;
    const deptMatch = deptFilter === 'all' || u.department === deptFilter;
    return searchMatch && roleMatch && deptMatch;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Admin Panel</h2>
        <p className="text-sm text-muted-foreground">System management and oversight</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Users',       value: stats.total_users,       icon: <Users className="w-4 h-4 text-blue-400" /> },
            { label: 'Pending Approvals', value: stats.pending_approvals, icon: <UserCheck className="w-4 h-4 text-yellow-400" /> },
            { label: 'Active Meetings',   value: stats.active_meetings,   icon: <Calendar className="w-4 h-4 text-green-400" /> },
            { label: 'Total Tasks',       value: stats.total_tasks,       icon: <BarChart3 className="w-4 h-4 text-purple-400" /> },
            { label: 'Completed Tasks',   value: stats.completed_tasks,   icon: <Activity className="w-4 h-4 text-emerald-400" /> },
          ].map(s => (
            <Card key={s.label} className="border-white/10">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
                </div>
                {s.icon}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="approvals" className="relative">
            Approvals
            {pendingUsers.length > 0 && (
              <span className="ml-1.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full inline-flex items-center justify-center">
                {pendingUsers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
          <TabsTrigger value="settings" className="relative">
            Settings
            {!emailCfg.configured && (
              <span className="ml-1.5 w-2 h-2 bg-yellow-400 rounded-full inline-block" title="Email not configured" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Approvals ─────────────────────────────────────────────────────── */}
        <TabsContent value="approvals" className="mt-4">
          {pendingUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map(u => (
                <Card key={u.id} className="border-white/10 border-yellow-500/20">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{u.full_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {u.email} · {u.role}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {((u as any).departments?.length ? (u as any).departments : [u.department])
                          .filter(Boolean)
                          .map((d: string) => (
                            <span key={d} className="text-[10px] bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded">
                              {d}
                            </span>
                          ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{formatDateTime(u.created_at)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                      <Button size="sm" className="bg-green-600 hover:bg-green-500 gap-1.5" disabled={loading[u.id]}
                        onClick={() => approveUser(u.id)}>
                        <UserCheck className="w-3 h-3" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 border-blue-500/30 text-blue-300 hover:bg-blue-600/10"
                        disabled={loading[u.id]} onClick={() => openEditApprove(u)}>
                        <Pencil className="w-3 h-3" />Edit &amp; Approve
                      </Button>
                      <Button size="sm" variant="destructive" disabled={loading[u.id]}
                        onClick={() => rejectUser(u.id)}>Reject</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── All Users ─────────────────────────────────────────────────────── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search by name or email…" className="pl-8 h-8 text-sm"
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="administrator">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {adminDepts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</p>

          <div className="space-y-2">
            {filteredUsers.map(u => (
              <Card key={u.id} className="border-white/10">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white">{u.full_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleColor(u.role)}`}>{u.role}</span>
                      {!u.is_approved && <Badge variant="warning" className="text-xs">Pending</Badge>}
                      {!u.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {((u as any).departments?.length ? (u as any).departments : [u.department])
                        .filter(Boolean)
                        .map((d: string) => (
                          <span key={d} className="text-[10px] bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {/* Role selector */}
                    <Select value={u.role} onValueChange={r => updateRole(u.id, r)}>
                      <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="administrator">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* Approve pending */}
                    {!u.is_approved && (
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500"
                        onClick={() => approveUser(u.id)}>Approve</Button>
                    )}
                    {/* Activate / Deactivate */}
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => toggleActive(u.id, u.is_active ?? true)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Departments ──────────────────────────────────────────────────── */}
        <TabsContent value="departments" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Manage the departments users can select when registering. Changes appear immediately in sign-up forms.
          </p>

          {deptError && (
            <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">{deptError}</div>
          )}

          {/* Add new */}
          <div className="flex gap-2">
            <Input placeholder="New department name…" value={newDeptName}
              onChange={e => { setNewDeptName(e.target.value); setDeptError(''); }}
              onKeyDown={e => e.key === 'Enter' && addDept()}
              className="h-9" />
            <Button size="sm" onClick={addDept} disabled={!newDeptName.trim()} className="gap-2 h-9">
              <Plus className="w-3.5 h-3.5" />Add
            </Button>
          </div>

          {/* List */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {adminDepts.map(d => (
              <div key={d} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                <span className="flex items-center gap-2 text-sm text-white">
                  <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  {d}
                </span>
                <button onClick={() => removeDept(d)}
                  className="text-muted-foreground hover:text-red-400 transition-colors ml-2">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Invitations ──────────────────────────────────────────────────── */}
        <TabsContent value="invitations" className="mt-4 space-y-4">
          {/* Send form */}
          <Card className="border-white/10 border-blue-500/20">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-400" />
                Send Invitation
              </h3>
              {invError && (
                <div className="p-2 rounded bg-red-600/20 border border-red-500/30 text-red-300 text-xs">{invError}</div>
              )}
              {invSuccess && (
                <div className="p-2 rounded bg-green-600/20 border border-green-500/30 text-green-300 text-xs">{invSuccess}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" placeholder="user@company.com" value={invEmail}
                    onChange={e => { setInvEmail(e.target.value); setInvError(''); setInvSuccess(''); }}
                    className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={invRole} onValueChange={v => {
                    setInvRole(v);
                    if (v === 'administrator') setInvDepts([...adminDepts]);
                  }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="administrator">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Multi-select departments */}
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Departments *{' '}
                  <span className="text-muted-foreground font-normal">(select all that apply)</span>
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 p-3 rounded-lg border border-white/10 bg-white/5 max-h-44 overflow-y-auto">
                  {adminDepts.map(d => (
                    <label key={d} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={invDepts.includes(d)}
                        onChange={() => { toggleInvDept(d); setInvError(''); }}
                        className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer shrink-0"
                      />
                      <span className={`text-xs transition-colors truncate ${
                        invDepts.includes(d) ? 'text-white' : 'text-muted-foreground group-hover:text-white'
                      }`}>
                        {d}
                      </span>
                    </label>
                  ))}
                </div>
                {invDepts.length > 0 && (
                  <p className="text-xs text-blue-400">
                    Selected: {invDepts.join(', ')}
                  </p>
                )}
              </div>
              <Button size="sm" onClick={sendInvite} disabled={invLoading} className="gap-2">
                <Mail className="w-3.5 h-3.5" />
                {invLoading ? 'Sending…' : 'Create Invitation'}
              </Button>
            </CardContent>
          </Card>

          {/* Invitation list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Sent Invitations</h3>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No invitations yet</p>
            ) : (
              invitations.map((inv: any) => (
                <Card key={inv.id} className="border-white/10">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.role} ·{' '}
                        {((inv.departments?.length ? inv.departments : inv.department ? [inv.department] : []) as string[]).join(', ') || '—'}
                        {' '}· {formatDateTime(inv.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={
                        inv.status === 'accepted' ? 'success' :
                        inv.status === 'pending'  ? 'warning' : 'secondary'
                      } className="text-xs capitalize">{inv.status}</Badge>
                      {inv.status === 'pending' && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400"
                          onClick={() => cancelInvitation(inv.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Meetings ─────────────────────────────────────────────────────── */}
        <TabsContent value="meetings" className="mt-4">
          <div className="space-y-2">
            {meetings.slice(0, 30).map(m => (
              <Card key={m.id} className={`border-white/10 ${m.status === 'cancelled' ? 'opacity-50' : ''}`}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(m.start_time)} · {(m as any).organizer?.full_name}
                    </p>
                  </div>
                  {m.status === 'active' && (
                    <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                      onClick={() => cancelMeeting(m.id)}>
                      <Trash2 className="w-3 h-3" />Cancel
                    </Button>
                  )}
                  {m.status === 'cancelled' && <Badge variant="secondary" className="text-xs">Cancelled</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Settings ─────────────────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-4 space-y-6 max-w-2xl">

          {/* Status banner */}
          <div className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
            emailCfg.configured
              ? 'bg-green-600/10 border-green-500/30 text-green-300'
              : 'bg-yellow-600/10 border-yellow-500/30 text-yellow-300'
          }`}>
            {emailCfg.configured
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />}
            {emailCfg.configured
              ? `Email active — sending from ${emailCfg.smtp_email}`
              : 'Email not configured — invitations are logged to console only'}
          </div>

          {/* Config form */}
          <Card className="border-white/10">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                Email Configuration
              </h3>

              {emailMsg && (
                <div className={`p-3 rounded-lg border text-sm ${
                  emailMsg.type === 'success'
                    ? 'bg-green-600/15 border-green-500/30 text-green-300'
                    : 'bg-red-600/15 border-red-500/30 text-red-300'
                }`}>
                  {emailMsg.text}
                </div>
              )}

              <div className="space-y-2">
                <Label>System Email Address</Label>
                <Input
                  type="email"
                  placeholder="mail2mihara@gmail.com"
                  value={emailForm.smtp_email}
                  onChange={e => setEmailForm(f => ({ ...f, smtp_email: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  The Gmail address that sends all system emails (invitations, etc.)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Gmail App Password</Label>
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    placeholder={emailCfg.has_password ? '••••••••••••••••  (leave blank to keep current)' : 'xxxx xxxx xxxx xxxx'}
                    value={emailForm.smtp_app_password}
                    onChange={e => setEmailForm(f => ({ ...f, smtp_app_password: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is a 16-character App Password from Google — NOT your Gmail password.
                  {emailCfg.has_password && <span className="text-green-400 ml-1">✓ Password is set</span>}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Frontend URL</Label>
                <Input
                  type="url"
                  placeholder="https://your-app.com"
                  value={emailForm.frontend_url}
                  onChange={e => setEmailForm(f => ({ ...f, frontend_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Used to build invite links in emails (e.g. https://syncspace.app). Leave blank to auto-detect from browser.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <Button onClick={saveEmailConfig} disabled={emailSaving} className="gap-2">
                  <Settings className="w-3.5 h-3.5" />
                  {emailSaving ? 'Saving…' : 'Save Settings'}
                </Button>
                <Button
                  variant="outline"
                  onClick={testEmail}
                  disabled={emailTesting || !emailCfg.configured}
                  className="gap-2"
                  title={!emailCfg.configured ? 'Save email settings first' : 'Send a test email to yourself'}
                >
                  <Send className="w-3.5 h-3.5" />
                  {emailTesting ? 'Sending…' : 'Send Test Email'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* How-to guide */}
          <Card className="border-white/10 border-blue-500/10">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-blue-400" />
                How to get a Gmail App Password
              </h3>
              <p className="text-xs text-muted-foreground">
                Google requires an App Password because SyncSpace is a third-party app.
                Your normal Gmail password will not work.
              </p>
              <ol className="space-y-2 text-xs text-muted-foreground list-none">
                {[
                  { n: '1', text: 'Sign in to', link: 'https://myaccount.google.com/security', label: 'myaccount.google.com/security' },
                  { n: '2', text: 'Make sure 2-Step Verification is ON (required by Google)' },
                  { n: '3', text: 'Search for "App passwords" in the security page search bar' },
                  { n: '4', text: 'Click Add → choose "Other (Custom name)" → type SyncSpace → click Create' },
                  { n: '5', text: 'Copy the 16-character password Google shows (it appears only once)' },
                  { n: '6', text: 'Paste it in the App Password field above and click Save Settings' },
                ].map(step => (
                  <li key={step.n} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {step.n}
                    </span>
                    <span>
                      {step.text}
                      {step.link && (
                        <a href={step.link} target="_blank" rel="noreferrer"
                          className="text-blue-400 hover:text-blue-300 ml-1 underline">
                          {step.label}
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 p-3 rounded-lg bg-yellow-600/10 border border-yellow-500/20 text-xs text-yellow-300">
                ⚠️ App Passwords are stored in the database. Treat them like passwords — do not share your screen while this tab is open.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Logs ─────────────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="mt-4">
          {activityLogs && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Meeting Logs</h3>
                <div className="space-y-1">
                  {activityLogs.meeting_logs?.slice(0, 20).map((log: any) => (
                    <div key={log.id} className="text-xs p-2 rounded bg-white/5">
                      <span className="text-white">{log.user?.full_name}</span>
                      <span className="text-muted-foreground"> — {log.action} </span>
                      {log.meeting && <span className="text-blue-300">"{log.meeting.title}"</span>}
                      <span className="text-muted-foreground block">{formatDateTime(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Task Logs</h3>
                <div className="space-y-1">
                  {activityLogs.task_logs?.slice(0, 20).map((log: any) => (
                    <div key={log.id} className="text-xs p-2 rounded bg-white/5">
                      <span className="text-white">{log.user?.full_name}</span>
                      <span className="text-muted-foreground"> — {log.action} </span>
                      {log.task && <span className="text-blue-300">"{log.task.title}"</span>}
                      <span className="text-muted-foreground block">{formatDateTime(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit & Approve dialog */}
      {editApproveUser && (
        <Dialog open onOpenChange={() => setEditApproveUser(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit &amp; Approve</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-medium text-white">{editApproveUser.full_name}</p>
                <p className="text-xs text-muted-foreground">{editApproveUser.email}</p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editApproveForm.role} onValueChange={v => setEditApproveForm(f => ({ ...f, role: v as User['role'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Departments</Label>
                <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg border border-white/10 bg-white/5 max-h-40 overflow-y-auto">
                  {adminDepts.map(d => (
                    <label key={d} className="flex items-center gap-2 cursor-pointer group">
                      <Checkbox
                        checked={editApproveForm.departments.includes(d)}
                        onCheckedChange={() => toggleEditDept(d)}
                      />
                      <span className="text-xs text-white">{d}</span>
                    </label>
                  ))}
                </div>
                {editApproveForm.departments.length === 0 && (
                  <p className="text-xs text-red-400">Select at least one department</p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setEditApproveUser(null)}>Cancel</Button>
              <Button
                className="bg-green-600 hover:bg-green-500"
                disabled={editApproveForm.departments.length === 0 || loading[editApproveUser.id]}
                onClick={() => approveUser(editApproveUser.id, editApproveForm)}
              >
                Approve with Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
