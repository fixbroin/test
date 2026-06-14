
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
  const { user, isSuperAdmin, isLoading: authLoading } = useAuth();
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
    
    // Tiered Query: Super Admin counts all unread, others count only their own unread.
    const newQuery = isSuperAdmin 
      ? query(
          notificationsCollectionRef,
          where("read", "==", false),
          limit(20)
        )
      : query(
          notificationsCollectionRef,
          where("userId", "==", effectiveUserId),
          where("read", "==", false),
          limit(20)
        );

    const unsubscribe = onSnapshot(newQuery, (querySnapshot) => {
      setCount(querySnapshot.size);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching unread notifications count:", error);
      setCount(0);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveUserId, isSuperAdmin, authLoading]);

  return { count, isLoading };
}
