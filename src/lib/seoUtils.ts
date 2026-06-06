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

  // Dynamic Content Templates (SEO Optimized)

cityCategorySeoContentTemplate: `
<section class="space-y-5">

  <h2>Professional {{categoryName}} Services in {{cityName}}</h2>

  <p>
    Looking for trusted {{categoryName}} services in {{cityName}}? FixBro helps homeowners, tenants, businesses, and property managers connect with experienced professionals for quality service solutions. Whether you need installation, repair, maintenance, replacement, assembly, inspection, or support services, our experts are ready to help.
  </p>

  <p>
    Our {{categoryName}} professionals in {{cityName}} are selected based on experience, skills, and service quality standards. Every job is handled using professional tools and proven techniques to ensure reliable results and customer satisfaction.
  </p>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Verified Professionals</strong><br>
      Skilled experts with practical field experience.
    </div>

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Transparent Pricing</strong><br>
      Know estimated costs before work begins.
    </div>

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Quick Booking</strong><br>
      Easy scheduling with flexible appointment options.
    </div>

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Quality Workmanship</strong><br>
      Professional service delivered using proper tools.
    </div>

  </div>

  <h3>Why Choose FixBro for {{categoryName}} in {{cityName}}?</h3>

  <ul>
    <li>Experienced local professionals</li>
    <li>Convenient online booking process</li>
    <li>Coverage across major areas of {{cityName}}</li>
    <li>Residential and commercial service support</li>
    <li>Professional tools and modern techniques</li>
    <li>Reliable customer assistance</li>
  </ul>

  <h3>Popular {{categoryName}} Requirements in {{cityName}}</h3>

  <p>
    Customers commonly book services for installation work, repairs, maintenance, replacements, inspections, upgrades, emergency support, and routine service requirements.
  </p>

  <p>
    Book trusted {{categoryName}} services near you in {{cityName}} and get professional assistance from experienced experts through FixBro.
  </p>

</section>
`,

cityCategoryFaqsTemplate: [
  {
    question: "What {{categoryName}} services are available in {{cityName}}?",
    answer: "FixBro offers installation, repair, maintenance, replacement, inspection, assembly, and other professional {{categoryName}} services across {{cityName}}."
  },
  {
    question: "How do I book {{categoryName}} services in {{cityName}}?",
    answer: "Simply choose your required service, select an available time slot, provide your address details, and confirm your booking online."
  },
  {
    question: "Are your {{categoryName}} professionals verified?",
    answer: "Yes. All service professionals undergo verification and quality assessment before joining the FixBro platform."
  },
  {
    question: "Do you provide same-day {{categoryName}} services in {{cityName}}?",
    answer: "Same-day appointments may be available depending on professional availability and service demand in your area."
  },
  {
    question: "What are the charges for {{categoryName}} services in {{cityName}}?",
    answer: "Service pricing depends on the type of work, complexity, materials required, and duration. Pricing details are displayed before booking confirmation."
  },
  {
    question: "Do you provide services for homes and offices?",
    answer: "Yes. Our professionals provide {{categoryName}} services for residential properties, apartments, villas, offices, shops, and commercial establishments."
  }
],

areaCategorySeoContentTemplate: `
<section class="space-y-5">

  <h2>{{categoryName}} Services in {{areaName}}, {{cityName}}</h2>

  <p>
    Need professional {{categoryName}} services in {{areaName}}? FixBro connects customers with trusted local experts who provide reliable service solutions for homes, apartments, offices, retail shops, and commercial properties throughout {{areaName}}.
  </p>

  <p>
    Our local professionals understand the service requirements of customers in {{areaName}} and provide prompt assistance, quality workmanship, and convenient scheduling options. From small repairs to complete installations and maintenance projects, we help ensure every job is completed efficiently.
  </p>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Local Experts</strong><br>
      Professionals serving {{areaName}} and nearby locations.
    </div>

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Fast Response</strong><br>
      Quick service scheduling and local availability.
    </div>

    <div class="p-4 bg-muted/30 rounded-lg">
      <strong>Trusted Service</strong><br>
      Reliable workmanship and customer-focused support.
    </div>

  </div>

  <h3>Benefits of Booking in {{areaName}}</h3>

  <ul>
    <li>Dedicated local service professionals</li>
    <li>Faster arrival and response times</li>
    <li>Flexible appointment scheduling</li>
    <li>Residential and commercial support</li>
    <li>Professional tools and equipment</li>
    <li>Reliable service quality standards</li>
  </ul>

  <h3>Serving Customers Across {{areaName}}</h3>

  <p>
    We help customers in apartments, independent houses, villas, gated communities, office spaces, retail outlets, and commercial buildings throughout {{areaName}} with dependable {{categoryName}} services.
  </p>

  <p>
    If you are searching for trusted {{categoryName}} near {{areaName}}, {{cityName}}, FixBro helps you connect with experienced professionals for quality service and dependable support.
  </p>

</section>
`,

areaCategoryFaqsTemplate: [
  {
    question: "Do you provide {{categoryName}} services in {{areaName}}?",
    answer: "Yes. FixBro provides professional {{categoryName}} services throughout {{areaName}} and nearby localities in {{cityName}}."
  },
  {
    question: "How quickly can a professional reach {{areaName}}?",
    answer: "Arrival time depends on professional availability and booking schedules. Local professionals help reduce waiting times."
  },
  {
    question: "Can I schedule a specific appointment time in {{areaName}}?",
    answer: "Yes. You can choose an available date and time slot during the booking process."
  },
  {
    question: "Do you provide services for apartments and gated communities in {{areaName}}?",
    answer: "Yes. Our professionals regularly serve apartments, villas, gated communities, offices, and commercial properties in {{areaName}}."
  },
  {
    question: "Are emergency or urgent services available in {{areaName}}?",
    answer: "Urgent service availability depends on the category and professional availability in your locality."
  },
  {
    question: "Why choose FixBro in {{areaName}}?",
    answer: "FixBro connects customers with experienced professionals, transparent pricing, convenient booking, and reliable service support."
  }
],
};

/**
 * Replace placeholders dynamically
 */
export function replacePlaceholders(
  template: string | undefined | null,
  data: Record<string, string | number | undefined | null>,
  isTitle: boolean = false
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

  // Auto append title suffix only once, and ONLY if it's a title
  if (isTitle) {
    const titleSuffix = defaultSeoValues.defaultMetaTitleSuffix || '';
    if (result && titleSuffix && !result.endsWith(titleSuffix)) {
      result += titleSuffix;
    }
  }
  
  return result;
}