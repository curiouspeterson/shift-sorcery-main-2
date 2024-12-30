import { Employee, EmployeeAvailability, Shift } from './types.ts';
import { isTimeWithinAvailability } from './shiftUtils.ts';

export class AvailabilityChecker {
  isEmployeeAvailable(
    employee: Employee,
    shift: Shift,
    availability: EmployeeAvailability[],
    dayOfWeek: number,
    assignedEmployees: Set<string>
  ): boolean {
    console.log(`\n🔍 Checking availability for ${employee.first_name} ${employee.last_name}`);

    if (assignedEmployees.has(employee.id)) {
      console.log(`❌ Already assigned today`);
      return false;
    }

    const employeeAvailability = availability.filter(a =>
      a.employee_id === employee.id &&
      a.day_of_week === dayOfWeek
    );

    if (employeeAvailability.length === 0) {
      console.log(`❌ No availability records for day ${dayOfWeek}`);
      return false;
    }

    console.log(`Found ${employeeAvailability.length} availability records`);

    const hasMatchingAvailability = employeeAvailability.some(avail => {
      if (avail.shift_id) {
        const matches = avail.shift_id === shift.id;
        console.log(matches
          ? `✅ Direct shift match found`
          : `❌ No direct shift match`
        );
        return matches;
      }

      const isAvailable = isTimeWithinAvailability(
        shift.start_time,
        shift.end_time,
        avail.start_time,
        avail.end_time
      );

      console.log(isAvailable
        ? `✅ Time range matches: ${avail.start_time}-${avail.end_time}`
        : `❌ Time range doesn't match: ${avail.start_time}-${avail.end_time}`
      );

      return isAvailable;
    });

    return hasMatchingAvailability;
  }
}