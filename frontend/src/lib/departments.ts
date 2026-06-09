import { create } from 'zustand';
import api from './api';

interface DepartmentsState {
  departments: string[];
  loaded: boolean;
  fetch: () => Promise<void>;
}

export const useDepartmentsStore = create<DepartmentsState>(set => ({
  departments: [
    'Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Finance',
    'HR', 'Operations', 'Legal', 'Customer Success', 'Executive',
  ],
  loaded: false,
  fetch: async () => {
    try {
      const res = await api.get('/api/auth/departments');
      if (Array.isArray(res.data)) {
        set({ departments: res.data, loaded: true });
      }
    } catch {
      // Keep defaults
      set({ loaded: true });
    }
  },
}));
