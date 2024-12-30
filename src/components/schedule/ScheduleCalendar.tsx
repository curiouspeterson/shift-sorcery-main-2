import { useEffect, useState } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { CoverageCalculator } from '@/lib/shared/CoverageCalculator';
import { format, addDays, startOfWeek, getDay, parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const COVERAGE_REQUIREMENTS = {
  EARLY_MORNING: { start: '05:00', end: '09:00', minStaff: 6 },
  DAY: { start: '09:00', end: '21:00', minStaff: 8 },
  EVENING: { start: '21:00', end: '01:00', minStaff: 7 },
  OVERNIGHT: { start: '01:00', end: '05:00', minStaff: 6 }
};

interface ScheduleCalendarProps {
  selectedDate: Date;
  onDateSelect?: (date: Date) => void;
  scheduleData: any;
  isLoading: boolean;
}

export function ScheduleCalendar({
  selectedDate,
  onDateSelect,
  scheduleData,
  isLoading
}: ScheduleCalendarProps) {
  const { updateCoverage } = useScheduleStore();
  const [employees, setEmployees] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  useErrorHandler();

  useEffect(() => {
    const fetchData = async () => {
      const { data: employeesData } = await supabase.from('profiles').select('*');
      const { data: availabilityData } = await supabase.from('employee_availability').select('*');
      const { data: shiftsData } = await supabase.from('shifts').select('*').order('start_time');
      
      if (employeesData) setEmployees(employeesData);
      if (availabilityData) setAvailability(availabilityData);
      if (shiftsData) setShifts(shiftsData);
    };
    fetchData();
  }, []);

  // Helper function to check staffing level for a time period
  const getStaffingLevel = (time: string, date: string, assignments: any[]) => {
    const timeDate = parseISO(`2000-01-01T${time}`);
    return assignments.filter(assignment => {
      const shiftStart = parseISO(`2000-01-01T${assignment.shift.start_time}`);
      let shiftEnd = parseISO(`2000-01-01T${assignment.shift.end_time}`);
      if (shiftEnd <= shiftStart) {
        shiftEnd = parseISO(`2000-01-02T${assignment.shift.end_time}`);
      }
      return assignment.date === date && 
             timeDate >= shiftStart && 
             timeDate <= shiftEnd;
    }).length;
  };

  // Helper function to check if staffing requirements are met
  const getStaffingRequirements = (date: string, assignments: any[]) => {
    const requirements = [];
    for (const [period, req] of Object.entries(COVERAGE_REQUIREMENTS)) {
      const staffLevel = getStaffingLevel(req.start, date, assignments);
      requirements.push({
        period,
        time: `${req.start}-${req.end}`,
        required: req.minStaff,
        actual: staffLevel,
        isMet: staffLevel >= req.minStaff
      });
    }
    return requirements;
  };

  // Helper function to check if an employee is available for a shift
  const isEmployeeAvailable = (employeeId: string, shift: any, date: string) => {
    const dayOfWeek = getDay(new Date(date));
    const employeeAvailability = availability.filter(a => 
      a.employee_id === employeeId && 
      a.day_of_week === dayOfWeek
    );

    // If no availability set for this day, consider as unavailable
    if (employeeAvailability.length === 0) return false;

    // Check if shift time falls within any availability window
    return employeeAvailability.some(a => {
      const availStart = new Date(`2000-01-01T${a.start_time}`);
      const availEnd = new Date(`2000-01-01T${a.end_time}`);
      const shiftStart = new Date(`2000-01-01T${shift.start_time}`);
      let shiftEnd = new Date(`2000-01-01T${shift.end_time}`);

      // Handle overnight shifts
      if (shiftEnd <= shiftStart) {
        shiftEnd = new Date(`2000-01-02T${shift.end_time}`);
      }

      return shiftStart >= availStart && shiftEnd <= availEnd;
    });
  };

  // Get available employees for a specific time period
  const getAvailableEmployeesForPeriod = (period: any, date: string) => {
    const relevantShifts = shifts.filter(shift => {
      const shiftStart = parseISO(`2000-01-01T${shift.start_time}`);
      let shiftEnd = parseISO(`2000-01-01T${shift.end_time}`);
      const periodStart = parseISO(`2000-01-01T${period.start}`);
      const periodEnd = parseISO(`2000-01-01T${period.end}`);
      
      if (shiftEnd <= shiftStart) {
        shiftEnd = parseISO(`2000-01-02T${shift.end_time}`);
      }

      return shiftStart <= periodEnd && shiftEnd >= periodStart;
    });

    return employees.filter(employee => 
      relevantShifts.some(shift => isEmployeeAvailable(employee.id, shift, date))
    );
  };

  // Get shifts that cover a specific time period
  const getShiftsForPeriod = (period: any) => {
    return shifts.filter(shift => {
      const shiftStart = parseISO(`2000-01-01T${shift.start_time}`);
      let shiftEnd = parseISO(`2000-01-01T${shift.end_time}`);
      const periodStart = parseISO(`2000-01-01T${period.start}`);
      const periodEnd = parseISO(`2000-01-01T${period.end}`);
      
      if (shiftEnd <= shiftStart) {
        shiftEnd = parseISO(`2000-01-02T${shift.end_time}`);
      }

      return shiftStart <= periodEnd && shiftEnd >= periodStart;
    });
  };

  const handleAddAssignment = async (date: string, shiftId: string) => {
    if (!selectedEmployee || !shiftId || isAdding) return;
    
    try {
      setIsAdding(true);
      const { error } = await supabase
        .from('schedule_assignments')
        .insert({
          schedule_id: scheduleData.id,
          employee_id: selectedEmployee,
          shift_id: shiftId,
          date: date
        });

      if (error) throw error;
      toast.success('Employee assigned successfully');
      setSelectedEmployee('');
      setSelectedShift('');
      // Trigger a refetch of the schedule data
      window.location.reload();
    } catch (error: any) {
      toast.error('Failed to assign employee: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      {/* Daily Assignments List */}
      <div className="space-y-4">
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayAssignments = scheduleData?.schedule_assignments?.filter(
            (a: any) => a.date === dateStr
          ) || [];

          return (
            <Card key={dateStr} className="p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="font-medium">{format(day, 'EEEE, MMM d')}</div>
                  </div>
                </div>
              </div>

              {/* Show assignments grouped by shift */}
              <div className="space-y-4">
                {shifts
                  .sort((a, b) => {
                    const timeA = parseISO(`2000-01-01T${a.start_time}`);
                    const timeB = parseISO(`2000-01-01T${b.start_time}`);
                    return timeA.getTime() - timeB.getTime();
                  })
                  .map(shift => {
                    const shiftAssignments = dayAssignments.filter((assignment: any) => 
                      assignment.shift_id === shift.id
                    );

                    if (shiftAssignments.length === 0) return null;

                    return (
                      <div key={shift.id} className="space-y-2">
                        <div className="text-sm font-medium">
                          {shift.name} ({format(parseISO(`2000-01-01T${shift.start_time}`), 'h:mm a')} - 
                          {format(parseISO(`2000-01-01T${shift.end_time}`), 'h:mm a')})
                        </div>
                        {shiftAssignments.map((assignment: any) => (
                          <div
                            key={assignment.id}
                            className="text-sm p-2 bg-secondary rounded-md ml-4"
                          >
                            {assignment.employee?.first_name} {assignment.employee?.last_name}
                          </div>
                        ))}
                      </div>
                    );
                  })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}