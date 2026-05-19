
// This is now a Server Component wrapper
import EditBookingPageClient from './EditBookingPageClient';

// For output: 'export', this tells Next.js not to pre-render any specific booking IDs
// The actual page content will be client-side rendered.
export async function generateStaticParams(): Promise<{ bookingId: string }[]> {
  return [];
}

interface PageProps {
  params: Promise<{ bookingId: string }>;
}

// No data fetching here, client component handles it
export default async function Page({ params }: PageProps) {
  // We don't await params here because this is just a wrapper.
  // The client component will use the `useParams` hook which is synchronous client-side.
  // We pass the params directly to the client component.
  return <EditBookingPageClient />;
}
