
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc } from "firebase/firestore";
import { db } from '@/lib/firebase';
import type { FeaturesConfiguration, MarketingAutomationSettings } from '@/types/firestore';
import { getCache, setCache } from '@/lib/client-cache';

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation";
const CACHE_KEY = "features-and-marketing-config";

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: true,
  homepageCategoryVisibility: {},
  ads: [],
};

interface UseFeaturesAndAutomationConfigReturn {
  featuresConfig: FeaturesConfiguration;
  marketingConfig: MarketingAutomationSettings | null;
  isLoading: boolean;
}

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

export function useFeaturesConfig(): UseFeaturesAndAutomationConfigReturn {
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(() => {
    const cached = getCache<{features: FeaturesConfiguration, marketing: MarketingAutomationSettings | null}>(CACHE_KEY, true);
    return cached ? cached.features : defaultFeaturesConfig;
  });
  const [marketingConfig, setMarketingConfig] = useState<MarketingAutomationSettings | null>(() => {
    const cached = getCache<{features: FeaturesConfiguration, marketing: MarketingAutomationSettings | null}>(CACHE_KEY, true);
    return cached ? cached.marketing : null;
  });
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // If it's a bot, skip fetching to save reads
    if (isBot()) {
      setIsLoading(false);
      return;
    }

    // Skip if already loaded in this session
    if (hasLoadedRef.current) return;

    const fetchConfigs = async () => {
      try {
        // Smart Cache Logic: Check global cache version (1 read)
        const versionDocRef = doc(db, "appConfiguration", "cacheVersions");
        const versionSnap = await getDoc(versionDocRef);
        const remoteVersion = versionSnap.exists() ? (versionSnap.data().global || 0) : 0;
        
        const localVersion = parseInt(localStorage.getItem(`${CACHE_KEY}-version`) || "0");
        const cached = getCache<{features: FeaturesConfiguration, marketing: MarketingAutomationSettings | null}>(CACHE_KEY, true);
        
        if (cached && remoteVersion <= localVersion) {
            setFeaturesConfig(cached.features);
            setMarketingConfig(cached.marketing);
            setIsLoading(false);
            hasLoadedRef.current = true;
            return;
        }

        // Fetch fresh if version changed (2 reads for features and marketing)
        const featuresConfigRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
        const marketingConfigRef = doc(db, FEATURES_CONFIG_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
        
        const [featuresSnap, marketingSnap] = await Promise.all([
            getDoc(featuresConfigRef),
            getDoc(marketingConfigRef)
        ]);

        let finalFeatures = defaultFeaturesConfig;
        let finalMarketing = null;

        if (featuresSnap.exists()) {
          finalFeatures = { ...defaultFeaturesConfig, ...(featuresSnap.data() as Partial<FeaturesConfiguration>) };
        }
        
        if (marketingSnap.exists()) {
          finalMarketing = marketingSnap.data() as MarketingAutomationSettings;
        }

        setFeaturesConfig(finalFeatures);
        setMarketingConfig(finalMarketing);
        
        const dataToCache = { features: finalFeatures, marketing: finalMarketing };
        setCache(CACHE_KEY, dataToCache, true);
        localStorage.setItem(`${CACHE_KEY}-version`, remoteVersion.toString());

      } catch (error) {
        console.error("Error fetching configurations in useFeaturesConfig:", error);
      } finally {
        setIsLoading(false);
        hasLoadedRef.current = true;
      }
    };
    
    fetchConfigs();
  }, []);

  return { featuresConfig, marketingConfig, isLoading };
}

