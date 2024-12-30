export type ShiftType = 'Day Shift Early' | 'Day Shift' | 'Swing Shift' | 'Graveyard';

export interface CoverageRequirement {
  id: string;
  start_time: string;
  end_time: string;
  min_employees: number;
  max_employees?: number;
}

export interface CoverageStatus {
  [key: string]: {
    required: number;
    assigned: number;
    isMet: boolean;
  };
}

export interface ScheduleAssignment {
  schedule_id: string;
  employee_id: string;
  shift_id: string;
  date: string;
}

export interface SchedulingResult {
  success: boolean;
  assignments: ScheduleAssignment[];
  coverage: CoverageStatus;
  messages: string[];
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  weekly_hours_limit: number;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  max_employees?: number;
}