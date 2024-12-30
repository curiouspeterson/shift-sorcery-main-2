import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, serviceRoleKey)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting to seed employee availability...')

    // First, get all employees
    const { data: employees, error: employeesError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'employee')

    if (employeesError) {
      console.error('Error fetching employees:', employeesError)
      throw employeesError
    }

    if (!employees || employees.length === 0) {
      throw new Error('No employees found')
    }

    console.log(`Found ${employees.length} employees`)

    // Get existing shifts
    const { data: allShifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('*')
      .order('start_time')

    if (shiftsError || !allShifts) {
      console.error('Error fetching shifts:', shiftsError)
      throw shiftsError
    }

    console.log(`Found ${allShifts.length} shifts`)

    // Delete existing availability entries
    const { error: deleteError } = await supabase
      .from('employee_availability')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (deleteError) {
      console.error('Error deleting existing availability:', deleteError)
      throw deleteError
    }

    console.log('Cleared existing availability entries')

    // Group shifts by duration
    const tenHourShifts = allShifts.filter(s => {
      const startHour = parseInt(s.start_time.split(':')[0])
      const endHour = parseInt(s.end_time.split(':')[0])
      const duration = endHour < startHour ? (endHour + 24) - startHour : endHour - startHour
      return duration === 10
    })

    const twelveHourShifts = allShifts.filter(s => {
      const startHour = parseInt(s.start_time.split(':')[0])
      const endHour = parseInt(s.end_time.split(':')[0])
      const duration = endHour < startHour ? (endHour + 24) - startHour : endHour - startHour
      return duration === 12
    })

    const fourHourShifts = allShifts.filter(s => {
      const startHour = parseInt(s.start_time.split(':')[0])
      const endHour = parseInt(s.end_time.split(':')[0])
      const duration = endHour < startHour ? (endHour + 24) - startHour : endHour - startHour
      return duration === 4
    })

    if (tenHourShifts.length === 0 || twelveHourShifts.length === 0 || fourHourShifts.length === 0) {
      throw new Error('Missing required shift durations')
    }

    const availabilityEntries = []

    // Distribute employees evenly between patterns
    employees.forEach((employee, index) => {
      // Alternate between patterns based on index
      const usesTenHourShifts = index % 2 === 0

      // Calculate start day to ensure even distribution
      // Use employee index to spread start days across the week
      const startDay = index % 7

      if (usesTenHourShifts) {
        // 4x10 pattern
        // Get all available 10-hour shifts
        const availableShifts = [...tenHourShifts]
        
        // Shuffle the shifts to randomize assignments
        availableShifts.sort(() => Math.random() - 0.5)

        // Create 6 days of availability
        for (let i = 0; i < 6; i++) {
          const dayOfWeek = (startDay + i) % 7
          // Use different shifts for variety
          const selectedShift = availableShifts[i % availableShifts.length]

          availabilityEntries.push({
            employee_id: employee.id,
            day_of_week: dayOfWeek,
            shift_id: selectedShift.id,
            start_time: selectedShift.start_time,
            end_time: selectedShift.end_time
          })
        }
      } else {
        // 3x12 + 4 pattern
        // Get all available 12-hour and 4-hour shifts
        const availableTwelveHourShifts = [...twelveHourShifts].sort(() => Math.random() - 0.5)
        const availableFourHourShifts = [...fourHourShifts].sort(() => Math.random() - 0.5)

        // Create 6 days of availability
        for (let i = 0; i < 6; i++) {
          const dayOfWeek = (startDay + i) % 7
          
          // First 4 days: mix of 12-hour shifts
          // Last 2 days: 4-hour shifts
          if (i < 4) {
            const selectedShift = availableTwelveHourShifts[i % availableTwelveHourShifts.length]
            availabilityEntries.push({
              employee_id: employee.id,
              day_of_week: dayOfWeek,
              shift_id: selectedShift.id,
              start_time: selectedShift.start_time,
              end_time: selectedShift.end_time
            })
          } else {
            const selectedShift = availableFourHourShifts[(i - 4) % availableFourHourShifts.length]
            availabilityEntries.push({
              employee_id: employee.id,
              day_of_week: dayOfWeek,
              shift_id: selectedShift.id,
              start_time: selectedShift.start_time,
              end_time: selectedShift.end_time
            })
          }
        }
      }
    })

    console.log(`Preparing to insert ${availabilityEntries.length} availability entries`)

    // Insert availability entries in batches of 100
    const batchSize = 100
    for (let i = 0; i < availabilityEntries.length; i += batchSize) {
      const batch = availabilityEntries.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('employee_availability')
        .insert(batch)

      if (insertError) {
        console.error('Error inserting availability batch:', insertError)
        throw insertError
      }
      console.log(`Inserted batch of ${batch.length} entries`)
    }

    // Calculate distribution summary
    const distributionSummary = {
      tenHourPattern: availabilityEntries.filter(entry => {
        const shift = allShifts.find(s => s.id === entry.shift_id)
        if (!shift) return false
        const startHour = parseInt(shift.start_time.split(':')[0])
        const endHour = parseInt(shift.end_time.split(':')[0])
        const duration = endHour < startHour ? (endHour + 24) - startHour : endHour - startHour
        return duration === 10
      }).length,
      twelveHourPattern: availabilityEntries.filter(entry => {
        const shift = allShifts.find(s => s.id === entry.shift_id)
        if (!shift) return false
        const startHour = parseInt(shift.start_time.split(':')[0])
        const endHour = parseInt(shift.end_time.split(':')[0])
        const duration = endHour < startHour ? (endHour + 24) - startHour : endHour - startHour
        return duration === 12
      }).length,
      fourHourPattern: availabilityEntries.filter(entry => {
        const shift = allShifts.find(s => s.id === entry.shift_id)
        if (!shift) return false
        const startHour = parseInt(shift.start_time.split(':')[0])
        const endHour = parseInt(shift.end_time.split(':')[0])
        const duration = endHour < startHour ? (endHour + 24) - startHour : endHour - startHour
        return duration === 4
      }).length
    }

    return new Response(
      JSON.stringify({ 
        message: `Successfully added availability for ${employees.length} employees`,
        totalEntries: availabilityEntries.length,
        distributionSummary
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in seed-employee-availability function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})