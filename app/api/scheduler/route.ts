import { NextRequest, NextResponse } from 'next/server'
import { 
  getSchedulerStatus, 
  startDailyUpdateScheduler, 
  stopDailyUpdateScheduler, 
  triggerManualUpdate 
} from '@/lib/scheduler'

export async function GET(request: NextRequest) {
  try {
    const status = getSchedulerStatus()
    
    return NextResponse.json({
      success: true,
      ...status
    })
  } catch (error) {
    console.error('Error getting scheduler status:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get scheduler status'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    
    switch (action) {
      case 'start':
        startDailyUpdateScheduler()
        return NextResponse.json({
          success: true,
          message: 'Scheduler started successfully'
        })
      
      case 'stop':
        stopDailyUpdateScheduler()
        return NextResponse.json({
          success: true,
          message: 'Scheduler stopped successfully'
        })
      
      case 'trigger':
        const result = await triggerManualUpdate()
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Manual update completed' : 'Manual update failed',
          ...result
        })
      
      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action. Use: start, stop, or trigger'
          },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error handling scheduler action:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to handle scheduler action'
      },
      { status: 500 }
    )
  }
}
