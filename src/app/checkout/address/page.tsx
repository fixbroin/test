
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, ArrowLeft, PlusCircle, CheckCircle, Home, Loader2, AlertTriangle, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { useLoading } from '@/contexts/LoadingContext';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Address, FirestoreUser, ServiceZone } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import AddressForm, { type AddressFormData } from '@/components/forms/AddressForm';
import { getHaversineDistance } from '@/lib/locationUtils'; 
import dynamic from 'next/dynamic'; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false,
});


export default function AddressPage() {
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter(); 
  const pathname = usePathname();
  const { showLoading } = useLoading(); 
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig(); 

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [initialMapCenter, setInitialMapCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [editingAddress, setEditingAddress] = useState<Partial<Address> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isServiceable, setIsServiceable] = useState<boolean | null>(null); // null: unchecked, true: yes, false: no
  const [allServiceZones, setAllServiceZones] = useState<ServiceZone[]>([]);
  const [providerZones, setProviderZones] = useState<ServiceZone[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState(true);

  const currentCategoryId = typeof window !== 'undefined' ? localStorage.getItem('fixbroActiveCheckoutCategory') : null;

  const applicableServiceZones = useMemo(() => {
    const adminZones = allServiceZones.filter(zone => {
      if (!zone.categoryIds || zone.categoryIds.length === 0) {
        return true; // Global zone
      }
      return currentCategoryId && zone.categoryIds.includes(currentCategoryId);
    });

    // Combine Admin Zones and Provider Zones
    return [...adminZones, ...providerZones];
  }, [allServiceZones, providerZones, currentCategoryId]);

  useEffect(() => {
    setIsMounted(true);
    logUserActivity('checkoutStep', { checkoutStepName: 'address', pageUrl: pathname }, user?.uid, !user ? getGuestId() : null);

    const fetchZonesAndProviders = async () => {
      setIsLoadingZones(true);
      try {
        // 1. Fetch Admin Service Zones
        const zonesQuery = query(collection(db, 'serviceZones'), where('isActive', '==', true));
        const zonesSnapshot = await getDocs(zonesQuery);
        const adminZonesData = zonesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceZone));
        setAllServiceZones(adminZonesData);

        // 2. Fetch Approved Providers for the current category
        if (currentCategoryId) {
          const providersQuery = query(
            collection(db, 'providerApplications'), 
            where('status', '==', 'approved'),
            where('workCategoryId', '==', currentCategoryId)
          );
          const providersSnapshot = await getDocs(providersQuery);
          const providersZonesData: ServiceZone[] = providersSnapshot.docs
            .filter(doc => doc.data().workAreaCenter && doc.data().workAreaRadiusKm)
            .map(doc => {
              const data = doc.data();
              return {
                id: `provider_${doc.id}`,
                name: data.fullName || 'Service Provider',
                center: {
                  latitude: data.workAreaCenter.latitude,
                  longitude: data.workAreaCenter.longitude,
                },
                radiusKm: data.workAreaRadiusKm,
                isActive: true,
                createdAt: data.createdAt || Timestamp.now(),
              } as ServiceZone;
            });
          setProviderZones(providersZonesData);
        }
      } catch (error) {
        console.error("Error fetching serviceability data:", error);
        toast({ title: "Error", description: "Could not verify serviceability.", variant: "destructive" });
      } finally {
        setIsLoadingZones(false);
      }
    };
    fetchZonesAndProviders();
  }, [pathname, user, toast, currentCategoryId]);

  useEffect(() => {
    if (!user) {
      if (!isLoadingAuth) {
        setIsLoadingAddresses(false);
        const guestAddressRaw = localStorage.getItem('fixbroCustomerAddress');
        if (!guestAddressRaw) {
          handleOpenMapClick();
        }
      }
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as FirestoreUser;
        setFirestoreUser(userData);
        const userAddresses = userData.addresses || [];
        setSavedAddresses(userAddresses);
        if (userAddresses.length > 0 && !selectedAddressId) {
            const defaultAddress = userAddresses.find(a => a.isDefault);
            setSelectedAddressId(defaultAddress ? defaultAddress.id : userAddresses[0].id);
        } else if (userAddresses.length === 0) {
            handleOpenMapClick();
        }
      } else {
         handleOpenMapClick(); 
      }
      setIsLoadingAddresses(false);
    });
    return () => unsubscribe();
  }, [user, isLoadingAuth, selectedAddressId]);
  
  useEffect(() => {
    if (!user) {
      const savedGuestAddressRaw = localStorage.getItem('fixbroCustomerAddress');
      if (savedGuestAddressRaw) {
        try {
          const savedGuestAddress: Address = JSON.parse(savedGuestAddressRaw);
          savedGuestAddress.id = 'guest_address'; 
          setSavedAddresses([savedGuestAddress]);
          setSelectedAddressId('guest_address');
        } catch (e) { console.error("Error parsing guest address:", e); }
      }
    }
  }, [user, isMounted]);

  const checkServiceability = useCallback((address: Address | Partial<AddressFormData>) => {
    if (isLoadingZones) return; 

    if (allServiceZones.length === 0) {
      setIsServiceable(true); 
      return;
    }
    if (!address.latitude || !address.longitude) {
      setIsServiceable(null); 
      return;
    }

    if (applicableServiceZones.length === 0) {
      setIsServiceable(false);
      toast({ title: "Area Not Serviceable", description: "Sorry, we don't serve this category in your area yet.", variant: "destructive"});
      return;
    }

    const serviceable = applicableServiceZones.some(zone => {
      const distance = getHaversineDistance(
        address.latitude!,
        address.longitude!,
        zone.center.latitude,
        zone.center.longitude
      );
      return distance <= zone.radiusKm;
    });
    setIsServiceable(serviceable);
    if (!serviceable) {
       toast({ title: "Address Not Serviceable", description: "The selected location is outside our service area for this category.", variant: "destructive"});
    }
  }, [allServiceZones, applicableServiceZones, isLoadingZones, toast]);

  useEffect(() => {
    const selectedAddress = savedAddresses.find(a => a.id === selectedAddressId);
    if (selectedAddress) {
      checkServiceability(selectedAddress);
    } else {
      setIsServiceable(null); 
    }
  }, [selectedAddressId, savedAddresses, checkServiceability]);

  const handleOpenMapClick = useCallback(async () => {
    setIsLocating(true);
    try {
        if (!navigator.geolocation) {
            setInitialMapCenter(null);
            setIsMapModalOpen(true);
            setIsLocating(false);
            return;
        }
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (permissionStatus.state === 'granted' || permissionStatus.state === 'prompt') {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setInitialMapCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
                    setIsLocating(false);
                    setIsMapModalOpen(true);
                },
                (error) => {
                    setInitialMapCenter(null); 
                    setIsLocating(false);
                    setIsMapModalOpen(true);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            setInitialMapCenter(null);
            setIsLocating(false);
            setIsMapModalOpen(true);
        }
    } catch (e) {
        setInitialMapCenter(null);
        setIsLocating(false);
        setIsMapModalOpen(true);
    }
  }, []);

  const handleReselectOnMap = useCallback(() => {
    setIsFormOpen(false); 
    handleOpenMapClick(); 
  }, [handleOpenMapClick]);

  const handleMapAddressSelect = useCallback((addressData: Partial<AddressFormData>) => {
    checkServiceability(addressData); 
    setEditingAddress(prev => ({
        ...prev,
        ...addressData,
        ...(!editingAddress && user ? {
            fullName: firestoreUser?.displayName || user?.displayName || "",
            email: firestoreUser?.email || user?.email || "",
            phone: firestoreUser?.mobileNumber || user?.phoneNumber || "",
        } : {})
    }));
    setIsMapModalOpen(false);
    setIsFormOpen(true); 
  }, [checkServiceability, user, firestoreUser, editingAddress]);


  const handleAddressSubmit = async (data: AddressFormData) => {
    setIsSubmitting(true);
    const newAddress: Address = { ...data, id: nanoid(), isDefault: savedAddresses.length === 0 };
    
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { addresses: arrayUnion(newAddress) });
        toast({ title: "Success", description: "New address saved." });
        setSelectedAddressId(newAddress.id);
        setIsFormOpen(false);
      } catch (error) { toast({ title: "Error", description: "Could not save address.", variant: "destructive" }); }
    } else {
      localStorage.setItem('fixbroCustomerAddress', JSON.stringify(newAddress));
      setSavedAddresses([newAddress]);
      setSelectedAddressId(newAddress.id);
      setIsFormOpen(false);
    }
    setIsSubmitting(false);
  };

  const handleProceed = () => {
    const addressToProceed = savedAddresses.find(a => a.id === selectedAddressId);
    if (addressToProceed) {
      // Re-verify serviceability just before proceeding to be absolutely sure
      const serviceable = applicableServiceZones.some(zone => {
        const distance = getHaversineDistance(
          addressToProceed.latitude!,
          addressToProceed.longitude!,
          zone.center.latitude,
          zone.center.longitude
        );
        return distance <= zone.radiusKm;
      });

      if (serviceable) {
        showLoading();
        localStorage.setItem('fixbroCustomerAddress', JSON.stringify(addressToProceed));
        localStorage.setItem('fixbroCustomerEmail', addressToProceed.email || "");
        router.push('/checkout/payment');
      } else {
        toast({ title: "Area Not Serviceable", description: "Sorry, the selected address is outside our service area for this category.", variant: "destructive", duration: 7000 });
      }
    } else {
      toast({ title: "No Address Selected", description: "Please select or add a service address.", variant: "destructive" });
    }
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Cart", href: "/cart" },
    { label: "Schedule", href: "/checkout/schedule" },
    { label: "Your Address" },
  ];

  if (!isMounted || isLoadingAuth || isLoadingAddresses || isLoadingZones) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="address" />
        <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <CheckoutStepper currentStepId="address" />
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl font-headline text-center">Select Service Address</CardTitle>
          <CardDescription className="text-center text-sm sm:text-base">Where should we send our professionals?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {savedAddresses.length > 0 && (
            <div className="space-y-3">
              {savedAddresses.map(address => (
                <Card 
                  key={address.id} 
                  className={`p-4 cursor-pointer hover:border-primary transition-all ${selectedAddressId === address.id ? 'border-primary ring-2 ring-primary' : 'border'}`}
                  onClick={() => setSelectedAddressId(address.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{address.fullName}</p>
                      <p className="text-muted-foreground">{address.addressLine1}, {address.addressLine2}</p>
                      <p className="text-muted-foreground">{address.city}, {address.state} - {address.pincode}</p>
                      <p className="text-muted-foreground">Phone: {address.phone}</p>
                    </div>
                    {selectedAddressId === address.id && <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />}
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={handleOpenMapClick}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Address
          </Button>

          {isServiceable === false && selectedAddressId && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Area Not Serviceable</AlertTitle>
              <AlertDescription>
                Sorry, the selected address is outside our current service zones. Please select or add a different address.
              </AlertDescription>
            </Alert>
          )}

        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
          <Button variant="outline" className="w-full sm:w-auto hidden md:flex" onClick={() => router.push('/checkout/schedule')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Schedule
          </Button>

          <Button onClick={handleProceed} disabled={!selectedAddressId || isServiceable === false} className="w-full sm:w-auto">
            Proceed to Payment <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
      
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 border-b"><DialogTitle>Confirm Address Details</DialogTitle></DialogHeader>
          <div className="flex-grow overflow-y-auto p-6">
            <AddressForm
              key={editingAddress ? 'edit' : 'new'}
              initialData={editingAddress}
              onSubmit={handleAddressSubmit}
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={isSubmitting}
              serviceZones={applicableServiceZones}
              onReselectOnMap={handleReselectOnMap}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent
          className="max-w-3xl w-[95vw] sm:w-[90vw] h-[80vh] p-0 flex flex-col"
          onPointerDownOutside={(e) => { const target = e.target as HTMLElement; if (target.closest('.pac-container')) e.preventDefault(); }}
        >
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Select Service Location</DialogTitle>
            <DialogDescription>
                {isLocating ? "Getting your current location..." : "Search for an address or click/drag the pin on the map."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow">
            {isLoadingAppSettings || !appConfig.googleMapsApiKey ? (
                <div className="flex items-center justify-center h-full bg-muted"><p>Map configuration loading or missing.</p></div>
            ) : (
                <MapAddressSelector 
                    apiKey={appConfig.googleMapsApiKey} 
                    onAddressSelect={handleMapAddressSelect} 
                    onClose={() => setIsMapModalOpen(false)} 
                    initialCenter={initialMapCenter} 
                    serviceZones={applicableServiceZones} 
                    
                />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}