import { format, startOfWeek, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DailySchedule } from "./DailySchedule";
import { WeekNavigation } from "./calendar/WeekNavigation";
import { DailyCoverageStats } from "./calendar/DailyCoverageStats";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useEffect } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { CoverageCalculator } from '@/lib/shared/CoverageCalculator';

interface ScheduleCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date | undefined) => void;
  scheduleData: any;
  isLoading?: boolean;
}

export function ScheduleCalendar({
  selectedDate,
  scheduleData,
  isLoading = false
}: ScheduleCalendarProps) {
  const {
    assignments,
    employees,
    shifts,
    isLoading,
    fetchAssignments,
    fetchEmployees,
    fetchShifts,
    updateCoverage,
  } = useScheduleStore();

  useErrorHandler();

  useEffect(() => {
    fetchAssignments(scheduleId);
    fetchEmployees();
    fetchShifts();
  }, [scheduleId]);

  useEffect(() => {
    if (assignments.length && shifts.length) {
      const calculator = new CoverageCalculator();
      const coverage = calculator.calculateCoverage(assignments, shifts, []);
      updateCoverage(coverage);
    }
  }, [assignments, shifts]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Rest of your component render logic...
}