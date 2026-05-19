"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, getDoc, Timestamp } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette, GlobalAdminPopup, LoaderType } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { getCache, setCache } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';
import { getTimestampMillis } from '@/lib/utils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const CACHE_KEY = "global-web-settings";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const isBot = (): boolean => {
  if (typeof window === 'undefined') return true;
  const botPatterns = [
      'bot', 'crawler', 'spider', 'crawling', 'googlebot', 'bingbot', 'yandexbot', 
      'slurp', 'duckduckbot', 'baiduspider', 'adsbot', 'mediapartners-google',
      'lighthouse', 'gtmetrix', 'pingdom', 'facebookexternalhit', 'whatsapp', 'linkedinbot'
  ];
  const ua = navigator.userAgent.toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
};

const processSettingsData = (data: Partial<GlobalWebSettings>): GlobalWebSettings => {
  const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
  THEME_PALETTE_KEYS.forEach(key => {
    if (data.themeColors?.light?.[key]) {
      (mergedLightPalette[key] as any) = data.themeColors.light[key];
    }
  });

  const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
  THEME_PALETTE_KEYS.forEach(key => {
    if (data.themeColors?.dark?.[key]) {
      (mergedDarkPalette[key] as any) = data.themeColors.dark[key];
    }
  });

  const globalAdminPopup = {
    ...defaultGlobalWebSettings.globalAdminPopup,
    ...(data.globalAdminPopup || {}),
  } as GlobalAdminPopup;

  // Fix: Convert sentAt to real Timestamp if it's a plain object from cache
  if (globalAdminPopup.sentAt && !(globalAdminPopup.sentAt instanceof Timestamp)) {
    const millis = getTimestampMillis(globalAdminPopup.sentAt);
    if (millis) {
      globalAdminPopup.sentAt = Timestamp.fromMillis(millis);
    }
  }

  return {
    ...defaultGlobalWebSettings,
    ...data,
    themeColors: {
      light: mergedLightPalette,
      dark: mergedDarkPalette,
    },
    socialMediaLinks: {
      ...defaultGlobalWebSettings.socialMediaLinks,
      ...(data.socialMediaLinks || {}),
    },
    homepageContent: data.homepageContent,
    globalAdminPopup,
  };
};

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalWebSettings>(() => {
    const cached = getCache<GlobalWebSettings>(CACHE_KEY, true);
    return cached ? processSettingsData(cached) : defaultGlobalWebSettings;
  });
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);
  const isVisitorBot = useRef(isBot());

  useEffect(() => {
    // If it's a bot and we are not in admin, skip fetching to save reads
    if (isVisitorBot.current && !isAdmin) {
      setIsLoading(false);
      return;
    }

    const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);

    // If we have cached data and it's not admin, don't even fetch again in this session
    if (!isAdmin && hasLoadedRef.current) return;

    if (isAdmin) {
      // Admins get real-time updates
      const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const processed = processSettingsData(docSnap.data());
          setSettings(processed);
          setCache(CACHE_KEY, processed, true);
        }
        setIsLoading(false);
        hasLoadedRef.current = true;
      }, (err) => {
        console.error("Error fetching settings:", err);
        setError("Failed to load settings.");
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      // Public site and providers use one-time fetch + cache
    const fetchSettings = async () => {
        try {
          // Check Global Version (1 read)
          const versionDocRef = doc(db, "appConfiguration", "cacheVersions");
          const versionSnap = await getDoc(versionDocRef);
          const remoteVersion = versionSnap.exists() ? (versionSnap.data().global || 0) : 0;
          
          const localVersion = parseInt(localStorage.getItem(`${CACHE_KEY}-version`) || "0");
          const cached = getCache<GlobalWebSettings>(CACHE_KEY, true);

          // If versions match, use the lifetime cache and STOP. Zero reads for settings.
          if (cached && remoteVersion <= localVersion) {
              setSettings(processSettingsData(cached));
              setIsLoading(false);
              return;
          }

          // Versions don't match or no cache? Read settings (1 read)
          const docSnap = await getDoc(settingsDocRef);
          if (docSnap.exists()) {
            const processed = processSettingsData(docSnap.data() as Partial<GlobalWebSettings>);
            setSettings(processed);
            setCache(CACHE_KEY, processed, true);
            localStorage.setItem(`${CACHE_KEY}-version`, remoteVersion.toString());
          }
        } catch (err) {
          console.error("Error fetching settings:", err);
          setError("Failed to load settings.");
        } finally {
          setIsLoading(false);
          hasLoadedRef.current = true;
        }
      };
      fetchSettings();
    }
  }, [isAdmin]);

  return { settings, isLoading, error };
}
