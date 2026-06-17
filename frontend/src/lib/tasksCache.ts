import { create } from 'zustand';
import api from './api';

interface TaskListEntry {
  tasks: any[];
  dashboard: any;
  projects: any[];
  loaded: boolean;
}

interface TasksCacheState {
  lists: Record<string, TaskListEntry>;
  fetchTasks: (filterKey: string, params: string) => Promise<TaskListEntry>;
  invalidate: (filterKey?: string) => void;
}

export const useTasksCache = create<TasksCacheState>((set, get) => ({
  lists: {},

  fetchTasks: async (filterKey, params) => {
    const cached = get().lists[filterKey];
    if (cached?.loaded) return cached;

    const [tasksRes, dashRes, projRes] = await Promise.all([
      api.get(`/api/tasks${params ? `?${params}` : ''}`),
      api.get('/api/tasks/dashboard'),
      api.get('/api/projects'),
    ]);

    const entry: TaskListEntry = {
      tasks: tasksRes.data,
      dashboard: dashRes.data,
      projects: projRes.data,
      loaded: true,
    };
    set(s => ({ lists: { ...s.lists, [filterKey]: entry } }));
    return entry;
  },

  // Pass filterKey to invalidate a specific filter combination, or omit to invalidate all
  invalidate: (filterKey?) => {
    if (filterKey !== undefined) {
      set(s => ({
        lists: { ...s.lists, [filterKey]: { ...s.lists[filterKey], loaded: false } },
      }));
    } else {
      set(s => ({
        lists: Object.fromEntries(
          Object.entries(s.lists).map(([k, v]) => [k, { ...v, loaded: false }])
        ),
      }));
    }
  },
}));
