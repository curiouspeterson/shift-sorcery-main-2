/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from '@supabase/supabase-js'
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
      throw new Error('Missing required parameters')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log('Supabase client initialized')

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

    if (scheduleError) throw scheduleError
    console.log('Created schedule:', schedule)

    // Fetch employees
    const { data: employees, error: employeesError } = await supabase
      .from('profiles')
      .select('*')
      .order('first_name')

    if (employeesError) throw employeesError
    console.log(`Fetched ${employees.length} employees`);

    // Fetch shifts
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('*')
      .order('start_time')

    if (shiftsError) throw shiftsError
    console.log(`Fetched ${shifts.length} shifts`)

    // Fetch availability
    const { data: availability, error: availabilityError } = await supabase
      .from('employee_availability')
      .select('*')

    if (availabilityError) throw availabilityError
    console.log(`Fetched ${availability.length} availability records`)

    // Fetch coverage requirements
    const { data: coverageReqs, error: coverageError } = await supabase
      .from('coverage_requirements')
      .select('*')

    if (coverageError) throw coverageError
    console.log(`Fetched ${coverageReqs.length} coverage requirements`)

    // Fetch time off requests
    const { data: timeOffRequests, error: timeOffError } = await supabase
      .from('time_off_requests')
      .select('*')
      .eq('status', 'approved')

    if (timeOffError) throw timeOffError
    console.log(`Fetched ${timeOffRequests.length} approved time off requests`)

    // Initialize scheduling engine
    const engine = new SchedulingEngine()

    // Generate schedule
    const result = await engine.generateSchedule(
      {
        employees,
        shifts,
        availability,
        coverageRequirements: coverageReqs,
        timeOffRequests
      },
      new Date(weekStartDate),
      schedule.id
    )

    console.log(`Generated ${result.assignments.length} assignments`)

    // Save the generated assignments
    if (result.assignments.length > 0) {
      const { error: saveError } = await supabase
        .from('schedule_assignments')
        .insert(result.assignments)

      if (saveError) throw saveError
      console.log('Successfully saved assignments to database')
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: schedule.id,
        assignmentsCount: result.assignments.length,
        coverage: result.coverage,
        messages: result.messages
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error generating schedule:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})