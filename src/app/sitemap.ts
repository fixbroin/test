import { MetadataRoute } from 'next';
import { adminDb } from '@/lib/firebaseAdmin'; 
import { Timestamp } from 'firebase-admin/firestore'; 
import type { FirestoreCategory, FirestoreService, FirestoreCity, FirestoreArea, FirestoreBlogPost, ContentPage } from '@/types/firestore';
import { getBaseUrl } from '@/lib/config'; 
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-static'; 
export const revalidate = false;

const safeToISOString = (timestamp: Timestamp | undefined | string | Date, fallbackDate: string): string => {
  try {
    if (timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
      return (timestamp as Timestamp).toDate().toISOString();
    }
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    return fallbackDate;
  } catch (e) {
    return fallbackDate;
  }
};

async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const appBaseUrl = getBaseUrl(); 
  const entries: MetadataRoute.Sitemap = [];
  const currentDate = new Date().toISOString();

  const staticPages = [
    '', '/about-us', '/contact-us', '/careers', '/terms-and-conditions',
    '/privacy-policy', '/faq', '/service-disclaimer', '/cancellation-policy', '/damage-and-claims-policy', '/categories', 
    '/blog', '/sitemap', '/near-me',
  ];

  staticPages.forEach(page => {
    entries.push({
      url: `${appBaseUrl}${page}`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: page === '' ? 1.0 : 0.8,
    });
  });

  // Add category-specific near-me pages
  try {
    const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();
    categoriesSnapshot.forEach(docSnap => {
      const categoryData = docSnap.data() as FirestoreCategory;
      if (categoryData.slug) {
        entries.push({
          url: `${appBaseUrl}/near-me/${categoryData.slug}`,
          lastModified: currentDate,
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error adding near-me categories:", e);
  }

  try {
    const contentPagesSnapshot = await adminDb.collection('contentPages').get();
    contentPagesSnapshot.forEach(docSnap => {
      const pageData = docSnap.data() as ContentPage;
      if (pageData.slug && !staticPages.includes(`/${pageData.slug}`)) {
        entries.push({
          url: `${appBaseUrl}/${pageData.slug}`,
          lastModified: safeToISOString(pageData.updatedAt || pageData.createdAt, currentDate),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching content pages:", e);
  }

  try {
    const blogSnapshot = await adminDb
      .collection('blogPosts')
      .where('isPublished', '==', true)
      .get();
    blogSnapshot.forEach(docSnap => {
      const blogData = docSnap.data() as FirestoreBlogPost;
      if (blogData.slug) {
        entries.push({
          url: `${appBaseUrl}/blog/${blogData.slug}`,
          lastModified: safeToISOString(blogData.updatedAt || blogData.createdAt, currentDate),
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching blog posts:", e);
  }

  try {
    const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();
    categoriesSnapshot.forEach(docSnap => {
      const categoryData = docSnap.data() as FirestoreCategory;
      if (categoryData.slug) {
        entries.push({
          url: `${appBaseUrl}/category/${categoryData.slug}`,
          lastModified: safeToISOString(categoryData.createdAt, currentDate),
          changeFrequency: 'daily',
          priority: 0.9,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching categories:", e);
  }

  try {
    const servicesSnapshot = await adminDb
      .collection('adminServices')
      .where('isActive', '==', true)
      .get();
    servicesSnapshot.forEach(docSnap => {
      const serviceData = docSnap.data() as FirestoreService;
      if (serviceData.slug) {
        entries.push({
          url: `${appBaseUrl}/service/${serviceData.slug}`,
          lastModified: safeToISOString(serviceData.updatedAt || serviceData.createdAt, currentDate),
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
    });
  } catch (e) {
    console.error("Sitemap: Error fetching services:", e);
  }

  try {
    const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
    const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();

    for (const cityDoc of citiesSnapshot.docs) {
      const city = cityDoc.data() as FirestoreCity;
      if (!city.slug) continue;

      entries.push({
        url: `${appBaseUrl}/${city.slug}`,
        lastModified: safeToISOString(city.updatedAt || city.createdAt, currentDate),
        changeFrequency: 'daily',
        priority: 0.9,
      });

      categoriesSnapshot.forEach(categoryDoc => {
        const category = categoryDoc.data() as FirestoreCategory;
        if (category.slug) {
          entries.push({
            url: `${appBaseUrl}/${city.slug}/category/${category.slug}`,
            lastModified: safeToISOString(category.createdAt, currentDate),
            changeFrequency: 'daily',
            priority: 0.8,
          });
        }
      });

      const areasSnapshot = await adminDb.collection('areas').where('cityId', '==', cityDoc.id).where('isActive', '==', true).get();
      areasSnapshot.forEach(areaDoc => {
        const area = areaDoc.data() as FirestoreArea;
        if (area.slug) {
          entries.push({
            url: `${appBaseUrl}/${city.slug}/${area.slug}`,
            lastModified: safeToISOString(area.updatedAt || area.createdAt, currentDate),
            changeFrequency: 'daily',
            priority: 0.8,
          });

          categoriesSnapshot.forEach(categoryDoc => {
            const category = categoryDoc.data() as FirestoreCategory;
            if (category.slug) {
              entries.push({
                url: `${appBaseUrl}/${city.slug}/${area.slug}/${category.slug}`,
                lastModified: safeToISOString(category.createdAt, currentDate),
                changeFrequency: 'daily',
                priority: 0.7,
              });
            }
          });
        }
      });
    }
  } catch (e) {
    console.error("Sitemap: Error fetching cities/areas/categories:", e);
  }

  const uniqueEntries = Array.from(new Map(entries.map(entry => [entry.url, entry])).values());
  return uniqueEntries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return unstable_cache(
    async () => {
      try {
        return await getSitemapEntries();
      } catch (error) {
        console.error("SITEMAP_GENERATION_ERROR: Failed to generate sitemap entries:", error);
        const appBaseUrl = getBaseUrl(); 
        return [
          {
            url: appBaseUrl,
            lastModified: new Date().toISOString(),
            changeFrequency: 'yearly' as const,
            priority: 0.1,
          },
        ];
      }
    },
    ['sitemap-data'],
    { 
      revalidate: false, 
      tags: ['sitemap', 'global-cache'] 
    }
  )();
}
