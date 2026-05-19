import React from 'react';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory } from '@/types/firestore';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { MapPin, ArrowRight, Star } from 'lucide-react';
import AppImage from '@/components/ui/AppImage';
import { getCategorySearchTerm } from '@/lib/seoAdvancedUtils';
import { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const appBaseUrl = getBaseUrl();
  return {
    title: "Home Services Near Me | Local Handyman Services Bangalore | FixBro",
    description: "Find the best home services near me in Bangalore. Verified carpenters, plumbers, electricians, and more available for same-day service across Bangalore.",
    alternates: { canonical: `${appBaseUrl}/near-me` }
  };
}

async function getCategories() {
  const snapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).orderBy('order', 'asc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreCategory));
}

async function getCities() {
  const snapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
  return snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, slug: doc.data().slug }));
}

export default async function NearMeHubPage() {
  const categories = await getCategories();
  const cities = await getCities();

  return (
    <div className="bg-background min-h-screen">
      {/* Hero Section */}
      <div className="bg-primary/5 py-12 md:py-20 border-b">
        <div className="container mx-auto px-4 text-center">
          <Badge className="mb-4 px-4 py-1 text-sm">Bangalore's #1 Local Service Network</Badge>
          <h1 className="text-3xl md:text-5xl font-headline font-bold text-foreground mb-6">
            Home Services Near Me
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find and book verified local experts for all your home repair and installation needs. Same-day availability across Bangalore.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {/* Categories Grid */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold mb-8 flex items-center gap-2">
            <MapPin className="text-primary h-6 w-6" /> Find Services Near Me
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {categories.map((cat) => {
              const searchTerm = getCategorySearchTerm(cat.name);
              return (
                <Link 
                  key={cat.id} 
                  href={`/near-me/${cat.slug}`}
                  className="group bg-card border rounded-2xl p-4 md:p-6 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center"
                >
                  <div className="relative w-16 h-16 md:w-20 md:h-20 mb-4 bg-muted/50 rounded-full p-3 overflow-hidden">
                    <AppImage 
                      src={cat.imageUrl || '/default-image.png'} 
                      alt={`${searchTerm} Near Me`} 
                      fill 
                      className="object-contain group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition-colors">
                    {searchTerm} Near Me
                  </h3>
                  <div className="mt-2 flex items-center gap-1 text-yellow-500">
                    <Star className="fill-current h-3 w-3" />
                    <span className="text-xs font-semibold text-muted-foreground">4.8 (Verified)</span>
                  </div>
                  <div className="mt-4 text-primary opacity-0 group-hover:opacity-100 flex items-center gap-1 text-sm font-medium transition-all">
                    Book Now <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Location Links */}
        <div className="bg-muted/30 rounded-3xl p-8 md:p-12">
          <h2 className="text-2xl font-headline font-bold mb-8 text-center">Serving All of Bangalore</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {cities.map(city => (
              <div key={city.id} className="space-y-4">
                <h3 className="font-bold text-xl border-b pb-2">{city.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {categories.slice(0, 10).map(cat => (
                    <Link key={cat.id} href={`/${city.slug}/category/${cat.slug}`}>
                      <Badge variant="outline" className="hover:bg-primary hover:text-white transition-colors cursor-pointer">
                        {getCategorySearchTerm(cat.name)} in {city.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* SEO Bottom Content */}
        <div className="mt-20 max-w-4xl mx-auto prose prose-sm md:prose-base text-muted-foreground text-center">
            <h2 className="text-foreground">Why Search for "Home Services Near Me" on FixBro?</h2>
            <p>
                When you search for <strong>carpenter near me</strong> or <strong>plumber near me</strong>, you want speed, reliability, and trust. FixBro is designed to connect Bangalore residents with the closest verified professionals in under 60 seconds. Our hyper-local algorithm ensures that the expert assigned to you is already serving your neighborhood, whether it's Whitefield, HSR Layout, or Koramangala.
            </p>
        </div>
      </div>
    </div>
  );
}
