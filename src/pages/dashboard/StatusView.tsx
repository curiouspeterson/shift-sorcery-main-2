import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfWeek } from "date-fns";

export default function StatusView() {
  const [statusContent, setStatusContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/STATUS.md");
      if (!response.ok) {
        throw new Error("Failed to load status file");
      }
      const content = await response.text();
      setStatusContent(content);
    } catch (err) {
      console.error("Error loading status:", err);
      setError("Failed to load application status");
    }
  };

  const createTestSchedule = async () => {
    try {
      setIsCreating(true);
      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No user found");

      // Get first employee
      const { data: employees, error: employeeError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .single();
      
      if (employeeError) throw employeeError;
      if (!employees) throw new Error("No employees found");

      // Get first shift
      const { data: shifts, error: shiftError } = await supabase
        .from('shifts')
        .select('id')
        .limit(1)
        .single();
      
      if (shiftError) throw shiftError;
      if (!shifts) throw new Error("No shifts found");

      // Create schedule record
      const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
          week_start_date: weekStart,
          status: 'draft',
          created_by: user.id
        })
        .select()
        .single();

      if (scheduleError) throw scheduleError;

      // Create a test assignment
      const { error: assignmentError } = await supabase
        .from('schedule_assignments')
        .insert({
          schedule_id: schedule.id,
          employee_id: employees.id,
          shift_id: shifts.id,
          date: weekStart
        });

      if (assignmentError) throw assignmentError;

      toast.success("Test schedule created", {
        description: `Created schedule for week of ${weekStart}`
      });
    } catch (error: any) {
      console.error('Failed to create test schedule:', error);
      toast.error("Failed to create test schedule: " + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('public:status_updates')
      .on(
        'broadcast',
        { event: 'status_update' },
        (payload) => {
          console.log('Received status update:', payload);
          fetchStatus();
          toast.info("Status page updated", {
            description: "The application status has been updated."
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Application Status</h1>
        <Button onClick={createTestSchedule} disabled={isCreating}>
          {isCreating ? "Creating..." : "Create Test Schedule"}
        </Button>
      </div>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        {statusContent.split("\n").map((line, index) => {
          if (line.startsWith("# ")) {
            return <h1 key={index} className="text-2xl font-bold mt-6 mb-4">{line.substring(2)}</h1>;
          } else if (line.startsWith("## ")) {
            return <h2 key={index} className="text-xl font-semibold mt-4 mb-3">{line.substring(3)}</h2>;
          } else if (line.startsWith("### ")) {
            return <h3 key={index} className="text-lg font-medium mt-3 mb-2">{line.substring(4)}</h3>;
          } else if (line.startsWith("- ")) {
            return <li key={index} className="ml-4">{line.substring(2)}</li>;
          } else if (line.trim() === "") {
            return <br key={index} />;
          } else {
            return <p key={index}>{line}</p>;
          }
        })}
      </div>
    </div>
  );
}