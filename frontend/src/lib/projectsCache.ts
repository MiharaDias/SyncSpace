import { create } from 'zustand';
import api from './api';

interface ProjectDetailEntry {
  project: any;
  tasks: any[];
  statuses: any[];
  members: any[];
  loaded: boolean;
}

interface ProjectListEntry {
  projects: any[];
  overview: any;
  loaded: boolean;
}

interface ProjectsCacheState {
  lists: Record<string, ProjectListEntry>;
  details: Record<string, ProjectDetailEntry>;
  fetchList: (department: string) => Promise<{ projects: any[]; overview: any }>;
  fetchDetail: (projectId: string) => Promise<ProjectDetailEntry>;
  invalidateList: (department?: string) => void;
  invalidateDetail: (projectId: string) => void;
}

export const useProjectsCache = create<ProjectsCacheState>((set, get) => ({
  lists: {},
  details: {},

  fetchList: async (department) => {
    const key = department && department !== 'all' ? department : '__all__';
    const cached = get().lists[key];
    if (cached?.loaded) return { projects: cached.projects, overview: cached.overview };

    const params = new URLSearchParams();
    if (department && department !== 'all') params.set('department', department);
    const qs = params.toString() ? `?${params}` : '';

    const [projRes, overviewRes] = await Promise.all([
      api.get(`/api/projects${qs}`),
      api.get(`/api/projects/analytics/overview${qs}`).catch(() => ({ data: null })),
    ]);

    set(s => ({
      lists: {
        ...s.lists,
        [key]: { projects: projRes.data, overview: overviewRes.data, loaded: true },
      },
    }));
    return { projects: projRes.data, overview: overviewRes.data };
  },

  fetchDetail: async (projectId) => {
    const cached = get().details[projectId];
    if (cached?.loaded) return cached;

    const [projRes, tasksRes, statusRes, membersRes] = await Promise.all([
      api.get(`/api/projects/${projectId}`),
      api.get(`/api/tasks?project_id=${projectId}`),
      api.get(`/api/projects/${projectId}/statuses`),
      api.get(`/api/projects/${projectId}/members`),
    ]);

    const entry: ProjectDetailEntry = {
      project: projRes.data,
      tasks: tasksRes.data,
      statuses: statusRes.data,
      members: membersRes.data,
      loaded: true,
    };
    set(s => ({ details: { ...s.details, [projectId]: entry } }));
    return entry;
  },

  // Pass department to invalidate a specific list, or omit to invalidate all lists
  invalidateList: (department?) => {
    if (department !== undefined) {
      const key = department && department !== 'all' ? department : '__all__';
      set(s => ({
        lists: { ...s.lists, [key]: { ...s.lists[key], loaded: false } },
      }));
    } else {
      set(s => ({
        lists: Object.fromEntries(
          Object.entries(s.lists).map(([k, v]) => [k, { ...v, loaded: false }])
        ),
      }));
    }
  },

  invalidateDetail: (projectId) => {
    set(s => ({
      details: {
        ...s.details,
        [projectId]: s.details[projectId]
          ? { ...s.details[projectId], loaded: false }
          : { project: null, tasks: [], statuses: [], members: [], loaded: false },
      },
    }));
  },
}));
