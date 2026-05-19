// src/lib/systemStatsUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function incrementSystemStats(updates: {
  totalBookings?: number;
  completedBookings?: number;
  totalRevenue?: number;
  earnedCommission?: number;
  totalUsers?: number;
  newSignups30d?: number;
}) {
  try {
    const statsRef = adminDb.collection('appConfiguration').doc('stats');
    const payload: any = {
      updatedAt: Timestamp.now()
    };

    if (updates.totalBookings) payload.totalBookings = FieldValue.increment(updates.totalBookings);
    if (updates.completedBookings) payload.completedBookings = FieldValue.increment(updates.completedBookings);
    if (updates.totalRevenue) payload.totalRevenue = FieldValue.increment(updates.totalRevenue);
    if (updates.earnedCommission) payload.earnedCommission = FieldValue.increment(updates.earnedCommission);
    if (updates.totalUsers) payload.totalUsers = FieldValue.increment(updates.totalUsers);
    if (updates.newSignups30d) payload.newSignups30d = FieldValue.increment(updates.newSignups30d);

    await statsRef.set(payload, { merge: true });
  } catch (error) {
    console.error("Error incrementing system stats:", error);
  }
}
