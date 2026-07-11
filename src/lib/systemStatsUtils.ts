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
  lastUserNumber?: number;
  lastBookingNumber?: number;
  totalDiscountGiven?: number;
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
    if (updates.lastUserNumber) payload.lastUserNumber = FieldValue.increment(updates.lastUserNumber);
    if (updates.lastBookingNumber) payload.lastBookingNumber = FieldValue.increment(updates.lastBookingNumber);
    if (updates.totalDiscountGiven) payload.totalDiscountGiven = FieldValue.increment(updates.totalDiscountGiven);

    await statsRef.set(payload, { merge: true });
  } catch (error) {
    console.error("Error incrementing system stats:", error);
  }
}

/**
 * Resequences all booking numbers to remove gaps from deletions.
 */
export async function resequenceBookingNumbers() {
  try {
    const statsRef = adminDb.collection('appConfiguration').doc('stats');
    const bookingsSnap = await adminDb.collection('bookings').orderBy('createdAt', 'asc').get();
    const totalBookings = bookingsSnap.size;
    
    const batchSize = 500;
    let count = 0;
    let processed = 0;
    let batch = adminDb.batch();

    for (let i = 0; i < bookingsSnap.docs.length; i++) {
      const doc = bookingsSnap.docs[i];
      batch.update(doc.ref, { bookingNumber: i + 1 });
      count++;
      processed++;

      if (count === batchSize) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    
    if (count > 0) {
      await batch.commit();
    }

    await statsRef.set({ 
      lastBookingNumber: totalBookings,
      updatedAt: Timestamp.now() 
    }, { merge: true });

    return { success: true, count: processed };
  } catch (error) {
    console.error("Error resequencing booking numbers:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Resequences all user numbers to remove gaps from deletions.
 */
export async function resequenceUserNumbers() {
  try {
    const statsRef = adminDb.collection('appConfiguration').doc('stats');
    const usersSnap = await adminDb.collection('users').orderBy('createdAt', 'asc').get();
    const totalUsers = usersSnap.size;
    
    const batchSize = 500;
    let count = 0;
    let processed = 0;
    let batch = adminDb.batch();

    for (let i = 0; i < usersSnap.docs.length; i++) {
      const doc = usersSnap.docs[i];
      batch.update(doc.ref, { userNumber: i + 1 });
      count++;
      processed++;

      if (count === batchSize) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    
    if (count > 0) {
      await batch.commit();
    }

    await statsRef.set({ 
      lastUserNumber: totalUsers,
      updatedAt: Timestamp.now() 
    }, { merge: true });

    return { success: true, count: processed };
  } catch (error) {
    console.error("Error resequencing user numbers:", error);
    return { success: false, error: String(error) };
  }
}

export async function initializeBookingNumbers() {
  return resequenceBookingNumbers();
}

export async function initializeUserNumbers() {
  return resequenceUserNumbers();
}
