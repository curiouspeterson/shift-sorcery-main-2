import { Shift, ShiftType, CoverageRequirement } from '@/types/scheduling';

export function getShiftType(startTime: string): ShiftType {
  const hour = parseInt(startTime.split(':')[0]);
  
  if (hour >= 4 && hour < 8) return "Day Shift Early";
  if (hour >= 8 && hour < 16) return "Day Shift";
  if (hour >= 16 && hour < 22) return "Swing Shift";
  return "Graveyard";
}

export function getShiftDuration(shift: Shift): number {
  const start = new Date(`2000-01-01T${shift.start_time}`);
  let end = new Date(`2000-01-01T${shift.end_time}`);
  
  if (end < start) {
    end = new Date(`2000-01-02T${shift.end_time}`);
  }
  
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

export function doesShiftCoverPeriod(shift: Shift, requirement: CoverageRequirement): boolean {
  const shiftStart = new Date(`2000-01-01T${shift.start_time}`).getTime();
  const shiftEnd = new Date(`2000-01-01T${shift.end_time}`).getTime();
  const reqStart = new Date(`2000-01-01T${requirement.start_time}`).getTime();
  const reqEnd = new Date(`2000-01-01T${requirement.end_time}`).getTime();

  if (reqEnd < reqStart) {
    return (shiftStart <= reqEnd || shiftStart >= reqStart) &&
           (shiftEnd <= reqEnd || shiftEnd >= reqStart);
  }

  return shiftStart <= reqEnd && shiftEnd >= reqStart;
} 