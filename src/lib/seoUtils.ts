// src/lib/seoUtils.ts
import type { FirestoreSEOSettings } from '@/types/firestore';
import { cleanSeoString, getCategorySearchTerm } from './seoAdvancedUtils';

// Define default SEO values
export const defaultSeoValues: FirestoreSEOSettings = {
  siteName: 'FixBro – Home Services in Bangalore',
  defaultMetaTitleSuffix: ' | FixBro Bangalore',
  defaultMetaDescription: 'Home services in Bangalore including carpenter, plumber, electrician, and more. Book experts near you in Bangalore.',
  defaultMetaKeywords: 'home services bangalore, handyman bangalore, carpenter in bangalore, plumber in bangalore, electrician in bangalore',
  homepageMetaTitle: 'Home Services in Bangalore | Handyman Near Me | FixBro',
  homepageMetaDescription: 'FixBro provides home services in Bangalore including carpentry, electrical, plumbing, painting, and installations. Book home services near me in Bangalore.',
  homepageMetaKeywords: 'home services bangalore, handyman near me, home repair bangalore, home maintenance bangalore',
  homepageH1: 'Home Services in Bangalore',
  categoryPageTitlePattern: '{{categorySearchTerm}} in Bangalore | {{categorySearchTerm}} Near Me | FixBro',
  categoryPageDescriptionPattern: '{{categorySearchTerm}} in Bangalore. Verified experts for repair, installation, and maintenance across Bangalore. Book online.',
  categoryPageKeywordsPattern: '{{categorySearchTerm}} in bangalore, {{categorySearchTerm}} services bangalore, {{categorySearchTerm}} near me',
  categoryPageH1Pattern: '{{categorySearchTerm}} in Bangalore',
  cityCategoryPageTitlePattern: '{{categorySearchTerm}} in {{cityName}} | {{categorySearchTerm}} Near Me | FixBro',
  cityCategoryPageDescriptionPattern: '{{categorySearchTerm}} in {{cityName}}. Reliable experts for repair and installation. Book {{categorySearchTerm}} near me in Bangalore.',
  cityCategoryPageKeywordsPattern: '{{categorySearchTerm}} in {{cityName}}, {{categorySearchTerm}} services {{cityName}}, {{categorySearchTerm}} near me',
  cityCategoryPageH1Pattern: '{{categorySearchTerm}} in {{cityName}}',
  areaCategoryPageTitlePattern: '{{categorySearchTerm}} in {{areaName}} | {{categorySearchTerm}} Near Me | FixBro',
  areaCategoryPageDescriptionPattern: '{{categorySearchTerm}} in {{areaName}}, Bangalore. Expert repair and installation services. Book {{categorySearchTerm}} near me {{areaName}}.',
  areaCategoryPageKeywordsPattern: '{{categorySearchTerm}} in {{areaName}}, {{categorySearchTerm}} {{areaName}} bangalore, {{categorySearchTerm}} near me {{areaName}}',
  areaCategoryPageH1Pattern: '{{categorySearchTerm}} in {{areaName}}',
  servicePageTitlePattern: '{{serviceName}} in {{cityName}} | {{categorySearchTerm}} Near Me | FixBro',
  servicePageDescriptionPattern: '{{serviceName}} in {{cityName}}, Bangalore. Reliable solutions with trusted professionals and transparent pricing.',
  servicePageKeywordsPattern: '{{serviceName}} bangalore, {{categorySearchTerm}} {{cityName}}, book {{serviceName}} online bangalore',
  servicePageH1Pattern: '{{serviceName}} in Bangalore',
  areaPageTitlePattern: 'Home Services in {{areaName}} | Handyman Near Me | FixBro',
  areaPageDescriptionPattern: 'Home services in {{areaName}}, Bangalore. FixBro provides professionals for all your home repair and installation needs.',
  areaPageKeywordsPattern: 'home services {{areaName}}, handyman {{areaName}} bangalore, home repair {{areaName}}',
  areaPageH1Pattern: 'Home Services in {{areaName}}',
  cityPageTitlePattern: 'Home Services in {{cityName}} | Handyman Near Me | FixBro',
  cityPageDescriptionPattern: 'Home services in {{cityName}}. Book experts for carpentry, electrical, plumbing, painting, and more.',
  cityPageKeywordsPattern: 'home services {{cityName}}, handyman bangalore, home repair {{cityName}}',
  cityPageH1Pattern: 'Home Services in {{cityName}}',
  structuredDataType: 'LocalBusiness',
  structuredDataName: 'FixBro',
  structuredDataStreetAddress: '#44, G S Palya Road, Konappana Agrahara, Electronic City Phase 2',
  structuredDataLocality: 'Bangalore',
  structuredDataRegion: 'Karnataka',
  structuredDataPostalCode: '560100',
  structuredDataCountry: 'IN',
  structuredDataTelephone: '+91-7353113455',
  structuredDataImage: 'https://fixbro.in/android-chrome-512x512.png',
  socialProfileUrls: {
    facebook: 'https://www.facebook.com/fixbro.in',
    twitter: 'https://x.com/fixbro_in',
    instagram: 'https://www.instagram.com/fixbro.in/',
    linkedin: 'https://www.linkedin.com/company/fixbro-in',
    youtube: 'https://www.youtube.com/@fixbro-in',
  },
  fallbackRatingValue: '4.8',
  fallbackReviewCount: '850',
};

/**
 * Utility to replace placeholders in a string and clean it.
 * @param template The string with placeholders like {{name}}
 * @param data An object containing values for the placeholders
 * @returns The string with placeholders replaced and redundant words cleaned
 */
export function replacePlaceholders(
  template: string | undefined | null,
  data: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';
  
  let result = template;

  // Add categorySearchTerm if categoryName is present but categorySearchTerm is missing
  const extendedData = { ...data };
  if (extendedData.categoryName && !extendedData.categorySearchTerm) {
    extendedData.categorySearchTerm = getCategorySearchTerm(String(extendedData.categoryName));
  }

  try {
    for (const key in extendedData) {
      if (Object.prototype.hasOwnProperty.call(extendedData, key)) {
        const placeholderValue = extendedData[key];
        if (placeholderValue !== undefined && placeholderValue !== null) {
           result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(placeholderValue));
        } else {
           result = result.replace(new RegExp(`{{${key}}}`, 'g'), '');
        }
      }
    }
  } catch (e) {
    return template;
  }
  
  // Clean the result to remove redundant words
  return cleanSeoString(result);
}
