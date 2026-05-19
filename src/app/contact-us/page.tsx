import { adminDb } from '@/lib/firebaseAdmin';
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Mail, Phone, MapPin } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 

import ContactUsForm from "@/components/forms/ContactUsForm";
import AppImage from '@/components/ui/AppImage';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { Card, CardContent } from "@/components/ui/card";
import { getContentPageData } from '@/lib/webServerUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';
import type { BreadcrumbItem } from '@/types/ui';

export const revalidate = false;

const PAGE_SLUG = "contact-us";

export async function generateMetadata(
  _: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const pageData = await getContentPageData(PAGE_SLUG);
  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();

  const title = pageData?.metaTitle || `Contact Us | ${seoSettings.siteName || 'FixBro'}`;
  const description = pageData?.metaDescription || "Contact FixBro for any queries, support, or feedback regarding our home services in Bangalore.";

  return {
    title: title,
    description: description,
    alternates: {
      canonical: `${appBaseUrl}/contact-us`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/contact-us`,
      type: 'website',
    },
  };
}

export default async function ContactUsPage() {
  const pageData = await getContentPageData(PAGE_SLUG);

  if (!pageData) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <PackageSearch className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Contact Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The content for this page is currently being updated.
        </p>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: pageData.title },
  ];

  const appBaseUrl = getBaseUrl();
  const contactSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": "Contact FixBro",
    "description": "Contact FixBro for professional home services in Bangalore. Reach us via phone, email, or visit our office.",
    "url": `${appBaseUrl}/contact-us`,
    "mainEntity": {
      "@type": "LocalBusiness",
      "name": "FixBro",
      "image": `${appBaseUrl}/android-chrome-512x512.png`,
      "telephone": "+91-7353113455",
      "email": "support@fixbro.in",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "#44, G S Palya Road, Konappana Agrahara, Electronic City Phase 2",
        "addressLocality": "Bangalore",
        "addressRegion": "KA",
        "postalCode": "560100",
        "addressCountry": "IN"
      },
      "openingHoursSpecification": {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "opens": "08:00",
        "closes": "20:00"
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <JsonLdScript data={contactSchema} idSuffix="contact-page-schema" />
      {/* Header Section */}
      <div className="bg-primary/5 py-20 md:py-32">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="max-w-4xl mx-auto text-center mt-12">
            <h1 className="text-5xl md:text-7xl font-headline font-bold text-foreground mb-8">
              {pageData.title}
            </h1>
            {pageData.excerpt && (
              <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                {pageData.excerpt}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Info Cards */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-primary-foreground overflow-hidden">
                <CardContent className="p-10 space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-2xl font-bold font-headline">Contact Information</h3>
                    <p className="text-primary-foreground/80 font-medium">Reach out to us through any of these channels.</p>
                  </div>
                  
                  <div className="space-y-8">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <Phone className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">Call Us</p>
                        <p className="text-xl font-bold">+91-7353113455</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <Mail className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">Email Us</p>
                        <p className="text-xl font-bold">support@fixbro.in</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <MapPin className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">Visit Us</p>
                        <p className="text-lg font-bold leading-relaxed">
                          #44 G S Palya Road, Konappana Agrahara, Electronic City Phase 2, Bangalore - 560100
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <Card className="rounded-[2.5rem] border-border/50 shadow-2xl bg-card overflow-hidden">
                <CardContent className="p-8 md:p-12">
                  <ContactUsForm />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Embedded Content */}
          <div className="mt-16 bg-card rounded-[3rem] shadow-2xl border border-border/50 overflow-hidden">
            <div className="p-8 md:p-16 lg:p-20">
              <div 
                className="prose prose-xl dark:prose-invert max-w-none 
                  prose-headings:font-headline prose-headings:font-bold prose-headings:text-foreground
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-strong:text-foreground prose-strong:font-bold
                  prose-ul:list-disc prose-li:marker:text-primary"
                dangerouslySetInnerHTML={{ __html: pageData.content }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
