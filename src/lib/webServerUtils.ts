
'use server';

import { adminDb } from './firebaseAdmin';
import type { GlobalWebSettings, ThemePalette } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { defaultAppSettings } from '@/config/appDefaults';
import { defaultMarketingValues } from '@/hooks/useMarketingSettings';
import type { ContentPage } from '@/types/firestore';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

const WEB_SETTINGS_DOC_ID = "global";
const APP_CONFIG_DOC_ID = "applicationConfig";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";
const WEB_SETTINGS_COLLECTION = "webSettings";

/**
 * Fetches a content page by slug with caching.
 */
export const getContentPageData = cache(async (slug: string): Promise<ContentPage | null> => {
  return unstable_cache(
    async () => {
      try {
        const pageDocRef = adminDb.collection("contentPages").doc(slug);
        const docSnap = await pageDocRef.get();
        if (docSnap.exists) {
          const data = docSnap.data();
          return { id: docSnap.id, ...data } as ContentPage;
        }
        return null;
      } catch (error) {
        console.error(`Error fetching content page for slug "${slug}":`, error);
        return null;
      }
    },
    [`content-page-${slug}`],
    { revalidate: false, tags: ['content', `content-${slug}`, 'global-cache'] }
  )();
});

/**
 * Fetches marketing settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getMarketingSettings = cache(async (): Promise<any> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(MARKETING_CONFIG_DOC_ID).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          return {
            ...defaultMarketingValues,
            ...data,
          };
        }
        return defaultMarketingValues;
      } catch (error) {
        console.error('Error fetching marketing settings via Admin SDK:', error);
        return defaultMarketingValues;
      }
    },
    ['marketing-settings'],
    { 
      revalidate: false, 
      tags: ['marketing-settings', 'global-cache'] 
    }
  )();
});

/**
 * Fetches global app settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getGlobalAppSettings = cache(async (): Promise<any> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(APP_CONFIG_DOC_ID).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          return {
            ...defaultAppSettings,
            ...data,
          };
        }
        return defaultAppSettings;
      } catch (error) {
        console.error('Error fetching global app settings via Admin SDK:', error);
        return defaultAppSettings;
      }
    },
    ['global-app-settings'],
    { 
      revalidate: false, 
      tags: ['app-settings', 'global-cache'] 
    }
  )();
});

/**
 * Fetches global web settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getGlobalWebSettings = cache(async (): Promise<GlobalWebSettings> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(WEB_SETTINGS_DOC_ID).get();
        if (docSnap.exists) {
          const data = docSnap.data() as Partial<GlobalWebSettings>;
          
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
            globalAdminPopup: {
              ...defaultGlobalWebSettings.globalAdminPopup,
              ...(data.globalAdminPopup || {}),
            },
          } as GlobalWebSettings;
        }
        return defaultGlobalWebSettings;
      } catch (error) {
        console.error('Error fetching global web settings via Admin SDK:', error);
        return defaultGlobalWebSettings;
      }
    },
    ['global-web-settings'],
    { 
      revalidate: false, 
      tags: ['web-settings', 'global-cache'] 
    }
  )();
});
