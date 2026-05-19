import { type NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/lib/firebase-admin';

/**
 * This API route is called by navigator.sendBeacon to update user activity.
 * We use set({ merge: true }) instead of update() to avoid 404 errors if the doc is missing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, ts } = body;

    if (!uid || typeof uid !== 'string' || !ts || typeof ts !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid payload.' }, { status: 400 });
    }

    initFirebaseAdmin();
    const db = getFirestore();

    const userDocRef = db.collection('users').doc(uid);
    // Use set with merge to ensure the operation succeeds even if the document doesn't exist yet
    await userDocRef.set({
      lastLoginAt: Timestamp.fromMillis(ts),
    }, { merge: true });
    
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error('Error in /api/mark-last-seen:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
