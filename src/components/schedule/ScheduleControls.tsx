import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, parseISO, getDay } from "date-fns";
import { generateScheduleForWeek, publishSchedule } from "@/utils/shiftUtils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ScheduleStatusDisplay } from "./controls/ScheduleStatusDisplay";
import { DraftNotice } from "./controls/DraftNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CalendarClock, Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COVERAGE_REQUIREMENTS = {
  EARLY_MORNING: { start: '05:00', end: '09:00', minStaff: 6 },
  DAY: { start: '09:00', end: '21:00', minStaff: 8 },
  EVENING: { start: '21:00', end: '01:00', minStaff: 7 },
  OVERNIGHT: { start: '01:00', end: '05:00', minStaff: 6 }
};

interface ScheduleControlsProps {
  selectedDate: Date;
  userId: string;
  onScheduleGenerated: () => void;
  scheduleData?: any;
  isLoading?: boolean;
}

export function ScheduleControls({
  selectedDate,
  userId,
  onScheduleGenerated,
  scheduleData,
  isLoading = false
}: ScheduleControlsProps) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

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

  const handleGenerateSchedule = async () => {
    console.log('🎯 Generate schedule clicked', {
      selectedDate: format(selectedDate, 'yyyy-MM-dd'),
      userId
    });

    try {
      setIsGenerating(true);

      // If there's an existing schedule, delete it first
      if (scheduleData?.id) {
        console.log('🗑️ Deleting existing schedule:', scheduleData.id);
        const { error: deleteError } = await supabase
          .from('schedules')
          .delete()
          .eq('id', scheduleData.id);

        if (deleteError) throw deleteError;
      }

      // Generate new schedule
      await generateScheduleForWeek(selectedDate, userId);
      await queryClient.invalidateQueries({ 
        queryKey: ["schedule", format(selectedDate, "yyyy-MM-dd")] 
      });
      onScheduleGenerated();
      
      toast.success("Schedule generated successfully", {
        description: `Draft schedule created for week of ${format(startOfWeek(selectedDate), "MMM d, yyyy")}`
      });
    } catch (error: any) {
      console.error('❌ Schedule generation failed:', error);
      toast.error("Failed to generate schedule: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishSchedule = async () => {
    if (!scheduleData?.id) {
      toast.error("No schedule to publish");
      return;
    }

    try {
      // Update the schedule status in the database
      const { error } = await supabase
        .from('schedules')
        .update({ status: 'published' })
        .eq('id', scheduleData.id);

      if (error) throw error;

      // Invalidate the query to trigger a refetch
      await queryClient.invalidateQueries({ 
        queryKey: ["schedule", format(selectedDate, "yyyy-MM-dd")] 
      });
      
      // Trigger a refetch of the schedule data
      onScheduleGenerated();

      toast.success("Schedule published successfully", {
        description: "All employees will be notified of their shifts."
      });
    } catch (error: any) {
      console.error('❌ Schedule publication failed:', error);
      toast.error("Failed to publish schedule: " + error.message);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!scheduleData?.id) {
      toast.error("No schedule to delete");
      return;
    }

    try {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleData.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast.success("Schedule deleted successfully");
    } catch (error: any) {
      console.error('❌ Schedule deletion failed:', error);
      toast.error("Failed to delete schedule: " + error.message);
    }
  };

  // Helper function to check if an employee is available for a shift
  const isEmployeeAvailable = (employeeId: string, shift: any, date: string) => {
    const dayOfWeek = getDay(new Date(date));
    const employeeAvailability = availability.filter(a => 
      a.employee_id === employeeId && 
      a.day_of_week === dayOfWeek
    );

    if (employeeAvailability.length === 0) return false;

    return employeeAvailability.some(a => {
      const availStart = new Date(`2000-01-01T${a.start_time}`);
      const availEnd = new Date(`2000-01-01T${a.end_time}`);
      const shiftStart = new Date(`2000-01-01T${shift.start_time}`);
      let shiftEnd = new Date(`2000-01-01T${shift.end_time}`);

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
      await queryClient.invalidateQueries({ 
        queryKey: ["schedule", format(selectedDate, "yyyy-MM-dd")] 
      });
      onScheduleGenerated();
    } catch (error: any) {
      toast.error('Failed to assign employee: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    );
  }

  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ScheduleStatusDisplay 
          status={scheduleData?.status} 
          onDelete={handleDeleteSchedule} 
        />
        <div className="space-x-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <CalendarClock className="mr-2 h-4 w-4" />
                    {scheduleData?.id ? 'Regenerate Schedule' : 'Generate Schedule'}
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {scheduleData?.id ? 'Regenerate Schedule?' : 'Generate Schedule?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {scheduleData?.id 
                    ? 'This will delete the existing schedule and generate a new one. This action cannot be undone.'
                    : 'This will generate a new schedule for the selected week.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleGenerateSchedule}>
                  {scheduleData?.id ? 'Regenerate' : 'Generate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {scheduleData?.status === 'draft' && (
            <Button onClick={handlePublishSchedule} variant="secondary">
              Publish Schedule
            </Button>
          )}
        </div>
      </div>

      {scheduleData?.status === 'draft' && <DraftNotice />}

      {/* Staffing Requirements Overview */}
      {scheduleData?.id && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-semibold">Daily Coverage Requirements</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {weekDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayAssignments = scheduleData?.schedule_assignments?.filter(
                (a: any) => a.date === dateStr
              ) || [];
              const staffingReqs = getStaffingRequirements(dateStr, dayAssignments);

              return (
                <Card key={dateStr} className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium">{format(day, 'EEEE, MMM d')}</h4>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Employee to {format(day, 'EEEE, MMM d')}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <Select
                            value={selectedShift}
                            onValueChange={setSelectedShift}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a shift" />
                            </SelectTrigger>
                            <SelectContent>
                              {shifts.map((shift) => (
                                <SelectItem key={shift.id} value={shift.id}>
                                  {shift.name} ({format(parseISO(`2000-01-01T${shift.start_time}`), 'h:mm a')} - 
                                  {format(parseISO(`2000-01-01T${shift.end_time}`), 'h:mm a')})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedShift && (
                            <Select
                              value={selectedEmployee}
                              onValueChange={setSelectedEmployee}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an employee" />
                              </SelectTrigger>
                              <SelectContent>
                                {employees
                                  .filter(emp => isEmployeeAvailable(emp.id, shifts.find(s => s.id === selectedShift), dateStr))
                                  .map((employee) => (
                                    <SelectItem key={employee.id} value={employee.id}>
                                      {employee.first_name} {employee.last_name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Button 
                            className="w-full"
                            disabled={!selectedEmployee || !selectedShift || isAdding}
                            onClick={() => handleAddAssignment(dateStr, selectedShift)}
                          >
                            {isAdding ? 'Adding...' : 'Add to Shift'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-2">
                    {staffingReqs.map((req) => (
                      <div key={req.period} className="text-sm">
                        <div className="flex justify-between items-center">
                          <span>{req.time}</span>
                          <span className={req.isMet ? 'text-green-500' : 'text-red-500'}>
                            {req.actual}/{req.required}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}