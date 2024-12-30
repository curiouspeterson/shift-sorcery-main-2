import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AvailabilityTestButtonProps {
  employeeId?: string;  // Make optional to support bulk mode
  isBulk?: boolean;     // Add flag for bulk operation
}

export function AvailabilityTestButton({ employeeId, isBulk = false }: AvailabilityTestButtonProps) {
  const queryClient = useQueryClient();

  // Fetch current availability if in single-employee mode
  const { data: currentAvailability } = useQuery({
    queryKey: ['availability', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('employee_availability')
        .select('*')
        .eq('employee_id', employeeId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId
  });

  const bulkTestAvailabilityMutation = useMutation({
    mutationFn: async () => {
      // Fetch all employees
      const { data: employees, error: employeesError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'employee');

      if (employeesError) throw employeesError;
      if (!employees?.length) throw new Error("No employees found");

      // Fetch all shifts
      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .order('start_time');

      if (shiftsError || !shifts?.length) throw new Error("No shifts available");

      // Delete all existing availability
      const { error: deleteError } = await supabase
        .from('employee_availability')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

      if (deleteError) throw deleteError;

      // Filter shifts by duration
      const tenHourShifts = shifts.filter(s => {
        const startHour = parseInt(s.start_time.split(':')[0]);
        const endHour = parseInt(s.end_time.split(':')[0]);
        const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
        return duration === 10;
      });

      const twelveHourShifts = shifts.filter(s => {
        const startHour = parseInt(s.start_time.split(':')[0]);
        const endHour = parseInt(s.end_time.split(':')[0]);
        const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
        return duration === 12;
      });

      const fourHourShifts = shifts.filter(s => {
        const startHour = parseInt(s.start_time.split(':')[0]);
        const endHour = parseInt(s.end_time.split(':')[0]);
        const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
        return duration === 4;
      });

      if (tenHourShifts.length === 0 || twelveHourShifts.length === 0 || fourHourShifts.length === 0) {
        throw new Error("Missing required shift durations");
      }

      // Create availability entries for all employees
      const availabilityEntries = [];

      for (const employee of employees) {
        // Randomly choose pattern for each employee
        const usesTenHourShifts = Math.random() < 0.5;
        const startDay = Math.floor(Math.random() * 4); // Random start day (0-3)

        if (usesTenHourShifts) {
          const selectedShift = tenHourShifts[Math.floor(Math.random() * tenHourShifts.length)];
          // Create 4 consecutive days of 10-hour shifts
          for (let i = 0; i < 4; i++) {
            availabilityEntries.push({
              employee_id: employee.id,
              day_of_week: (startDay + i) % 7,
              shift_id: selectedShift.id,
              start_time: selectedShift.start_time,
              end_time: selectedShift.end_time,
            });
          }
        } else {
          const selectedTwelveHourShift = twelveHourShifts[Math.floor(Math.random() * twelveHourShifts.length)];
          const selectedFourHourShift = fourHourShifts[Math.floor(Math.random() * fourHourShifts.length)];
          
          // Create 3 twelve-hour shifts
          for (let i = 0; i < 3; i++) {
            availabilityEntries.push({
              employee_id: employee.id,
              day_of_week: (startDay + i) % 7,
              shift_id: selectedTwelveHourShift.id,
              start_time: selectedTwelveHourShift.start_time,
              end_time: selectedTwelveHourShift.end_time,
            });
          }
          
          // Add one 4-hour shift
          availabilityEntries.push({
            employee_id: employee.id,
            day_of_week: (startDay + 3) % 7,
            shift_id: selectedFourHourShift.id,
            start_time: selectedFourHourShift.start_time,
            end_time: selectedFourHourShift.end_time,
          });
        }
      }

      // Insert all availability entries in batches
      const batchSize = 100;
      for (let i = 0; i < availabilityEntries.length; i += batchSize) {
        const batch = availabilityEntries.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('employee_availability')
          .insert(batch);

        if (insertError) throw insertError;
      }

      return { totalEmployees: employees.length, totalEntries: availabilityEntries.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast.success("Test availability created successfully", {
        description: `Added availability for ${result.totalEmployees} employees (${result.totalEntries} entries)`
      });
    },
    onError: (error: any) => {
      toast.error("Error creating test availability", {
        description: error.message,
      });
    },
  });

  const singleEmployeeTestAvailabilityMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("No employee ID provided");
      
      const { data: shifts } = await supabase
        .from('shifts')
        .select('*')
        .order('start_time');

      if (!shifts?.length) {
        throw new Error("No shifts available");
      }

      // Delete existing availability
      const { error: deleteError } = await supabase
        .from('employee_availability')
        .delete()
        .eq('employee_id', employeeId);

      if (deleteError) throw deleteError;

      // Determine current pattern
      const isCurrentlyTenHourPattern = currentAvailability?.length === 4;

      // Force opposite pattern of what's currently set
      // If no current availability, randomly choose
      const usesTenHourShifts = currentAvailability?.length === 0 
        ? Math.random() < 0.5 
        : !isCurrentlyTenHourPattern;

      // Get current start day
      const currentStartDay = currentAvailability?.length > 0
        ? Math.min(...currentAvailability.map(a => a.day_of_week))
        : -1;

      // Choose a different start day
      let startDay;
      do {
        startDay = Math.floor(Math.random() * 4); // Random start day (0-3)
      } while (startDay === currentStartDay);
      
      if (usesTenHourShifts) {
        // Find 10-hour shifts
        const tenHourShifts = shifts.filter(s => {
          const startHour = parseInt(s.start_time.split(':')[0]);
          const endHour = parseInt(s.end_time.split(':')[0]);
          const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
          return duration === 10;
        });
        
        if (tenHourShifts.length === 0) throw new Error("No 10-hour shifts available");

        // Choose a different shift if possible
        const currentShiftId = currentAvailability?.length > 0 ? currentAvailability[0].shift_id : null;
        let selectedShift;
        if (tenHourShifts.length > 1) {
          do {
            selectedShift = tenHourShifts[Math.floor(Math.random() * tenHourShifts.length)];
          } while (selectedShift.id === currentShiftId);
        } else {
          selectedShift = tenHourShifts[0];
        }
        
        // Create availability for 4 consecutive days
        const availabilityPromises = Array.from({ length: 4 }, (_, i) => {
          const dayOfWeek = (startDay + i) % 7;
          return supabase
            .from('employee_availability')
            .insert({
              employee_id: employeeId,
              day_of_week: dayOfWeek,
              shift_id: selectedShift.id,
              start_time: selectedShift.start_time,
              end_time: selectedShift.end_time,
            });
        });
        
        await Promise.all(availabilityPromises);
      } else {
        // Find 12-hour and 4-hour shifts
        const twelveHourShifts = shifts.filter(s => {
          const startHour = parseInt(s.start_time.split(':')[0]);
          const endHour = parseInt(s.end_time.split(':')[0]);
          const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
          return duration === 12;
        });
        
        const fourHourShifts = shifts.filter(s => {
          const startHour = parseInt(s.start_time.split(':')[0]);
          const endHour = parseInt(s.end_time.split(':')[0]);
          const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
          return duration === 4;
        });
        
        if (twelveHourShifts.length === 0 || fourHourShifts.length === 0) {
          throw new Error("Required shifts not available");
        }

        // Choose different shifts if possible
        const currentTwelveHourShiftId = currentAvailability?.find(a => {
          const startHour = parseInt(a.start_time.split(':')[0]);
          const endHour = parseInt(a.end_time.split(':')[0]);
          const duration = (endHour < startHour ? endHour + 24 : endHour) - startHour;
          return duration === 12;
        })?.shift_id;

        let selectedTwelveHourShift;
        if (twelveHourShifts.length > 1) {
          do {
            selectedTwelveHourShift = twelveHourShifts[Math.floor(Math.random() * twelveHourShifts.length)];
          } while (selectedTwelveHourShift.id === currentTwelveHourShiftId);
        } else {
          selectedTwelveHourShift = twelveHourShifts[0];
        }

        const selectedFourHourShift = fourHourShifts[Math.floor(Math.random() * fourHourShifts.length)];
        
        // Create availability for 3 twelve-hour shifts and 1 four-hour shift
        const availabilityPromises = [
          // Three 12-hour shifts
          ...Array.from({ length: 3 }, (_, i) => {
            const dayOfWeek = (startDay + i) % 7;
            return supabase
              .from('employee_availability')
              .insert({
                employee_id: employeeId,
                day_of_week: dayOfWeek,
                shift_id: selectedTwelveHourShift.id,
                start_time: selectedTwelveHourShift.start_time,
                end_time: selectedTwelveHourShift.end_time,
              });
          }),
          // One 4-hour shift
          supabase
            .from('employee_availability')
            .insert({
              employee_id: employeeId,
              day_of_week: (startDay + 3) % 7,
              shift_id: selectedFourHourShift.id,
              start_time: selectedFourHourShift.start_time,
              end_time: selectedFourHourShift.end_time,
            })
        ];

        await Promise.all(availabilityPromises);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', employeeId] });
      toast.success("Test availability created successfully");
    },
    onError: (error: any) => {
      toast.error("Error creating test availability", {
        description: error.message,
      });
    },
  });

  const mutation = isBulk ? bulkTestAvailabilityMutation : singleEmployeeTestAvailabilityMutation;
  const isPending = mutation.isPending;

  return (
    <Button 
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={isPending}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {isBulk ? "Adding Test Availability..." : "Adding..."}
        </>
      ) : (
        isBulk ? "Add Test Availability (All)" : "Test Availability"
      )}
    </Button>
  );
}