import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ScheduleAssignment, CoverageStatus, Employee, Shift } from '../types/scheduling';
import { supabase } from '../lib/supabase';
import { startOfWeek } from "date-fns";

interface ScheduleState {
  assignments: ScheduleAssignment[];
  coverage: CoverageStatus | null;
  employees: Employee[];
  shifts: Shift[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchAssignments: (scheduleId: string) => Promise<void>;
  fetchEmployees: () => Promise<void>;
  fetchShifts: () => Promise<void>;
  addAssignment: (assignment: ScheduleAssignment) => Promise<void>;
  removeAssignment: (assignmentId: string) => Promise<void>;
  updateCoverage: (coverage: CoverageStatus) => void;
  clearError: () => void;
}

export const useScheduleStore = create<ScheduleState>()(
  devtools(
    persist(
      (set, get) => ({
        assignments: [],
        coverage: null,
        employees: [],
        shifts: [],
        isLoading: false,
        error: null,

        fetchAssignments: async (scheduleId: string) => {
          set({ isLoading: true, error: null });
          try {
            const { data, error } = await supabase
              .from('schedule_assignments')
              .select('*')
              .eq('schedule_id', scheduleId);

            if (error) throw error;
            set({ assignments: data || [] });
          } catch (error) {
            set({ error: error.message });
          } finally {
            set({ isLoading: false });
          }
        },

        fetchEmployees: async () => {
          set({ isLoading: true, error: null });
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('role', 'employee');

            if (error) throw error;
            set({ employees: data || [] });
          } catch (error) {
            set({ error: error.message });
          } finally {
            set({ isLoading: false });
          }
        },

        fetchShifts: async () => {
          set({ isLoading: true, error: null });
          try {
            const { data, error } = await supabase
              .from('shifts')
              .select('*');

            if (error) throw error;
            set({ shifts: data || [] });
          } catch (error) {
            set({ error: error.message });
          } finally {
            set({ isLoading: false });
          }
        },

        addAssignment: async (assignment: ScheduleAssignment) => {
          set({ isLoading: true, error: null });
          try {
            const { error } = await supabase
              .from('   schedule_assignments')
              .insert([assignment]);

            if (error) throw error;
            set(state => ({
              assignments: [...state.assignments, assignment]
            }));
          } catch (error) {
            set({ error: error.message });
          } finally {
            set({ isLoading: false });
          }
        },

        removeAssignment: async (assignmentId: string) => {
          set({ isLoading: true, error: null });
          try {
            const { error } = await supabase
              .from('schedule_assignments')
              .delete()
              .eq('schedule_id', assignmentId);

            if (error) throw error;
            set(state => ({
              assignments: state.assignments.filter(a => a.schedule_id !== assignmentId)
            }));
          } catch (error) {
            set({ error: error.message });
          } finally {
            set({ isLoading: false });
          }
        },

        updateCoverage: (coverage: CoverageStatus) => {
          set({ coverage });
        },

        clearError: () => {
          set({ error: null });
        },
      }),
      {
        name: 'schedule-store',
        partialize: (state) => ({
          assignments: state.assignments,
          employees: state.employees,
          shifts: state.shifts,
        }),
      }
    )
  )
); 