// src/app/api/admin/stats/sync/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { revalidateTag } from 'next/cache';

export async function POST() {
  try {
    const bookingsSnap = await adminDb.collection('bookings').get();
    const usersSnap = await adminDb.collection('users').get();

    let totalRevenue = 0;
    let completedBookings = 0;
    
    bookingsSnap.forEach(doc => {
      const data = doc.data();
      if (data.status === 'Completed') {
        totalRevenue += (data.totalAmount || 0);
        completedBookings++;
      }
    });

    const statsData = {
      totalBookings: bookingsSnap.size,
      completedBookings: completedBookings,
      totalRevenue: totalRevenue,
      totalUsers: usersSnap.size,
      updatedAt: Timestamp.now()
    };

    await adminDb.collection('appConfiguration').doc('stats').set(statsData, { merge: true });

    // PURGE CACHE
    revalidateTag('admin-dashboard-stats');
    revalidateTag('global-cache');

    return NextResponse.json({ success: true, stats: statsData });
  } catch (error: any) {
    console.error('Error syncing stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
