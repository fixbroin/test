// src/lib/seoUtils.ts

import type { FirestoreSEOSettings } from '@/types/firestore';
import { cleanSeoString, getCategorySearchTerm } from './seoAdvancedUtils';

export const defaultSeoValues: FirestoreSEOSettings = {
  siteName: 'FixBro - Home Services in Bangalore',

  // Automatically added to every meta title
  defaultMetaTitleSuffix: ' | FixBro',

  defaultMetaDescription:
    'Book trusted carpenter, plumber, electrician, TV installation, painting, interior work, furniture assembly, and home repair services near you in Bangalore.',

  defaultMetaKeywords:
    'carpenter near me, plumber near me, electrician near me, tv installation near me, painting services near me, interior designers near me, furniture assembly near me, home repair services bangalore',

  homepageMetaTitle:
    'Carpenter, Plumber, Electrician & TV Installation Services Near Me in Bangalore',

  homepageMetaDescription:
    'Book trusted carpenter, plumber, electrician, TV installation, painting, interior work, furniture assembly, and home repair services near you in Bangalore at affordable prices.',

  homepageMetaKeywords:
    'carpenter near me, plumber near me, electrician near me, tv installation near me, painting services near me, interior designers near me, furniture assembly near me, handyman services bangalore',

  homepageH1:
    'Trusted Home Services Near You in Bangalore',

  categoryPageTitlePattern:
    '{{categorySearchTerm}} Near Me in Bangalore',

  categoryPageDescriptionPattern:
    'Book trusted {{categorySearchTerm}} near you in Bangalore for installation, repair, replacement, maintenance, and handyman services at affordable prices.',

  categoryPageKeywordsPattern:
    '{{categorySearchTerm}} near me, best {{categorySearchTerm}} near me, affordable {{categorySearchTerm}} in bangalore, local {{categorySearchTerm}} services',

  categoryPageH1Pattern:
    '{{categorySearchTerm}} Services in Bangalore',

  cityCategoryPageTitlePattern:
    '{{categorySearchTerm}} in {{cityName}} Bangalore | Near Me',

  cityCategoryPageDescriptionPattern:
    'Professional {{categorySearchTerm}} services in {{cityName}} Bangalore by trusted experts near you for homes and offices.',

  cityCategoryPageKeywordsPattern:
    '{{categorySearchTerm}} {{cityName}}, {{categorySearchTerm}} near me, best {{categorySearchTerm}} in {{cityName}}, affordable {{categorySearchTerm}}',

  cityCategoryPageH1Pattern:
    '{{categorySearchTerm}} Services in {{cityName}}',

  areaCategoryPageTitlePattern:
    '{{categorySearchTerm}} in {{areaName}} Bangalore | Near Me',

  areaCategoryPageDescriptionPattern:
    'Looking for {{categorySearchTerm}} in {{areaName}} Bangalore? Book trusted experts near you for repair, installation, maintenance, and replacement services.',

  areaCategoryPageKeywordsPattern:
    '{{categorySearchTerm}} {{areaName}}, {{categorySearchTerm}} near me {{areaName}}, best {{categorySearchTerm}} {{areaName}}, affordable {{categorySearchTerm}}',

  areaCategoryPageH1Pattern:
    '{{categorySearchTerm}} Services in {{areaName}}',

  servicePageTitlePattern:
    '{{serviceName}} Near Me in Bangalore',

  servicePageDescriptionPattern:
    'Book professional {{serviceName}} near you in Bangalore for fast, affordable, and trusted repair, installation, and maintenance services.',

  servicePageKeywordsPattern:
    '{{serviceName}} near me, best {{serviceName}} in bangalore, affordable {{serviceName}}, local {{serviceName}} services',

  servicePageH1Pattern:
    '{{serviceName}} in Bangalore',

  areaPageTitlePattern:
    'Carpenter, Plumber & Electrician Services in {{areaName}}',

  areaPageDescriptionPattern:
    'Book carpenter, plumber, electrician, TV installation, painting, furniture assembly, and home repair services in {{areaName}} Bangalore.',

  areaPageKeywordsPattern:
    'carpenter {{areaName}}, plumber {{areaName}}, electrician {{areaName}}, tv installation {{areaName}}, painting services {{areaName}}, home services {{areaName}}',

  areaPageH1Pattern:
    'Home Services in {{areaName}}',

  cityPageTitlePattern:
    'Home Repair Services in {{cityName}}',

  cityPageDescriptionPattern:
    'Book trusted carpenter, plumber, electrician, TV installation, painting, furniture assembly, and home repair services in {{cityName}} Bangalore.',

  cityPageKeywordsPattern:
    'carpenter {{cityName}}, plumber {{cityName}}, electrician {{cityName}}, tv installation {{cityName}}, painting services {{cityName}}, home repair services {{cityName}}',

  cityPageH1Pattern:
    'Home Services in {{cityName}}',

  structuredDataType: 'LocalBusiness',

  structuredDataName: 'FixBro',

  structuredDataStreetAddress:
    '#44, G S Palya Road, Konappana Agrahara, Electronic City Phase 2',

  structuredDataLocality: 'Bangalore',

  structuredDataRegion: 'Karnataka',

  structuredDataPostalCode: '560100',

  structuredDataCountry: 'IN',

  structuredDataTelephone: '+91-7353113455',

  structuredDataImage:
    'https://fixbro.in/android-chrome-512x512.png',

  socialProfileUrls: {
    facebook: 'https://www.facebook.com/fixbro.in',
    twitter: 'https://x.com/fixbro_in',
    instagram: 'https://www.instagram.com/fixbro.in/',
    linkedin: 'https://www.linkedin.com/company/fixbro-in',
    youtube: 'https://www.youtube.com/@fixbro-in',
  },

  fallbackRatingValue: '4.9',

  fallbackReviewCount: '2500',
};

/**
 * Replace placeholders dynamically
 */
export function replacePlaceholders(
  template: string | undefined | null,
  data: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';

  let result = template;

  const extendedData = { ...data };

  // Auto generate category search term
  if (
    extendedData.categoryName &&
    !extendedData.categorySearchTerm
  ) {
    extendedData.categorySearchTerm =
      getCategorySearchTerm(
        String(extendedData.categoryName)
      );
  }

  try {
    for (const key in extendedData) {
      if (
        Object.prototype.hasOwnProperty.call(
          extendedData,
          key
        )
      ) {
        const value = extendedData[key];

        result = result.replace(
          new RegExp(`{{${key}}}`, 'g'),
          value !== undefined && value !== null
            ? String(value)
            : ''
        );
      }
    }
  } catch (error) {
    return template;
  }

  // Clean extra spaces and duplicate separators
  result = cleanSeoString(result);

    // Auto append title suffix only once
  const titleSuffix =
    defaultSeoValues.defaultMetaTitleSuffix || '';

  if (
    result &&
    titleSuffix &&
    !result.endsWith(titleSuffix)
  ) {
    result += titleSuffix;
  }
  return result;
}