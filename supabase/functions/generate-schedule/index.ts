import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { SchedulingEngine } from './SchedulingEngine.ts'
import type { SchedulingContext } from './types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { weekStartDate, userId } = await req.json()
    console.log('🔄 Received request:', { weekStartDate, userId })

    if (!weekStartDate || !userId) {
      throw new Error('Missing required parameters')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log('✅ Supabase client initialized')

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

    if (scheduleError) {
      console.error('❌ Error creating schedule:', scheduleError)
      throw scheduleError
    }
    console.log('✅ Created schedule:', schedule)

    // Fetch all required data in parallel
    const [
      { data: employees, error: employeesError },
      { data: shifts, error: shiftsError },
      { data: availability, error: availabilityError },
      { data: coverage, error: coverageError },
      { data: timeOff, error: timeOffError }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'employee'),
      supabase.from('shifts').select('*'),
      supabase.from('employee_availability').select('*'),
      supabase.from('coverage_requirements').select('*'),
      supabase.from('time_off_requests')
        .select('*')
        .eq('status', 'approved')
        .gte('end_date', weekStartDate)
    ]);

    // Check for any errors in parallel requests
    if (employeesError) throw employeesError;
    if (shiftsError) throw shiftsError;
    if (availabilityError) throw availabilityError;
    if (coverageError) throw coverageError;
    if (timeOffError) throw timeOffError;

    console.log(`📊 Data fetched:
      - ${employees?.length || 0} employees
      - ${shifts?.length || 0} shifts
      - ${availability?.length || 0} availability records
      - ${coverage?.length || 0} coverage requirements
      - ${timeOff?.length || 0} time off requests
    `);

    // Initialize scheduling engine
    const engine = new SchedulingEngine();
    
    // Generate schedule
    const result = await engine.generateSchedule(
      {
        employees: employees || [],
        shifts: shifts || [],
        availability: availability || [],
        coverageRequirements: coverage || [],
        timeOffRequests: timeOff || []
      },
      new Date(weekStartDate),
      schedule.id
    );

    // Save assignments
    if (result.assignments.length > 0) {
      const { error: assignmentsError } = await supabase
        .from('schedule_assignments')
        .insert(result.assignments);

      if (assignmentsError) {
        console.error('❌ Error saving assignments:', assignmentsError)
        throw assignmentsError;
      }
      console.log(`✅ Saved ${result.assignments.length} assignments`)
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
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString(),
        stack: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})