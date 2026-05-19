
"use client";

import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react'; // Added useState
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase'; // Import db
import { doc, getDoc } from 'firebase/firestore'; // Import Firestore functions
import type { ProviderApplication } from '@/types/firestore'; // Import ProviderApplication type

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";

const ProtectedRoute: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, isLoading: authIsLoading, triggerAuthRedirect } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isProviderApproved, setIsProviderApproved] = useState<boolean | null>(null); // null initially, true/false after check
  const [isCheckingProviderStatus, setIsCheckingProviderStatus] = useState(false);

  useEffect(() => {
    if (authIsLoading) return;

    const isAdminRoute = pathname.startsWith('/admin');
    const isProviderRoute = pathname.startsWith('/provider');
    const isAdminLoginPage = pathname === '/admin/login';
    
    const protectedClientRoutes = [
      '/profile', '/my-bookings', '/checkout/schedule', '/checkout/address',
      '/checkout/payment', '/checkout/thank-you', '/notifications', '/chat', '/cart', '/my-address',
      '/custom-service'
    ];
    const isExplicitlyProtectedClientRoute = protectedClientRoutes.some(route => pathname.startsWith(route));

    const checkProviderApproval = async (userId: string) => {
      setIsCheckingProviderStatus(true);
      try {
        const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, userId);
        const docSnap = await getDoc(appDocRef);
        if (docSnap.exists() && docSnap.data()?.status === 'approved') {
          setIsProviderApproved(true);
        } else {
          setIsProviderApproved(false);
          if (isProviderRoute && pathname !== '/provider-registration') { // Only toast/redirect if trying to access provider panel
             toast({ title: "Access Denied", description: "Your provider application is not approved or found.", variant: "destructive" });
             router.push('/');
          }
        }
      } catch (error) {
        console.error("Error checking provider status:", error);
        setIsProviderApproved(false);
        if (isProviderRoute && pathname !== '/provider-registration') {
            toast({ title: "Error", description: "Could not verify provider status.", variant: "destructive" });
            router.push('/');
        }
      } finally {
        setIsCheckingProviderStatus(false);
      }
    };

    if (!user) { // User is not logged in
      if (isAdminRoute && !isAdminLoginPage) {
        triggerAuthRedirect('/admin/login');
      } else if (isProviderRoute && pathname !== '/provider-registration') { // Provider registration is a public-ish page (needs login for steps > 0)
        triggerAuthRedirect(pathname); // Redirect to login, then back to provider page
      } else if (isExplicitlyProtectedClientRoute) {
        triggerAuthRedirect(pathname);
      }
    } else { // User is logged in
      if (isAdminRoute) {
        if (user.email !== ADMIN_EMAIL) {
          toast({ title: "Access Denied", description: "You are not authorized for the admin panel.", variant: "destructive" });
          router.push('/');
        }
      } else if (isAdminLoginPage && user.email === ADMIN_EMAIL) {
        router.push('/admin');
      } else if (isAdminLoginPage && user.email !== ADMIN_EMAIL) {
        toast({ title: "Access Denied", description: "Admin login is for administrators only.", variant: "destructive"});
        router.push('/');
      } else if (isProviderRoute) {
        // If it's a provider route, check their application status
        if (isProviderApproved === null && !isCheckingProviderStatus) { // Check only if not already checked or checking
            checkProviderApproval(user.uid);
        }
      }
    }
  }, [user, authIsLoading, router, pathname, toast, triggerAuthRedirect, isProviderApproved, isCheckingProviderStatus]);

  if (authIsLoading || (pathname.startsWith('/provider') && isCheckingProviderStatus && isProviderApproved === null)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Further checks after loading states are resolved
  if (!user) {
    const isAuthPage = pathname.startsWith('/auth/');
    const publicPagesRequiringNoRedirect = [
      '/', '/about-us', '/contact-us', '/categories', '/faq', 
      '/privacy-policy', '/terms-and-conditions', '/cancellation-policy', '/service-disclaimer',
      '/provider-registration' // Allow access to provider registration landing for guests
    ];
    const isDynamicPublicContent = pathname.startsWith('/category/') || pathname.startsWith('/service/') || (pathname.startsWith('/[city]') && pathname.split('/').length <= 3);


    if (!isAuthPage && !publicPagesRequiringNoRedirect.includes(pathname) && !isDynamicPublicContent && !pathname.startsWith('/admin')) {
      // This condition is now more specific. If it's a protected client route not handled by above,
      // it might briefly show children before redirect. The primary redirect logic is in useEffect.
      // For very sensitive pages, you might return a loader here too if `triggerAuthRedirect` is not instant.
    }
  } else if (user.email !== ADMIN_EMAIL && pathname.startsWith('/admin') && pathname !== '/admin/login') {
      return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-2">Unauthorized. Redirecting...</p></div>;
  } else if (pathname.startsWith('/provider') && pathname !== '/provider-registration' && !isProviderApproved) {
      // If on a provider route (not registration) and not approved (and done checking)
      // This also serves as a fallback if the useEffect redirect hasn't completed
      return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-destructive" /><p className="ml-2">Access Denied to Provider Panel.</p></div>;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
