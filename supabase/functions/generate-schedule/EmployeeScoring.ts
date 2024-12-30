export class EmployeeScoring {
  constructor(private weeklyHoursTracker: any) {}

  public scoreEmployee(
    employee: any,
    shift: any,
    currentDate: string,
    assignments: any[],
    shiftType?: string
  ): number {
    let score = 100;

    // Prefer employees with fewer hours assigned
    const currentHours = this.weeklyHoursTracker.getCurrentHours(employee.id);
    score -= currentHours * 2; // Decrease score more for higher hours

    // Prefer employees who haven't worked recently
    const recentAssignments = assignments.filter(a => 
      a.employee_id === employee.id &&
      new Date(a.date) <= new Date(currentDate)
    );
    score -= recentAssignments.length * 5;

    // If shift type is provided, prefer employees who work this type
    if (shiftType && employee.preferred_shift_type === shiftType) {
      score += 20;
    }

    return Math.max(0, score); // Ensure score doesn't go negative
  }
}