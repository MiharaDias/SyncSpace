import { useEffect, useState, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay,
  addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, isSameDay, isSameMonth,
  eachDayOfInterval, parseISO, getHours, getMinutes } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import api from '../../lib/api';
import type { CalendarEvent } from '../../types';
import { formatTime } from '../../lib/utils';
import NewMeetingDialog from '../../components/meetings/NewMeetingDialog';
import MarkBusyDialog from '../../components/meetings/MarkBusyDialog';
import EventDetailModal from '../../components/calendar/EventDetailModal';
import TimeSlotActionMenu from '../../components/calendar/TimeSlotActionMenu';

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [slotAction, setSlotAction] = useState<{ time: Date; pos: { x: number; y: number } } | null>(null);
  const [newMeetingTime, setNewMeetingTime] = useState<Date | null>(null);
  const [markBusyTime, setMarkBusyTime] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      let start: Date, end: Date;
      if (view === 'month') {
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
      } else if (view === 'week') {
        start = startOfWeek(currentDate, { weekStartsOn: 0 });
        end = endOfWeek(currentDate, { weekStartsOn: 0 });
      } else {
        start = startOfDay(currentDate);
        end = endOfDay(currentDate);
      }
      const res = await api.get(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`);
      setEvents(res.data);
    } catch { }
  }, [currentDate, view]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const navigate = (dir: 1 | -1) => {
    if (view === 'month') setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const title = () => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  };

  const syncGoogleCalendar = useCallback(async () => {
    setSyncing(true);
    try {
      await api.post('/api/calendar/sync');
      await fetchEvents();
    } catch { }
    setSyncing(false);
  }, [fetchEvents]);

  const openEvent = async (event: CalendarEvent) => {
    if (event.type === 'meeting') {
      try {
        const res = await api.get(`/api/meetings/${event.id}`);
        setSelectedEvent({ ...event, raw: res.data });
      } catch {
        setSelectedEvent(event);
      }
    } else {
      setSelectedEvent(event);
    }
  };

  const handleSlotClick = (time: Date, e: React.MouseEvent) => {
    setSlotAction({ time, pos: { x: e.clientX, y: e.clientY } });
  };

  return (
    <div className="h-full flex flex-col gap-3 sm:gap-4">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        {/* Navigation row */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-sm sm:text-base font-semibold text-white flex-1 text-center min-w-0 truncate">
            {title()}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="text-xs h-8 px-2.5">
            Today
          </Button>
        </div>
        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="month" className="text-xs px-2.5 h-7">Month</TabsTrigger>
              <TabsTrigger value="week"  className="text-xs px-2.5 h-7">Week</TabsTrigger>
              <TabsTrigger value="day"   className="text-xs px-2.5 h-7">Day</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            variant="outline"
            onClick={syncGoogleCalendar}
            disabled={syncing}
            title="Pull latest events from Google Calendar"
            className="gap-1.5 h-8 text-xs px-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
          </Button>
          <Button size="sm" onClick={() => setNewMeetingTime(currentDate)} className="gap-1.5 h-8 text-xs px-2.5">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New</span>
            <span className="sm:hidden">Meeting</span>
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-white/3">
        {view === 'month' && (
          <MonthView currentDate={currentDate} events={events}
            onEventClick={openEvent} onSlotClick={handleSlotClick} />
        )}
        {view === 'week' && (
          <WeekView currentDate={currentDate} events={events}
            onEventClick={openEvent} onSlotClick={handleSlotClick} />
        )}
        {view === 'day' && (
          <DayView currentDate={currentDate} events={events}
            onEventClick={openEvent} onSlotClick={handleSlotClick} />
        )}
      </div>

      {/* Time Slot Menu */}
      {slotAction && (
        <TimeSlotActionMenu
          position={slotAction.pos}
          onClose={() => setSlotAction(null)}
          onNewMeeting={() => { setNewMeetingTime(slotAction.time); setSlotAction(null); }}
          onMarkBusy={() => { setMarkBusyTime(slotAction.time); setSlotAction(null); }}
        />
      )}

      {/* Dialogs */}
      {newMeetingTime && (
        <NewMeetingDialog
          open={!!newMeetingTime}
          initialTime={newMeetingTime}
          onClose={() => setNewMeetingTime(null)}
          onSuccess={() => { setNewMeetingTime(null); fetchEvents(); }}
        />
      )}
      {markBusyTime && (
        <MarkBusyDialog
          open={!!markBusyTime}
          initialTime={markBusyTime}
          onClose={() => setMarkBusyTime(null)}
          onSuccess={() => { setMarkBusyTime(null); fetchEvents(); }}
        />
      )}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRefresh={fetchEvents}
        />
      )}
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────
function MonthView({ currentDate, events, onEventClick, onSlotClick }: any) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const getEventsForDay = (day: Date) =>
    events.filter((e: CalendarEvent) => isSameDay(parseISO(e.start), day));

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-white/10">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map(day => {
          const dayEvents = getEventsForDay(day);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentDate);
          return (
            <div
              key={day.toISOString()}
              className={`border-r border-b border-white/5 p-1 min-h-[80px] cursor-pointer hover:bg-white/3 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''}`}
              onClick={(e) => onSlotClick(day, e)}
            >
              <div className="flex justify-end">
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${isToday ? 'bg-blue-600 text-white' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5 mt-1">
                {dayEvents.slice(0, 3).map((ev: CalendarEvent) => (
                  <div
                    key={ev.id}
                    className="calendar-event text-white text-[11px] px-1.5 py-0.5"
                    style={{ backgroundColor: ev.color }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[11px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ─────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function WeekView({ currentDate, events, onEventClick, onSlotClick }: any) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header — horizontally scrollable on mobile */}
      <div className="overflow-x-auto shrink-0">
        <div className="grid min-w-[500px]" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
          <div className="border-b border-white/10" />
          {days.map(day => (
            <div key={day.toISOString()} className={`border-b border-l border-white/10 py-2 text-center ${isSameDay(day, new Date()) ? 'bg-blue-600/10' : ''}`}>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{format(day, 'EEE')}</p>
              <p className={`text-xs sm:text-sm font-semibold mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center mx-auto ${isSameDay(day, new Date()) ? 'bg-blue-600 text-white' : 'text-white'}`}>
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>
      </div>
      {/* Time Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <div className="relative grid min-w-[500px]" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
          {/* Hour labels */}
          <div>
            {HOURS.map(h => (
              <div key={h} className="h-14 border-b border-white/5 flex items-start justify-end pr-2 pt-1">
                <span className="text-[11px] text-muted-foreground">{h === 0 ? '' : format(new Date().setHours(h, 0), 'h a')}</span>
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map(day => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              events={events.filter((e: CalendarEvent) => isSameDay(parseISO(e.start), day))}
              onEventClick={onEventClick}
              onSlotClick={onSlotClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayView({ currentDate, events, onEventClick, onSlotClick }: any) {
  const dayEvents = events.filter((e: CalendarEvent) => isSameDay(parseISO(e.start), currentDate));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 py-3 px-4 border-b border-white/10">
        <p className="text-sm font-semibold text-white">{format(currentDate, 'EEEE, MMMM d')}</p>
        <p className="text-xs text-muted-foreground">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: '48px 1fr' }}>
          <div>
            {HOURS.map(h => (
              <div key={h} className="h-14 border-b border-white/5 flex items-start justify-end pr-2 pt-1">
                <span className="text-[11px] text-muted-foreground">{h === 0 ? '' : format(new Date().setHours(h, 0), 'h a')}</span>
              </div>
            ))}
          </div>
          <DayColumn day={currentDate} events={dayEvents} onEventClick={onEventClick} onSlotClick={onSlotClick} />
        </div>
      </div>
    </div>
  );
}

function DayColumn({ day, events, onEventClick, onSlotClick }: any) {
  const isToday = isSameDay(day, new Date());

  const getEventStyle = (event: CalendarEvent) => {
    const startH = getHours(parseISO(event.start));
    const startM = getMinutes(parseISO(event.start));
    const endH = getHours(parseISO(event.end));
    const endM = getMinutes(parseISO(event.end));
    const top = (startH * 60 + startM) / 60 * 56;
    const height = Math.max(((endH * 60 + endM) - (startH * 60 + startM)) / 60 * 56, 20);
    return { top, height };
  };

  return (
    <div className={`relative border-l border-white/10 ${isToday ? 'bg-blue-600/5' : ''}`}>
      {HOURS.map(h => (
        <div
          key={h}
          className="h-14 border-b border-white/5 cursor-pointer hover:bg-white/3 transition-colors"
          onClick={(e) => {
            const slotTime = new Date(day);
            slotTime.setHours(h, 0, 0, 0);
            onSlotClick(slotTime, e);
          }}
        />
      ))}
      {/* Current time line */}
      {isToday && (
        <div
          className="absolute left-0 right-0 z-10 pointer-events-none"
          style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) / 60 * 56}px` }}
        >
          <div className="h-0.5 bg-red-400 relative">
            <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-400" />
          </div>
        </div>
      )}
      {/* Events */}
      {events.map((ev: CalendarEvent) => {
        const { top, height } = getEventStyle(ev);
        return (
          <div
            key={ev.id}
            className="absolute left-0.5 right-0.5 rounded px-1 cursor-pointer hover:opacity-90 transition-opacity z-20 overflow-hidden"
            style={{ top, height, backgroundColor: ev.color, minHeight: 20 }}
            onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
          >
            <p className="text-[11px] font-medium text-white truncate leading-tight">{ev.title}</p>
            {height > 30 && <p className="text-[10px] text-white/70">{formatTime(ev.start)}</p>}
          </div>
        );
      })}
    </div>
  );
}
