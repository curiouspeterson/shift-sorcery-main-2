import { Employee, Shift, ScheduleAssignment, EmployeeAvailability } from './types.ts';
import { AvailabilityChecker } from './AvailabilityChecker.ts';
import { ShiftAssignmentHandler } from './ShiftAssignmentHandler.ts';
import { ShiftTypeManager } from './ShiftTypeManager.ts';

export class ShiftDistributor {
  private shiftTypeManager: ShiftTypeManager;
  private availabilityChecker: AvailabilityChecker;
  private assignmentHandler: ShiftAssignmentHandler;

  constructor() {
    this.shiftTypeManager = new ShiftTypeManager();
    this.availabilityChecker = new AvailabilityChecker();
    this.assignmentHandler = new ShiftAssignmentHandler();
  }

  distributeShifts(
    date: string,
    scheduleId: string,
    employees: Employee[],
    shifts: Shift[],
    availability: EmployeeAvailability[]
  ): ScheduleAssignment[] {
    console.log(`\n🔄 Starting shift distribution for date: ${date}`);
    console.log(`Found ${employees.length} total employees`);
    console.log('Employee pool:', employees.map(e => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      hoursLimit: e.weekly_hours_limit
    })));

    const assignments: ScheduleAssignment[] = [];
    const dayOfWeek = new Date(date).getDay();
    const assignedEmployees = new Set<string>();

    // Group and sort shifts by priority
    const sortedShifts = this.shiftTypeManager.groupAndSortShiftsByPriority(shifts);

    // Process each group of shifts
    for (const shiftType in sortedShifts) {
      const shiftsOfType = sortedShifts[shiftType];
      console.log(`\n📋 Shifts to process for ${shiftType}:`, shiftsOfType.map(s => ({
        name: s.name,
        time: `${s.start_time}-${s.end_time}`,
        required: s.max_employees || 1,
        type: s.shift_type
      })));

      for (const shift of shiftsOfType) {
        console.log(`\n🔍 Processing shift: ${shift.name}`);
        console.log(`Time: ${shift.start_time}-${shift.end_time}`);
        console.log(`Required employees: ${shift.max_employees || 1}`);

        // Get available employees for this shift
        const availableEmployees = employees.filter(employee => {
          const isAvailable = this.availabilityChecker.isEmployeeAvailable(
            employee,
            shift,
            availability,
            dayOfWeek,
            assignedEmployees
          );

          if (!isAvailable) {
            console.log(`❌ ${employee.first_name} ${employee.last_name} not available because:`);
            if (assignedEmployees.has(employee.id)) {
              console.log('  - Already assigned today');
            } else {
              const hasMatchingAvailability = availability.some(a =>
                a.employee_id === employee.id &&
                a.day_of_week === dayOfWeek
              );
              if (!hasMatchingAvailability) {
                console.log('  - No availability record for this day');
              } else {
                console.log('  - Availability times do not match shift times');
              }
            }
          }

          return isAvailable;
        });

        console.log(`\n👥 Found ${availableEmployees.length} available employees for shift ${shift.name}`);
        if (availableEmployees.length > 0) {
          console.log('Available employees:', availableEmployees.map(e =>
            `${e.first_name} ${e.last_name}`
          ));
        }

        // Assign employees to the shift
        const shiftAssignments = this.assignmentHandler.assignEmployeesToShift(
          availableEmployees,
          shift,
          scheduleId,
          date,
          assignments,
          assignedEmployees
        );

        assignments.push(...shiftAssignments);
        console.log(`✅ Assigned ${shiftAssignments.length} employees to ${shift.name}`);
      }
    }

    console.log(`\n📊 Final assignments for ${date}:`, {
      totalAssignments: assignments.length,
      uniqueEmployees: new Set(assignments.map(a => a.employee_id)).size
    });

    return assignments;
  }
}