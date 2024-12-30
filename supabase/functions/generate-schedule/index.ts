import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SchedulingEngine } from './SchedulingEngine.ts'
import type { SchedulingContext } from './types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { weekStartDate, userId } = await req.json()
    console.log('Received request:', { weekStartDate, userId })

    if (!weekStartDate || !userId) {
      throw new Error('Missing required parameters: weekStartDate and userId are required.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration: Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log('Supabase client initialized')

    // Check for existing schedule
    console.log('Checking for existing schedule for week:', weekStartDate);
    const { data: existingSchedule, error: checkError } = await supabase
      .from('schedules')
      .select()
      .eq('week_start_date', weekStartDate)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing schedule:', checkError);
      throw new Error('Failed to check for existing schedule.');
    }

    if (existingSchedule) {
      console.warn('Schedule already exists for week:', weekStartDate);
      throw new Error('A schedule already exists for this week.');
    }

    console.log('No existing schedule found, proceeding with generation');

    // Create schedule record
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .insert({
        week_start_date: weekStartDate,
        status: 'draft',
        created_by: userId
      })
      .select()
      .single()

    if (scheduleError) throw new Error(`Failed to create a schedule record: ${scheduleError.message}`);
    console.log('Created schedule:', schedule)

    // Fetch shift preferences
    const { data: shiftPreferences, error: shiftPreferencesError } = await supabase
      .from('shift_preferences')
      .select('*');

    if (shiftPreferencesError) {
      console.error('Error fetching shift preferences:', shiftPreferencesError);
      throw new Error(`Failed to fetch shift preferences: ${shiftPreferencesError.message}`);
    }

    // Fetch employees
    const { data: employees, error: employeesError } = await supabase
      .from('profiles')
      .select('*')
      .order('first_name')

    if (employeesError) throw new Error(`Failed to fetch employees: ${employeesError.message}`);
    console.log(`Fetched ${employees.length} employees`);

    // Fetch shifts
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('*')
      .order('start_time')

    if (shiftsError) throw new Error(`Failed to fetch shifts: ${shiftsError.message}`);
    console.log(`Fetched ${shifts.length} shifts`);

    // Fetch availability
    const { data: availability, error: availabilityError } = await supabase
      .from('employee_availability')
      .select('*');

    if (availabilityError) throw new Error(`Failed to fetch employee availability: ${availabilityError.message}`);

    // Fetch coverage
    const { data: coverage, error: coverageError } = await supabase
      .from('coverage_requirements')
      .select('*');

    if (coverageError) throw new Error(`Failed to fetch coverage requirements: ${coverageError.message}`);

    // Fetch time off
    const { data: timeOff, error: timeOffError } = await supabase
      .from('time_off_requests')
      .select('*')
      .eq('status', 'approved')
      .gte('end_date', weekStartDate);

    if (timeOffError) throw new Error(`Failed to fetch time off requests: ${timeOffError.message}`);

    // Initialize scheduling engine
    const engine = new SchedulingEngine();

    // Generate schedule
    const result = await engine.generateSchedule(
      {
        employees,
        shifts,
        availability,
        coverageRequirements: coverage,
        timeOffRequests: timeOff,
        shiftPreferences: shiftPreferences
      },
      new Date(weekStartDate),
      schedule.id
    );

    // Save assignments

    if (result.assignments.length > 0) {
      const { error: assignmentsError } = await supabase
        .from('schedule_assignments')
        .insert(result.assignments);
      if (assignmentsError) throw new Error(`Failed to save assignments: ${assignmentsError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        scheduleId: schedule.id,
        coverage: result.coverage,
        messages: result.messages,
        assignmentsCount: result.assignments.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})