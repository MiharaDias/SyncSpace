import { useState, useEffect } from 'react';
import { format, addMinutes, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import type { User, SuggestedSlot } from '../../types';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { formatTime, formatDate } from '../../lib/utils';
import {
  Search, Users, AlertTriangle, Clock, CheckCircle, XCircle,
  CalendarCheck, ChevronRight, ArrowRight, X
} from 'lucide-react';

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 }, { label: '30 min', value: 30 },
  { label: '45 min', value: 45 }, { label: '1 hour', value: 60 },
  { label: '1h 30min', value: 90 }, { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 }, { label: 'All day', value: 480 },
];

type Step = 'form' | 'availability' | 'suggested_slots' | 'confirm';

interface AvailabilityResult {
  all_required_free: boolean;
  required_busy_count: number;
  required: AttendeeStatus[];
  optional: AttendeeStatus[];
}

interface AttendeeStatus {
  user: User;
  available: boolean;
  conflicts: { source: string; title: string; start: string; end: string }[];
  google_calendar_checked?: boolean;
}

interface Props {
  open: boolean;
  initialTime?: Date;
  initialRequiredAttendees?: User[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewMeetingDialog({ open, initialTime, initialRequiredAttendees, onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    title: '',
    purpose: '',
    location: '',
    start_time: initialTime ? format(initialTime, "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    duration_minutes: 60,
    recurrence_type: 'none',
    recurrence_end_date: '',
  });
  const [requiredAttendees, setRequiredAttendees] = useState<User[]>(initialRequiredAttendees ?? []);
  const [optionalAttendees, setOptionalAttendees] = useState<User[]>([]);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialTime) {
      setForm(f => ({ ...f, start_time: format(initialTime, "yyyy-MM-dd'T'HH:mm") }));
    }
  }, [initialTime]);

  const endTimePreview = () => {
    try {
      return formatTime(addMinutes(new Date(form.start_time), form.duration_minutes).toISOString());
    } catch { return ''; }
  };

  const checkAvailability = async () => {
    if (!form.title) { setError('Meeting title is required'); return; }
    if (!form.start_time) { setError('Start time is required'); return; }
    setError('');
    setChecking(true);
    try {
      const start = new Date(form.start_time);
      const end = addMinutes(start, form.duration_minutes);
      const res = await api.post('/api/meetings/check-availability', {
        required_ids: requiredAttendees.map(u => u.id),
        optional_ids: optionalAttendees.map(u => u.id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      setAvailability(res.data);
      setStep('availability');
    } catch {
      setError('Failed to check availability');
    }
    setChecking(false);
  };

  const loadSuggestedSlots = async () => {
    const allIds = [
      ...requiredAttendees.map(u => u.id),
      user?.id,
    ].filter(Boolean) as string[];
    try {
      const res = await api.post('/api/meetings/suggested-slots', {
        user_ids: allIds,
        duration_minutes: form.duration_minutes,
        target_date: form.start_time,
      });
      setSuggestedSlots(res.data);
      setStep('suggested_slots');
    } catch { }
  };

  const selectSlot = (slot: SuggestedSlot) => {
    // Pre-fill the time and jump straight to confirm — no re-check needed,
    // we already know this slot is free for all required attendees.
    setForm(f => ({ ...f, start_time: format(parseISO(slot.start), "yyyy-MM-dd'T'HH:mm") }));
    setAvailability(null);
    setStep('confirm');
  };

  const moveToOptional = (uid: string) => {
    const u = requiredAttendees.find(a => a.id === uid);
    if (u) {
      setRequiredAttendees(prev => prev.filter(a => a.id !== uid));
      setOptionalAttendees(prev => [...prev, u]);
    }
    // Update availability view
    if (availability) {
      setAvailability(prev => {
        if (!prev) return prev;
        const moved = prev.required.find(r => r.user.id === uid);
        return {
          ...prev,
          required: prev.required.filter(r => r.user.id !== uid),
          optional: moved ? [...prev.optional, { ...moved, google_calendar_checked: false }] : prev.optional,
          required_busy_count: prev.required.filter(r => !r.available && r.user.id !== uid).length,
          all_required_free: prev.required.filter(r => !r.available && r.user.id !== uid).length === 0,
        };
      });
    }
  };

  const createMeeting = async () => {
    setLoading(true);
    setError('');
    try {
      const start = new Date(form.start_time);
      await api.post('/api/meetings', {
        ...form,
        recurrence_end_date: form.recurrence_end_date || null,
        start_time: start.toISOString(),
        required_attendees: requiredAttendees.map(u => u.id),
        optional_attendees: optionalAttendees.map(u => u.id),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create meeting');
      setStep('form');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">

        {/* ── STEP 1: Form ──────────────────────────────────────────────────── */}
        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle>Schedule New Meeting</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {error && (
                <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">{error}</div>
              )}
              <div className="space-y-2">
                <Label>Meeting Title *</Label>
                <Input placeholder="Q4 Planning Session" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Textarea placeholder="What is this meeting about?" value={form.purpose}
                  onChange={e => setForm({ ...form, purpose: e.target.value })} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Location / Link</Label>
                <Input placeholder="Room 204 or https://zoom.us/..." value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time *</Label>
                  <Input type="datetime-local" value={form.start_time}
                    onChange={e => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select value={String(form.duration_minutes)}
                    onValueChange={v => setForm({ ...form, duration_minutes: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.start_time && (
                    <p className="text-xs text-muted-foreground">Ends at {endTimePreview()}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Recurrence</Label>
                  <Select value={form.recurrence_type}
                    onValueChange={v => setForm({ ...form, recurrence_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Repeat</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.recurrence_type !== 'none' && (
                  <div className="space-y-2">
                    <Label>Repeat Until</Label>
                    <Input type="date" value={form.recurrence_end_date}
                      onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })} />
                  </div>
                )}
              </div>

              <AttendeePicker label="Required Attendees" selected={requiredAttendees}
                onChange={setRequiredAttendees} badgeClass="bg-blue-600/20 text-blue-300 border-blue-500/30" />
              <AttendeePicker label="Optional Attendees" selected={optionalAttendees}
                onChange={setOptionalAttendees} badgeClass="bg-purple-600/20 text-purple-300 border-purple-500/30" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={checkAvailability} disabled={checking || !form.title} className="gap-2">
                {checking ? (
                  <><Clock className="w-4 h-4 animate-spin" />Checking...</>
                ) : (
                  <><CalendarCheck className="w-4 h-4" />Check Availability</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 2: Availability Results ──────────────────────────────────── */}
        {step === 'availability' && availability && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {availability.all_required_free
                  ? <><CheckCircle className="w-5 h-5 text-green-400" />Everyone's Available</>
                  : <><AlertTriangle className="w-5 h-5 text-yellow-400" />Availability Conflicts</>
                }
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Required attendees */}
              {availability.required.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Required Attendees
                  </p>
                  {availability.required.map(item => (
                    <AttendeeAvailabilityRow
                      key={item.user.id}
                      item={item}
                      type="required"
                      onMoveToOptional={() => moveToOptional(item.user.id)}
                    />
                  ))}
                </div>
              )}

              {/* Optional attendees */}
              {availability.optional.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Optional Attendees
                  </p>
                  {availability.optional.map(item => (
                    <AttendeeAvailabilityRow
                      key={item.user.id}
                      item={item}
                      type="optional"
                    />
                  ))}
                </div>
              )}

              {/* No attendees selected */}
              {availability.required.length === 0 && availability.optional.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-60" />
                  <p className="text-sm">No attendees to check — you're good to go!</p>
                </div>
              )}

              {/* Conflict options */}
              {!availability.all_required_free && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-xs text-muted-foreground mb-3">
                    {availability.required_busy_count} required attendee{availability.required_busy_count > 1 ? 's are' : ' is'} unavailable. What would you like to do?
                  </p>
                  <button
                    onClick={loadSuggestedSlots}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-white/10 hover:bg-blue-600/10 hover:border-blue-500/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Find Available Time Slots</p>
                        <p className="text-xs text-muted-foreground">See when all required attendees are free</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="ghost" onClick={() => setStep('form')}>← Back</Button>
              {!availability.all_required_free && (
                <Button
                  variant="outline"
                  onClick={createMeeting}
                  disabled={loading}
                  className="gap-2 border-orange-500/40 text-orange-300 hover:bg-orange-600/10"
                >
                  <AlertTriangle className="w-4 h-4" />
                  {loading ? 'Scheduling...' : 'Schedule Anyway'}
                </Button>
              )}
              <Button
                onClick={createMeeting}
                disabled={loading || !availability.all_required_free}
              >
                {loading ? 'Scheduling...' : 'Schedule Meeting'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 3: Suggested Slots ───────────────────────────────────────── */}
        {step === 'suggested_slots' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                Available Time Slots
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {suggestedSlots.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <XCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No available slots found</p>
                  <p className="text-xs mt-1">No open windows for today or tomorrow that fit all required attendees.</p>
                </div>
              ) : (
                suggestedSlots.map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => selectSlot(slot)}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 hover:bg-blue-600/10 hover:border-blue-500/30 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {formatDate(slot.start, 'EEEE, MMMM d')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatTime(slot.start)} – {formatTime(slot.end)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success" className="text-xs">Free</Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('availability')}>← Back</Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 4: Confirm (after selecting a suggested slot) ────────────── */}
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Confirm Meeting
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {error && (
                <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-sm">{error}</div>
              )}
              <div className="rounded-xl border border-green-500/20 bg-green-600/5 p-4 space-y-3">
                <p className="text-sm font-semibold text-white">{form.title}</p>
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide mb-1 text-blue-300">Time</p>
                    <p className="text-white">{formatDate(new Date(form.start_time).toISOString(), 'EEE, MMM d')}</p>
                    <p>{formatTime(new Date(form.start_time).toISOString())} – {endTimePreview()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide mb-1 text-blue-300">Duration</p>
                    <p className="text-white">{form.duration_minutes} min</p>
                    {form.location && <p className="mt-1 text-muted-foreground truncate">{form.location}</p>}
                  </div>
                </div>
                {(requiredAttendees.length > 0 || optionalAttendees.length > 0) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide mb-1 text-blue-300">Attendees</p>
                    <div className="flex flex-wrap gap-1">
                      {requiredAttendees.map(u => (
                        <span key={u.id} className="text-xs bg-blue-600/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                          {u.full_name}
                        </span>
                      ))}
                      {optionalAttendees.map(u => (
                        <span key={u.id} className="text-xs bg-purple-600/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                          {u.full_name} (opt)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1 text-xs text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  All required attendees are available at this time
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStep('suggested_slots')}>← Back to Slots</Button>
              <Button onClick={createMeeting} disabled={loading} className="gap-2">
                {loading ? (
                  <><Clock className="w-4 h-4 animate-spin" />Scheduling…</>
                ) : (
                  <><CalendarCheck className="w-4 h-4" />Confirm &amp; Schedule</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Attendee Availability Row ────────────────────────────────────────────────
function AttendeeAvailabilityRow({ item, type, onMoveToOptional }: {
  item: AttendeeStatus;
  type: 'required' | 'optional';
  onMoveToOptional?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-3 ${
      item.available
        ? 'border-green-500/20 bg-green-600/5'
        : type === 'required'
          ? 'border-red-500/30 bg-red-600/8'
          : 'border-yellow-500/20 bg-yellow-600/5'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.available
            ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            : <XCircle className={`w-4 h-4 shrink-0 ${type === 'required' ? 'text-red-400' : 'text-yellow-400'}`} />
          }
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{item.user.full_name}</p>
            <p className="text-xs text-muted-foreground">{item.user.department}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {item.google_calendar_checked && (
            <span className="text-[10px] text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
              +Google
            </span>
          )}
          {item.available
            ? <Badge variant="success" className="text-xs">Free</Badge>
            : (
              <div className="flex items-center gap-1.5">
                <Badge variant={type === 'required' ? 'destructive' : 'warning'} className="text-xs">
                  Busy
                </Badge>
                {item.conflicts.length > 0 && (
                  <button
                    onClick={() => setExpanded(e => !e)}
                    className="text-xs text-muted-foreground hover:text-white underline"
                  >
                    {item.conflicts.length} conflict{item.conflicts.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )
          }
        </div>
      </div>

      {/* Expanded conflicts */}
      {!item.available && expanded && item.conflicts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
          {item.conflicts.map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              • {c.title} · {formatTime(c.start)} – {formatTime(c.end)}
              {c.source === 'google_calendar' && (
                <span className="ml-1 text-blue-400">(Google Calendar)</span>
              )}
            </p>
          ))}
        </div>
      )}

      {/* Move to optional action (required attendees only) */}
      {!item.available && type === 'required' && onMoveToOptional && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <button
            onClick={onMoveToOptional}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <ArrowRight className="w-3 h-3" />
            Move to optional attendees
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Attendee Picker ──────────────────────────────────────────────────────────
function AttendeePicker({ label, selected, onChange, badgeClass }: {
  label: string;
  selected: User[];
  onChange: (u: User[]) => void;
  badgeClass: string;
}) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { user } = useAuthStore();

  useEffect(() => {
    api.get('/api/users/departments').then(r => setDepartments(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!show) return;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (dept) params.set('department', dept);
    api.get(`/api/users?${params}`).then(r => {
      setResults(r.data.filter((u: User) => u.id !== user?.id));
    }).catch(() => {});
  }, [search, dept, show]);

  const toggleCheck = (uid: string) => {
    const next = new Set(checked);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setChecked(next);
  };

  const selectAll = () => setChecked(new Set(results.map(u => u.id)));

  const addSelected = () => {
    const toAdd = results.filter(u => checked.has(u.id) && !selected.find(s => s.id === u.id));
    onChange([...selected, ...toAdd]);
    setChecked(new Set());
    setShow(false);
    setSearch('');
    setDept('');
  };

  const remove = (uid: string) => onChange(selected.filter(u => u.id !== uid));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(u => (
            <span key={u.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${badgeClass}`}>
              {u.full_name}
              <button onClick={() => remove(u.id)} className="hover:text-white ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {!show ? (
        <Button type="button" variant="outline" size="sm" className="gap-2 h-8" onClick={() => setShow(true)}>
          <Users className="w-3 h-3" />Add Attendees
        </Button>
      ) : (
        <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-white/3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search by name or email..." className="pl-7 h-8 text-xs"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={dept || '_all'} onValueChange={v => setDept(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All depts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {results.map(u => (
              <label key={u.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer">
                <Checkbox checked={checked.has(u.id)} onCheckedChange={() => toggleCheck(u.id)} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{u.full_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{u.department}</span>
              </label>
            ))}
            {results.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
            )}
          </div>
          <div className="flex gap-2 pt-1 border-t border-white/10">
            <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={selectAll}>
              Select All ({results.length})
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="ghost" size="sm" className="h-7"
              onClick={() => { setShow(false); setChecked(new Set()); }}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="h-7" onClick={addSelected} disabled={checked.size === 0}>
              Add ({checked.size})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
