import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Revised shift patterns for 24/7 coverage
const SHIFT_PATTERNS = {
  EARLY: {
    days: 4,
    minEmployees: 15,
    startHourRange: [4, 6],
    percentage: 0.6 // 60% of workforce should have early availability
  },
  DAY: {
    days: 4,
    minEmployees: 20,
    startHourRange: [7, 9],
    percentage: 0.7 // 70% of workforce should have day availability
  },
  SWING: {
    days: 4,
    minEmployees: 15,
    startHourRange: [14, 16],
    percentage: 0.6 // 60% of workforce should have swing availability
  },
  GRAVEYARD: {
    days: 4,
    minEmployees: 12,
    startHourRange: [20, 22],
    percentage: 0.5 // 50% of workforce should have graveyard availability
  }
}

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

    // Group shifts by type
    const shiftsByType = {
      'Day Shift Early': allShifts.filter(s => {
        const hour = parseInt(s.start_time.split(':')[0])
        return hour >= 4 && hour < 8
      }),
      'Day Shift': allShifts.filter(s => {
        const hour = parseInt(s.start_time.split(':')[0])
        return hour >= 8 && hour < 16
      }),
      'Swing Shift': allShifts.filter(s => {
        const hour = parseInt(s.start_time.split(':')[0])
        return hour >= 16 && hour < 22
      }),
      'Graveyard': allShifts.filter(s => {
        const hour = parseInt(s.start_time.split(':')[0])
        return hour >= 22 || hour < 4
      })
    }

    const availabilityEntries = []

    // Assign each employee to multiple shift patterns with higher probabilities
    employees.forEach((employee, employeeIndex) => {
      // Determine which patterns this employee will be available for
      // Use the defined percentages instead of fixed probability
      const patterns = Object.entries(SHIFT_PATTERNS).filter(([_, pattern]) => 
        Math.random() < pattern.percentage
      )
      
      if (patterns.length === 0) {
        // If no patterns assigned, ensure at least two patterns
        const shuffledPatterns = Object.entries(SHIFT_PATTERNS)
          .sort(() => Math.random() - 0.5)
          .slice(0, 2)
        patterns.push(...shuffledPatterns)
      } else if (patterns.length === 1) {
        // If only one pattern, add another random one
        const remainingPatterns = Object.entries(SHIFT_PATTERNS)
          .filter(([key]) => !patterns.some(([p]) => p === key))
        if (remainingPatterns.length > 0) {
          patterns.push(remainingPatterns[Math.floor(Math.random() * remainingPatterns.length)])
        }
      }

      patterns.forEach(([patternKey, pattern]) => {
        const shiftType = patternKey === 'EARLY' ? 'Day Shift Early' :
                         patternKey === 'DAY' ? 'Day Shift' :
                         patternKey === 'SWING' ? 'Swing Shift' : 'Graveyard'
        
        const shifts = shiftsByType[shiftType]
        if (!shifts.length) {
          console.log(`No shifts found for pattern ${patternKey}`)
          return
        }

        // Distribute start days evenly across the week
        // Use both employee index and pattern to ensure good distribution
        const startDay = (employeeIndex + Object.keys(SHIFT_PATTERNS).indexOf(patternKey) * 2) % 7
        
        // Select shift based on employee index to distribute shift assignments
        const selectedShift = shifts[employeeIndex % shifts.length]

        // Add availability for consecutive days, wrapping around the week
        for (let i = 0; i < pattern.days; i++) {
          const dayOfWeek = (startDay + i) % 7
          
          // Higher probability of adding each day (95% instead of 90%)
          if (Math.random() < 0.95) {
            availabilityEntries.push({
              employee_id: employee.id,
              day_of_week: dayOfWeek,
              shift_id: selectedShift.id,
              start_time: selectedShift.start_time,
              end_time: selectedShift.end_time
            })
          }
        }

        // Add some extra availability on other days for flexibility
        const remainingDays = Array.from({ length: 7 }, (_, i) => i)
          .filter(day => !availabilityEntries.some(entry => 
            entry.employee_id === employee.id && entry.day_of_week === day
          ))
        
        // Add 1-2 extra days of availability
        const extraDays = Math.floor(Math.random() * 2) + 1
        for (let i = 0; i < extraDays && remainingDays.length > 0; i++) {
          const randomDayIndex = Math.floor(Math.random() * remainingDays.length)
          const dayOfWeek = remainingDays[randomDayIndex]
          remainingDays.splice(randomDayIndex, 1)

          availabilityEntries.push({
            employee_id: employee.id,
            day_of_week: dayOfWeek,
            shift_id: selectedShift.id,
            start_time: selectedShift.start_time,
            end_time: selectedShift.end_time
          })
        }
      })
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
    const distributionByPattern = Object.fromEntries(
      Object.keys(SHIFT_PATTERNS).map(pattern => [
        pattern.toLowerCase(),
        availabilityEntries.filter(entry => {
          const hour = parseInt(entry.start_time.split(':')[0])
          switch (pattern) {
            case 'EARLY': return hour >= 4 && hour < 8
            case 'DAY': return hour >= 8 && hour < 16
            case 'SWING': return hour >= 16 && hour < 22
            case 'GRAVEYARD': return hour >= 22 || hour < 4
            default: return false
          }
        }).length
      ])
    )

    return new Response(
      JSON.stringify({ 
        message: `Successfully added availability for ${employees.length} employees`,
        totalEntries: availabilityEntries.length,
        distributionSummary: distributionByPattern
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