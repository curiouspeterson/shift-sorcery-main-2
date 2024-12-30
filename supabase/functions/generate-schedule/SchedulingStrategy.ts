import { format } from 'https://esm.sh/date-fns@3.3.1';
import { ShiftAssignmentManager } from './ShiftAssignmentManager.ts';
import { ShiftRequirementsManager } from './ShiftRequirementsManager.ts';
import { EmployeeScoring } from './EmployeeScoring.ts';
import { ShiftTypeManager } from './ShiftTypeManager.ts';
import { EmployeeAvailabilityManager } from './EmployeeAvailabilityManager.ts';
import { SCHEDULING_CONSTANTS } from './constants.ts';

export class SchedulingStrategy {
  private employeeScoring: EmployeeScoring;
  private shiftTypeManager: ShiftTypeManager;
  private employeeAvailabilityManager: EmployeeAvailabilityManager;

  constructor(
    private assignmentManager: ShiftAssignmentManager,
    private requirementsManager: ShiftRequirementsManager
  ) {
    this.employeeScoring = new EmployeeScoring(assignmentManager.getWeeklyHoursTracker());
    this.shiftTypeManager = new ShiftTypeManager();
    this.employeeAvailabilityManager = new EmployeeAvailabilityManager();
  }

  public async assignShiftsForDay(
    currentDate: string,
    data: any,
    scheduleId: string
  ): Promise<boolean> {
    console.log(`\n=== Processing ${format(new Date(currentDate), 'EEEE, MMM d')} ===`);
    
    const dayOfWeek = new Date(currentDate).getDay();
    const shifts = this.shiftTypeManager.groupAndSortShiftsByPriority(data.shifts);
    let overallSuccess = true;
    let totalAssigned = 0;
    let totalRequired = 0;

    // Sort shift types by required staff (highest first)
    const sortedShiftTypes = Object.entries(shifts).sort((a, b) => {
      const reqA = this.requirementsManager.getRequiredStaffForShiftType(a[0]);
      const reqB = this.requirementsManager.getRequiredStaffForShiftType(b[0]);
      return reqB - reqA;
    });

    // Process each shift type
    for (const [shiftType, typeShifts] of sortedShiftTypes) {
      console.log(`\nProcessing ${shiftType} shifts...`);
      
      const required = this.requirementsManager.getRequiredStaffForShiftType(shiftType);
      console.log(`Required staff for ${shiftType}: ${required}`);
      
      const assigned = await this.assignShiftType(
        shiftType,
        typeShifts as any[],
        data.employees,
        data.availability,
        scheduleId,
        currentDate,
        dayOfWeek,
        required
      );
      
      totalAssigned += assigned;
      totalRequired += required;
      
      if (assigned < required) {
        console.log(`Warning: Could not fully staff ${shiftType} for ${currentDate}`);
        console.log(`Assigned: ${assigned}, Required: ${required}`);
        overallSuccess = false;
      }
    }

    const staffingPercentage = (totalAssigned / totalRequired) * 100;
    console.log(`Overall staffing for ${currentDate}: ${staffingPercentage.toFixed(1)}% (${totalAssigned}/${totalRequired})`);
    
    return staffingPercentage >= SCHEDULING_CONSTANTS.MIN_STAFF_PERCENTAGE;
  }

  private async assignShiftType(
    shiftType: string,
    shifts: any[],
    employees: any[],
    availability: any[],
    scheduleId: string,
    currentDate: string,
    dayOfWeek: number,
    required: number
  ): Promise<number> {
    console.log(`\n🎯 Assigning ${shiftType} - Need ${required} employees`);

    if (required === 0) return 0;

    let assigned = 0;
    let availableEmployees = this.employeeAvailabilityManager.getAvailableEmployees(
      employees,
      availability,
      dayOfWeek,
      shifts,
      this.assignmentManager.getWeeklyHoursTracker()
    );

    console.log(`Found ${availableEmployees.length} available employees for ${shiftType}`);

    // Sort shifts by duration and required staff (longer shifts and higher requirements first)
    const sortedShifts = [...shifts].sort((a, b) => {
      const getDuration = (shift: any) => {
        const startHour = parseInt(shift.start_time.split(':')[0]);
        const endHour = parseInt(shift.end_time.split(':')[0]);
        return endHour < startHour ? (endHour + 24) - startHour : endHour - startHour;
      };
      return getDuration(b) - getDuration(a);
    });

    // Try multiple passes with different strategies
    for (let pass = 1; pass <= 2 && assigned < required; pass++) {
      console.log(`\n📋 Pass ${pass} for ${shiftType}`);

      for (const shift of sortedShifts) {
        if (assigned >= required) break;

        console.log(`\n📋 Processing shift: ${shift.name} (${shift.start_time}-${shift.end_time})`);
        
        // On second pass, try to assign any remaining employees
        if (pass === 2) {
          availableEmployees = this.employeeAvailabilityManager.getAvailableEmployees(
            employees,
            availability,
            dayOfWeek,
            [shift],
            this.assignmentManager.getWeeklyHoursTracker()
          );
        }

        const sortedEmployees = this.rankEmployees(availableEmployees, shift, currentDate);
        
        // Try all available employees for this shift
        for (const employee of sortedEmployees) {
          if (assigned >= required) break;

          const canAssign = this.employeeAvailabilityManager.canAssignShift(
            employee,
            shift,
            this.assignmentManager,
            this.assignmentManager.getWeeklyHoursTracker()
          );

          if (canAssign) {
            console.log(`✅ Assigning ${employee.first_name} ${employee.last_name} to ${shift.name}`);
            this.assignmentManager.assignShift(scheduleId, employee, shift, currentDate);
            assigned++;
            
            // Remove assigned employee from available pool
            const index = availableEmployees.findIndex(e => e.id === employee.id);
            if (index > -1) {
              availableEmployees.splice(index, 1);
            }
          } else {
            console.log(`❌ Cannot assign ${employee.first_name} ${employee.last_name} to ${shift.name}`);
          }
        }
      }
    }

    const staffingPercentage = (assigned / required) * 100;
    console.log(`\n📊 Staffing level for ${shiftType}: ${staffingPercentage.toFixed(1)}% (${assigned}/${required})`);
    
    if (assigned < required) {
      console.log(`⚠️ Warning: Could not meet staffing requirements for ${shiftType}`);
      console.log(`Missing ${required - assigned} assignments`);
    }
    
    return assigned;
  }

  private rankEmployees(
    employees: any[],
    shift: any,
    currentDate: string,
  ): any[] {
    return [...employees].sort((a, b) => {
      const scoreA = this.employeeScoring.scoreEmployee(a, shift, currentDate, this.assignmentManager.getAssignments(), shift.shift_type);
      const scoreB = this.employeeScoring.scoreEmployee(b, shift, currentDate, this.assignmentManager.getAssignments(), shift.shift_type);
      return scoreB - scoreA;
    });
  }
}