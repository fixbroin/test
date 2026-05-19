
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth'; // Assuming useAuth is in the same hooks directory or adjust path
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, queryEqual, limit } from "firebase/firestore";
import type { FirestoreNotification } from '@/types/firestore';

interface UseUnreadNotificationsCountReturn {
  count: number;
  isLoading: boolean;
}

export function useUnreadNotificationsCount(userIdOverride?: string): UseUnreadNotificationsCountReturn {
  const { user, isLoading: authLoading } = useAuth();
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuery, setCurrentQuery] = useState<any>(null); // To store the current query for comparison

  const effectiveUserId = userIdOverride || user?.uid;

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!effectiveUserId) {
      setCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const notificationsCollectionRef = collection(db, "userNotifications");
    // Added limit(20) to prevent excessive reads if a user has many unread notifications.
    // Most UI badges only show "9+" or "99+", so 20 is sufficient for a "9+" badge.
    const newQuery = query(
      notificationsCollectionRef,
      where("userId", "==", effectiveUserId),
      where("read", "==", false),
      limit(20)
    );

    // Only create a new listener if the query has changed
    // This is a basic check; for complex queries, a deep comparison might be needed
    // or rely on Firestore's internal handling if query objects are stable.
    // For this simple case, stringifying or checking reference might work, but queryEqual is best.
    
    // queryEqual is not directly available client-side in the same way as Admin SDK.
    // For client-side, we often rely on useEffect dependencies or a more manual check if queries get complex.
    // Given the dependencies of this useEffect (effectiveUserId), it should re-run correctly when userId changes.
    // We can simplify by not storing/comparing `currentQuery` unless performance issues arise.

    const unsubscribe = onSnapshot(newQuery, (querySnapshot) => {
      setCount(querySnapshot.size);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching unread notifications count:", error);
      setCount(0); // Reset count on error
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveUserId, authLoading]); // Rerun when effectiveUserId or authLoading changes

  return { count, isLoading };
}
