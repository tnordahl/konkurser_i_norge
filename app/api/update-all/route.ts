import { NextRequest, NextResponse } from 'next/server'
import { updateAllKommunerData } from '@/lib/data-fetcher'

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication check here
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    console.log('Starting scheduled update for all kommuner...')
    const result = await updateAllKommunerData()
    
    return NextResponse.json({
      success: true,
      message: 'All kommuner updated successfully',
      ...result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in scheduled update:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update all kommuner data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
