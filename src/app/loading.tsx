
import AppLoader from '@/components/shared/AppLoader';
import { cookies } from 'next/headers';

export default async function Loading() {
  const cookieStore = await cookies();
  const initialLoaderType = cookieStore.get('fixbro-loader-type')?.value || 'logo-pulse';
  return <AppLoader text="Loading page..." initialLoaderType={initialLoaderType} />;
}
