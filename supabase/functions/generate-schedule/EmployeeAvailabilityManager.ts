import { SCHEDULING_CONSTANTS } from './constants.ts';
import { isTimeOverlapping } from './ShiftUtils.ts';

export class EmployeeAvailabilityManager {
  public getAvailableEmployees(
    employees: any[],
    availability: any[],
    dayOfWeek: number,
    shifts: any[],
    weeklyHoursTracker: any
  ): any[] {
    console.log(`\n🔍 Finding available employees for day ${dayOfWeek}`);
    
    return employees.filter(employee => {
      // Get employee's availability for this day
      const employeeAvailability = availability.filter(a => 
        a.employee_id === employee.id &&
        a.day_of_week === dayOfWeek
      );

      if (employeeAvailability.length === 0) {
        console.log(`❌ ${employee.first_name} ${employee.last_name}: No availability for this day`);
        return false;
      }

      // Check if any of the shifts overlap with employee's availability
      const hasMatchingShift = shifts.some(shift => 
        employeeAvailability.some(avail => 
          isTimeOverlapping(
            shift.start_time,
            shift.end_time,
            avail.start_time,
            avail.end_time
          )
        )
      );

      if (!hasMatchingShift) {
        console.log(`❌ ${employee.first_name} ${employee.last_name}: No matching shifts`);
        return false;
      }

      // Check if employee hasn't exceeded weekly hours
      const currentHours = weeklyHoursTracker.getCurrentHours(employee.id);
      const withinHoursLimit = currentHours < SCHEDULING_CONSTANTS.MAX_HOURS_PER_WEEK;

      if (!withinHoursLimit) {
        console.log(`❌ ${employee.first_name} ${employee.last_name}: Exceeds weekly hours (${currentHours}/${SCHEDULING_CONSTANTS.MAX_HOURS_PER_WEEK})`);
        return false;
      }

      console.log(`✅ ${employee.first_name} ${employee.last_name}: Available (${currentHours} hours worked)`);
      return true;
    });
  }

  public canAssignShift(
    employee: any,
    shift: any,
    dailyTracker: any,
    weeklyHoursTracker: any
  ): boolean {
    console.log(`\n🔍 Checking if ${employee.first_name} ${employee.last_name} can be assigned to ${shift.name}`);

    // Check if employee is already assigned for this day
    if (dailyTracker.isEmployeeAssignedToday(employee.id)) {
      console.log(`❌ Already assigned today`);
      return false;
    }

    // Check weekly hours limit
    const shiftHours = this.getShiftDuration(shift);
    const currentHours = weeklyHoursTracker.getCurrentHours(employee.id);
    if ((currentHours + shiftHours) > SCHEDULING_CONSTANTS.MAX_HOURS_PER_WEEK) {
      console.log(`❌ Would exceed weekly hours limit (${currentHours} + ${shiftHours} > ${SCHEDULING_CONSTANTS.MAX_HOURS_PER_WEEK})`);
      return false;
    }

    console.log(`✅ Can be assigned (${currentHours} current hours + ${shiftHours} shift hours)`);
    return true;
  }

  private getShiftDuration(shift: any): number {
    const startHour = parseInt(shift.start_time.split(':')[0]);
    const endHour = parseInt(shift.end_time.split(':')[0]);
    return endHour < startHour ? (endHour + 24) - startHour : endHour - startHour;
  }
}