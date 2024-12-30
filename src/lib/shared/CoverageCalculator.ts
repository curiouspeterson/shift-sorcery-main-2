import { CoverageStatus, ScheduleAssignment, Shift, CoverageRequirement, ShiftType } from '@/types/scheduling';
import { getShiftType } from './shiftUtils';

export class CoverageCalculator {
  public calculateCoverage(
    assignments: ScheduleAssignment[],
    shifts: Shift[],
    requirements: CoverageRequirement[]
  ): CoverageStatus {
    const coverage: CoverageStatus = {};
    
    const shiftTypes: ShiftType[] = ['Day Shift Early', 'Day Shift', 'Swing Shift', 'Graveyard'];
    
    shiftTypes.forEach(type => {
      coverage[type] = {
        required: this.getRequiredStaffForShiftType(requirements, type),
        assigned: this.getAssignedStaffForShiftType(assignments, shifts, type),
        isMet: false
      };
    });

    Object.keys(coverage).forEach(type => {
      coverage[type].isMet = coverage[type].assigned >= coverage[type].required;
    });

    return coverage;
  }

  public logCoverageStatus(coverage: CoverageStatus, date: string): void {
    console.log('Coverage status for', date);
    Object.entries(coverage).forEach(([type, status]) => {
      console.log(
        `${type}: ${status.assigned}/${status.required} (Minimum met: ${status.isMet})`
      );
    });
  }

  private getRequiredStaffForShiftType(
    requirements: CoverageRequirement[],
    shiftType: string
  ): number {
    return Math.max(
      0,
      ...requirements
        .filter(req => getShiftType(req.start_time) === shiftType)
        .map(req => req.min_employees)
    );
  }

  private getAssignedStaffForShiftType(
    assignments: ScheduleAssignment[],
    shifts: Shift[],
    shiftType: string
  ): number {
    return assignments.filter(assignment => {
      const shift = shifts.find(s => s.id === assignment.shift_id);
      return shift && getShiftType(shift.start_time) === shiftType;
    }).length;
  }
} 