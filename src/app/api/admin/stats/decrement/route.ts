// src/app/api/admin/stats/decrement/route.ts
import { NextResponse } from 'next/server';
import { incrementSystemStats } from '@/lib/systemStatsUtils';

export async function POST(request: Request) {
  try {
    const { totalBookings, completedBookings, totalRevenue, earnedCommission } = await request.json();

    const updates: any = {};
    if (totalBookings) updates.totalBookings = -totalBookings;
    if (completedBookings) updates.completedBookings = -completedBookings;
    if (totalRevenue) updates.totalRevenue = -totalRevenue;
    if (earnedCommission) updates.earnedCommission = -earnedCommission;

    if (Object.keys(updates).length > 0) {
      await incrementSystemStats(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error decrementing system stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
