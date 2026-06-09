import { create } from 'zustand';
import type { User } from '../types';
import api from '../lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  currentDepartment: string;     // current active dept; 'all' means all departments
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setCurrentDepartment: (dept: string) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: (() => {
    try {
      const u = localStorage.getItem('syncspace_user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  })(),
  token: localStorage.getItem('syncspace_token'),
  isLoading: false,
  currentDepartment: localStorage.getItem('syncspace_dept') || 'all',

  setUser: (user) => {
    set({ user });
    if (user) {
      localStorage.setItem('syncspace_user', JSON.stringify(user));
      // Default department: if not set to 'all', ensure it's valid
      const stored = localStorage.getItem('syncspace_dept') || 'all';
      const depts = user.departments || (user.department ? [user.department] : []);
      if (stored !== 'all' && depts.length > 0 && !depts.includes(stored)) {
        const newDept = depts.length === 1 ? depts[0] : 'all';
        set({ currentDepartment: newDept });
        localStorage.setItem('syncspace_dept', newDept);
      }
    } else {
      localStorage.removeItem('syncspace_user');
    }
  },

  setToken: (token) => {
    set({ token });
    if (token) localStorage.setItem('syncspace_token', token);
    else localStorage.removeItem('syncspace_token');
  },

  setCurrentDepartment: (dept) => {
    set({ currentDepartment: dept });
    localStorage.setItem('syncspace_dept', dept);
  },

  logout: () => {
    localStorage.removeItem('syncspace_token');
    localStorage.removeItem('syncspace_user');
    localStorage.removeItem('syncspace_dept');
    set({ user: null, token: null, currentDepartment: 'all' });
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/api/auth/me');
      const user = res.data as User;
      set({ user });
      localStorage.setItem('syncspace_user', JSON.stringify(user));
      // Normalise departments
      if (!user.departments || user.departments.length === 0) {
        if (user.department) {
          user.departments = [user.department];
        }
      }
    } catch {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },
}));
