"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { AppSettings } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';
import { getCache, setCache } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";
const CACHE_KEY = "app-config";

interface UseApplicationConfigReturn {
  config: AppSettings;
  isLoading: boolean;
  error: string | null;
}

export function useApplicationConfig(): UseApplicationConfigReturn {
  const [config, setConfig] = useState<AppSettings>(() => getCache<AppSettings>(CACHE_KEY, true) || defaultAppSettings);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  const processData = useCallback((firestoreData: Partial<AppSettings>): AppSettings => {
    return {
      ...defaultAppSettings,
      ...firestoreData,
      timeSlotSettings: {
        ...defaultAppSettings.timeSlotSettings,
        ...(firestoreData.timeSlotSettings || {}),
        weeklyAvailability: {
          ...defaultAppSettings.timeSlotSettings.weeklyAvailability,
          ...(firestoreData.timeSlotSettings?.weeklyAvailability || {}),
        }
      },
      platformFees: firestoreData.platformFees || defaultAppSettings.platformFees || [],
      enableCancellationPolicy: typeof firestoreData.enableCancellationPolicy === 'boolean' ? firestoreData.enableCancellationPolicy : defaultAppSettings.enableCancellationPolicy,
      isProviderRegistrationEnabled: typeof firestoreData.isProviderRegistrationEnabled === 'boolean' ? firestoreData.isProviderRegistrationEnabled : defaultAppSettings.isProviderRegistrationEnabled,
      enableEmailPasswordLogin: typeof firestoreData.enableEmailPasswordLogin === 'boolean' ? firestoreData.enableEmailPasswordLogin : defaultAppSettings.enableEmailPasswordLogin,
      enableOtpLogin: typeof firestoreData.enableOtpLogin === 'boolean' ? firestoreData.enableOtpLogin : defaultAppSettings.enableOtpLogin,
      enableGoogleLogin: typeof firestoreData.enableGoogleLogin === 'boolean' ? firestoreData.enableGoogleLogin : defaultAppSettings.enableGoogleLogin,
      isReferralSystemEnabled: typeof firestoreData.isReferralSystemEnabled === 'boolean' ? firestoreData.isReferralSystemEnabled : defaultAppSettings.isReferralSystemEnabled,
    };
  }, []);

  useEffect(() => {
    const configDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);

    const fetchConfig = async () => {
      try {
        // Smart Cache Logic:
        // Check global cache version (1 read)
        const versionDocRef = doc(db, "appConfiguration", "cacheVersions");
        const versionSnap = await getDoc(versionDocRef);
        const remoteVersion = versionSnap.exists() ? (versionSnap.data().global || 0) : 0;
        
        const localVersion = parseInt(localStorage.getItem(`${CACHE_KEY}-version`) || "0");
        const cached = getCache<AppSettings>(CACHE_KEY, true);
        
        if (cached && remoteVersion <= localVersion) {
            setConfig(cached);
            setIsLoading(false);
            return;
        }

        // Fetch fresh if version changed (1 read)
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          const processed = processData(docSnap.data());
          setConfig(processed);
          setCache(CACHE_KEY, processed, true);
          localStorage.setItem(`${CACHE_KEY}-version`, remoteVersion.toString());
        }
      } catch (err) {
        console.error("Error fetching config:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [processData, isAdmin]);

  return { config, isLoading, error };
}
