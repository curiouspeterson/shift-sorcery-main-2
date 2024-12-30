import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { supabase } from "@/lib/supabase";
import { ScheduleCalendar } from "./schedule/ScheduleCalendar";
import { ScheduleControls } from "./schedule/ScheduleControls";
import { ScheduleHeader } from "./schedule/ScheduleHeader";
import { Card, CardContent, CardHeader } from "./ui/card";
import { toast } from "sonner";
import { ErrorBoundary } from "./schedule/ErrorBoundary";

export function ScheduleGenerator() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [userId, setUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    fetchUserId();
  }, []);

  const { data: scheduleData, isLoading, refetch } = useQuery({
    queryKey: ["schedule", format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekStart = startOfWeek(selectedDate);
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return null;

      try {
        console.log('🔍 Fetching schedule for week:', weekStartStr);
        
        // First fetch the schedule with all fields
        const { data: schedule, error: scheduleError } = await supabase
          .from("schedules")
          .select("*, created_by")
          .eq("week_start_date", weekStartStr)
          .maybeSingle();

        if (scheduleError) {
          console.error("Error fetching schedule:", scheduleError);
          throw scheduleError;
        }

        if (!schedule) {
          console.log('📅 No schedule found for week:', weekStartStr);
          return { status: 'not_generated' };
        }

        console.log('📅 Found schedule:', schedule);

        // Then fetch assignments with related data
        const { data: assignments, error: assignmentsError } = await supabase
          .from("schedule_assignments")
          .select(`
            *,
            employee:profiles(*),
            shift:shifts(*)
          `)
          .eq("schedule_id", schedule.id);

        if (assignmentsError) {
          console.error("Error fetching assignments:", assignmentsError);
          throw assignmentsError;
        }

        console.log('📋 Found assignments:', assignments?.length || 0);
        
        const result = {
          ...schedule,
          schedule_assignments: assignments || []
        };
        
        console.log('🔄 Returning schedule data:', result);
        return result;
      } catch (error: any) {
        console.error('❌ Error fetching schedule data:', error);
        toast.error("Error fetching schedule data", {
          description: error.message
        });
        throw error;
      }
    },
    retry: false,
    staleTime: 0,
    gcTime: 0
  });

  const handlePreviousWeek = () => {
    setSelectedDate(subWeeks(selectedDate, 1));
  };

  const handleNextWeek = () => {
    setSelectedDate(addWeeks(selectedDate, 1));
  };

  const handleScheduleGenerated = async () => {
    console.log('🔄 Schedule generated, triggering refetch...');
    await refetch();
    console.log('✅ Refetch complete, scheduleData:', scheduleData);
  };

  if (!userId) return null;

  console.log('🎯 Rendering ScheduleGenerator with data:', {
    isLoading,
    hasSchedule: !!scheduleData,
    assignmentsCount: scheduleData?.schedule_assignments?.length
  });

  return (
    <div className="space-y-6">
      <ErrorBoundary>
        <Card>
          <CardHeader>
            <ScheduleHeader
              selectedDate={selectedDate}
              onPreviousWeek={handlePreviousWeek}
              onNextWeek={handleNextWeek}
            />
          </CardHeader>
          <CardContent>
            <ScheduleControls
              selectedDate={selectedDate}
              userId={userId}
              onScheduleGenerated={handleScheduleGenerated}
              scheduleData={scheduleData}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>

        <ScheduleCalendar
          selectedDate={selectedDate}
          onDateSelect={(date) => date && setSelectedDate(date)}
          scheduleData={scheduleData}
          isLoading={isLoading}
        />
      </ErrorBoundary>
    </div>
  );
}