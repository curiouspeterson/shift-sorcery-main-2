import { describe, it, expect, test } from 'vitest';
import { CoverageCalculator } from '../CoverageCalculator';
import type { ScheduleAssignment, Shift, CoverageRequirement } from '@/types/scheduling';

describe('CoverageCalculator', () => {
  const calculator = new CoverageCalculator();

  const mockShifts: Shift[] = [
    { id: '1', name: 'Early', start_time: '06:00', end_time: '14:00' },
    { id: '2', name: 'Day', start_time: '09:00', end_time: '17:00' },
    { id: '3', name: 'Swing', start_time: '16:00', end_time: '00:00' },
    { id: '4', name: 'Night', start_time: '22:00', end_time: '06:00' },
  ];

  const mockRequirements: CoverageRequirement[] = [
    { id: '1', start_time: '06:00', end_time: '14:00', min_employees: 3 },
    { id: '2', start_time: '09:00', end_time: '17:00', min_employees: 5 },
    { id: '3', start_time: '16:00', end_time: '00:00', min_employees: 4 },
    { id: '4', start_time: '22:00', end_time: '06:00', min_employees: 2 },
  ];

  const mockAssignments: ScheduleAssignment[] = [
    { schedule_id: '1', employee_id: '1', shift_id: '1', date: '2024-03-20' },
    { schedule_id: '1', employee_id: '2', shift_id: '1', date: '2024-03-20' },
    { schedule_id: '1', employee_id: '3', shift_id: '2', date: '2024-03-20' },
    { schedule_id: '1', employee_id: '4', shift_id: '3', date: '2024-03-20' },
  ];

  it('should calculate coverage correctly', () => {
    const coverage = calculator.calculateCoverage(
      mockAssignments,
      mockShifts,
      mockRequirements
    );

    expect(coverage['Day Shift Early'].required).toBe(3);
    expect(coverage['Day Shift Early'].assigned).toBe(2);
    expect(coverage['Day Shift Early'].isMet).toBe(false);

    expect(coverage['Day Shift'].required).toBe(5);
    expect(coverage['Day Shift'].assigned).toBe(1);
    expect(coverage['Day Shift'].isMet).toBe(false);
  });

  it('should handle empty assignments', () => {
    const coverage = calculator.calculateCoverage([], mockShifts, mockRequirements);
    
    Object.values(coverage).forEach(status => {
      expect(status.assigned).toBe(0);
      expect(status.isMet).toBe(false);
    });
  });
}); 