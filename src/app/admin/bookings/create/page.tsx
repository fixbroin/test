
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from '@/components/ui/calendar';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, ArrowLeft, Search, User, MapPin, Phone, Mail, 
  CalendarDays, Clock, CheckCircle2, IndianRupee, Tag, 
  AlertCircle, Plus, Trash2, Info, HandCoins, ChevronDown, CheckCircle
} from "lucide-react";
import { db } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, 
  addDoc, Timestamp, limit, orderBy 
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { triggerPushNotification } from '@/lib/fcmUtils';
import type { 
  FirestoreBooking, FirestoreUser, FirestoreCategory, 
  FirestoreService, BookingStatus, BookingServiceItem
} from '@/types/firestore';
import { 
  generateBookingId, getBasePriceForInvoice, 
  calculateIncrementalTotalPriceForItem 
} from '@/lib/bookingUtils';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";

export default function AdminCreateBookingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();

  const ignoreNextSearch = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [isLoadingPrerequisites, setIsLoadingPrerequisites] = useState(true);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FirestoreUser[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<FirestoreUser | null>(null);
  const [customerDetails, setCustomerDetails] = useState({
    name: "", email: "", phone: "", address: "", city: "", pincode: "", latitude: "" as string | number, longitude: "" as string | number
  });

  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [subCategories, setSubCategories] = useState<any[]>([]);
  const [allServices, setAllServices] = useState<FirestoreService[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [isCustomService, setIsCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServicePrice, setCustomServicePrice] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  const [categorySearch, setCategorySearch] = useState("");
  const [subCategorySearch, setSubCategorySearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isSubCategoryDialogOpen, setIsSubCategoryDialogOpen] = useState(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableSlots, setAvailableSlots] = useState<{ slot: string; remainingCapacity: number }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [paymentMode, setPaymentMode] = useState("Pay after service");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("Confirmed");

  useEffect(() => {
    if (ignoreNextSearch.current) { ignoreNextSearch.current = false; return; }
    if (customerSearch.trim().length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingUser(true);
      try {
        const usersRef = collection(db, "users");
        const term = customerSearch.trim();
        const lowerTerm = term.toLowerCase();
        const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
        const queries = [
          query(usersRef, where("email", ">=", term), where("email", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("email", ">=", lowerTerm), where("email", "<=", lowerTerm + '\uf8ff'), limit(10)),
          query(usersRef, where("mobileNumber", ">=", term), where("mobileNumber", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("displayName", ">=", term), where("displayName", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("displayName", ">=", capitalizedTerm), where("displayName", "<=", capitalizedTerm + '\uf8ff'), limit(10)),
        ];
        if (/^\d+$/.test(term)) {
          queries.push(query(usersRef, where("mobileNumber", ">=", `91${term}`), where("mobileNumber", "<=", `91${term}` + '\uf8ff'), limit(5)));
          queries.push(query(usersRef, where("mobileNumber", ">=", `+91${term}`), where("mobileNumber", "<=", `+91${term}` + '\uf8ff'), limit(5)));
        }
        const snapShots = await Promise.all(queries.map(q => getDocs(q)));
        const results: FirestoreUser[] = [];
        snapShots.forEach(snap => snap.docs.forEach(docSnap => results.push({ ...docSnap.data(), uid: docSnap.id } as FirestoreUser)));
        const uniqueResults = Array.from(new Map(results.map(u => [u.uid, u])).values());
        setSearchResults(uniqueResults);
        setShowSearchResults(uniqueResults.length > 0);
      } catch (error) { console.error(error); } finally { setIsSearchingUser(false); }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [customerSearch]);

  const handleSelectUser = (user: FirestoreUser) => {
    ignoreNextSearch.current = true;
    setSelectedUser(user);
    const addr = user.addresses?.[0];
    setCustomerDetails({ name: user.displayName || "", email: user.email || "", phone: user.mobileNumber || "", address: addr?.addressLine1 || "", city: addr?.city || "", pincode: addr?.pincode || "", latitude: addr?.latitude || "", longitude: addr?.longitude || "" });
    setCustomerSearch(user.displayName || user.email || "");
    setShowSearchResults(false);
  };

  useEffect(() => {
    const fetchPrerequisites = async () => {
      try {
        const [catSnap, subCatSnap, servSnap] = await Promise.all([
          getDocs(query(collection(db, "adminCategories"), orderBy("order", "asc"))),
          getDocs(query(collection(db, "adminSubCategories"), orderBy("order", "asc"))),
          getDocs(query(collection(db, "adminServices"), where("isActive", "==", true)))
        ]);
        setCategories(catSnap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreCategory)));
        setSubCategories(subCatSnap.docs.map(d => ({ ...d.data(), id: d.id })));
        setAllServices(servSnap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreService)));
      } catch (error) { console.error(error); } finally { setIsLoadingPrerequisites(false); }
    };
    fetchPrerequisites();
  }, []);

  const filteredCategories = useMemo(() => categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase())), [categories, categorySearch]);
  const filteredSubCategories = useMemo(() => subCategories.filter(sc => sc.parentId === selectedCategoryId && sc.name.toLowerCase().includes(subCategorySearch.toLowerCase())), [subCategories, selectedCategoryId, subCategorySearch]);
  const filteredServices = useMemo(() => allServices.filter(s => s.subCategoryId === selectedSubCategoryId && s.name.toLowerCase().includes(serviceSearch.toLowerCase())), [allServices, selectedSubCategoryId, serviceSearch]);
  
  const selectedCategory = useMemo(() => categories.find(c => c.id === selectedCategoryId), [categories, selectedCategoryId]);
  const selectedSubCategory = useMemo(() => subCategories.find(sc => sc.id === selectedSubCategoryId), [subCategories, selectedSubCategoryId]);
  const selectedService = useMemo(() => allServices.find(s => s.id === selectedServiceId), [allServices, selectedServiceId]);

  useEffect(() => {
    if (!selectedDate) return;
    const fetchSlots = async () => {
      setIsLoadingSlots(true);
      try {
        const cartEntries = (isCustomService || !selectedServiceId) ? [] : [{ serviceId: selectedServiceId, quantity: selectedQuantity }];
        const response = await fetch('/api/checkout/available-slots', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedDate: selectedDate.toISOString(), cartEntries })
        });
        const data = await response.json();
        setAvailableSlots(data.availableTimeSlots || []);
      } catch (error) { console.error(error); } finally { setIsLoadingSlots(false); }
    };
    fetchSlots();
  }, [selectedDate, selectedServiceId, selectedQuantity, isCustomService]);

  const summary = useMemo(() => {
    let itemTotal = 0; let taxTotal = 0; let visitingCharge = 0; let platformFeeTotal = 0;
    const appliedPlatformFees: any[] = [];
    if (isCustomService) { itemTotal = parseFloat(customServicePrice) || 0; }
    else if (selectedService) {
      itemTotal = calculateIncrementalTotalPriceForItem(selectedService, selectedQuantity);
      const rate = selectedService.taxPercent || 0;
      const base = getBasePriceForInvoice(itemTotal, !!selectedService.isTaxInclusive, rate);
      taxTotal = base * (rate / 100);
    }
    if (appConfig?.enableMinimumBookingPolicy && itemTotal < (appConfig.minimumBookingAmount || 0)) {
      visitingCharge = appConfig.visitingChargeAmount || 0;
      if (appConfig.enableTaxOnVisitingCharge) {
        const vcBase = getBasePriceForInvoice(visitingCharge, !!appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent || 0);
        taxTotal += vcBase * ((appConfig.visitingChargeTaxPercent || 0) / 100);
      }
    }
    if (appConfig?.platformFees) {
      appConfig.platformFees.forEach(fee => {
        if (fee.isActive) {
          const base = fee.type === 'percentage' ? (itemTotal * (fee.value / 100)) : fee.value;
          const tax = base * ((fee.feeTaxRatePercent || 0) / 100);
          appliedPlatformFees.push({ name: fee.name, type: fee.type, valueApplied: fee.value, calculatedFeeAmount: base, taxRatePercentOnFee: fee.feeTaxRatePercent || 0, taxAmountOnFee: tax });
          platformFeeTotal += (base + tax);
        }
      });
    }
    return { itemTotal, taxTotal, visitingCharge, platformFeeTotal, appliedPlatformFees, grandTotal: itemTotal + taxTotal + visitingCharge + platformFeeTotal };
  }, [selectedService, isCustomService, customServicePrice, selectedQuantity, appConfig]);

  const validateForm = () => {
    const errors: string[] = [];
    if (!customerDetails.name.trim()) errors.push("name");
    if (!customerDetails.phone.trim()) errors.push("phone");
    if (!customerDetails.address.trim()) errors.push("address");
    if (!isCustomService && !selectedServiceId) errors.push("service");
    if (isCustomService && (!customServiceName.trim() || !customServicePrice)) errors.push("customService");
    if (!selectedDate) errors.push("date");
    if (!selectedSlot) errors.push("slot");
    setFormErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!validateForm()) { toast({ title: "Validation Error", description: "Fill all required fields.", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const newBookingId = generateBookingId();
      const serviceItems: BookingServiceItem[] = [];
      if (isCustomService) {
        serviceItems.push({ serviceId: "custom", name: customServiceName, quantity: 1, pricePerUnit: summary.itemTotal, isTaxInclusive: false, taxPercentApplied: 0, taxAmountForItem: 0 });
      } else if (selectedService) {
        const rate = selectedService.taxPercent || 0;
        const base = getBasePriceForInvoice(summary.itemTotal, !!selectedService.isTaxInclusive, rate);
        serviceItems.push({ 
            serviceId: selectedService.id, 
            name: selectedService.name, 
            quantity: selectedQuantity, 
            pricePerUnit: summary.itemTotal / selectedQuantity, 
            discountedPricePerUnit: selectedService.discountedPrice ?? undefined, 
            isTaxInclusive: !!selectedService.isTaxInclusive, 
            taxPercentApplied: rate, 
            taxAmountForItem: summary.itemTotal - base,
            taskTimeValue: selectedService.taskTimeValue ?? undefined,
            taskTimeUnit: selectedService.taskTimeUnit ?? undefined,
            shortDescription: selectedService.shortDescription ?? undefined,
            imageUrl: selectedService.imageUrl
        });
      }
      const bookingData: any = {
        bookingId: newBookingId, userId: selectedUser?.uid || null, customerName: customerDetails.name, customerEmail: customerDetails.email, customerPhone: customerDetails.phone, addressLine1: customerDetails.address, city: customerDetails.city, state: "N/A", pincode: customerDetails.pincode, scheduledDate: selectedDate!.toLocaleDateString('en-CA'), scheduledTimeSlot: selectedSlot, services: serviceItems, appliedPlatformFees: summary.appliedPlatformFees, subTotal: summary.itemTotal, taxAmount: summary.taxTotal, visitingCharge: summary.visitingCharge, totalAmount: summary.grandTotal, paymentMethod: paymentMode, status: bookingStatus, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), isReviewedByCustomer: false,
        parentCategoryId: selectedCategoryId || null,
        subCategoryId: selectedSubCategoryId || null
      };
      if (customerDetails.latitude) bookingData.latitude = Number(customerDetails.latitude);
      if (customerDetails.longitude) bookingData.longitude = Number(customerDetails.longitude);

      const docRef = await addDoc(collection(db, "bookings"), bookingData);
      fetch('/api/bookings/post-process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingDocId: docRef.id }) });
      setCreatedBookingId(newBookingId); setIsSuccessDialogOpen(true);
    } catch (error) { console.error(error); toast({ title: "Error", description: "Failed to create booking.", variant: "destructive" }); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 px-4">
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Bookings", href: "/admin/bookings" }, { label: "Create Booking" }]} className="mb-6" />
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl sm:text-3xl font-bold flex items-center"><Plus className="mr-2 h-8 w-8 text-primary" /> Create Manual Booking</h1><p className="text-muted-foreground">Fill details to create an offline booking.</p></div>
        <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className={hasAttemptedSubmit && (formErrors.includes("name") || formErrors.includes("phone") || formErrors.includes("address")) ? "border-destructive shadow-md" : ""}>
            <CardHeader><CardTitle className="text-lg flex items-center"><User className="mr-2 h-5 w-5 text-primary" /> Customer Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search existing users..." className="pl-9" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}/>
                {showSearchResults && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-xl max-h-60 overflow-y-auto">
                    {searchResults.map((user) => (
                      <div key={user.uid} className="p-3 hover:bg-muted cursor-pointer border-b last:border-0 flex items-center justify-between" onClick={() => handleSelectUser(user)}>
                        <div><p className="font-bold text-sm">{user.displayName || "No Name"}</p><p className="text-xs text-muted-foreground">{user.email || user.mobileNumber}</p></div><Badge variant="outline" className="text-[10px]">Select</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {isSearchingUser && <div className="absolute right-3 top-2.5"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2"><Label>Name *</Label><Input className={hasAttemptedSubmit && !customerDetails.name.trim() ? "border-destructive" : ""} value={customerDetails.name} onChange={e => setCustomerDetails(p => ({...p, name: e.target.value}))}/></div>
                <div className="space-y-2"><Label>Mobile *</Label><Input className={hasAttemptedSubmit && !customerDetails.phone.trim() ? "border-destructive" : ""} value={customerDetails.phone} onChange={e => setCustomerDetails(p => ({...p, phone: e.target.value}))}/></div>
                <div className="space-y-2"><Label>Email</Label><Input value={customerDetails.email} onChange={e => setCustomerDetails(p => ({...p, email: e.target.value}))}/></div>
                <div className="space-y-2"><Label>City</Label><Input value={customerDetails.city} onChange={e => setCustomerDetails(p => ({...p, city: e.target.value}))}/></div>
                <div className="md:col-span-2 space-y-2"><Label>Address *</Label><Input className={hasAttemptedSubmit && !customerDetails.address.trim() ? "border-destructive" : ""} value={customerDetails.address} onChange={e => setCustomerDetails(p => ({...p, address: e.target.value}))}/></div>
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Latitude</Label><Input value={customerDetails.latitude} onChange={e => setCustomerDetails(p => ({...p, latitude: e.target.value}))}/></div>
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Longitude</Label><Input value={customerDetails.longitude} onChange={e => setCustomerDetails(p => ({...p, longitude: e.target.value}))}/></div>
              </div>
            </CardContent>
          </Card>

          <Card className={hasAttemptedSubmit && (formErrors.includes("service") || formErrors.includes("customService")) ? "border-destructive shadow-md" : ""}>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-lg flex items-center"><Tag className="mr-2 h-5 w-5 text-primary" /> Service Selection</CardTitle><Button variant={isCustomService ? "default" : "outline"} size="sm" onClick={() => { setIsCustomService(!isCustomService); if (!isCustomService) setSelectedServiceId(""); }}>{isCustomService ? "Use Standard" : "Add Custom Service"}</Button></div></CardHeader>
            <CardContent className="space-y-4">
              {!isCustomService ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Category</Label>
                    <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" className="w-full justify-between font-normal h-10 px-3"><span className="truncate">{selectedCategory ? selectedCategory.name : "Select Category"}</span><ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" /></Button></DialogTrigger>
                      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Select Category</DialogTitle></DialogHeader><div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} /></div><ScrollArea className="h-72 pr-4"><div className="space-y-1">{filteredCategories.map(c => (<Button key={c.id} variant="ghost" className={`w-full justify-start font-medium ${selectedCategoryId === c.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedCategoryId(c.id!); setSelectedSubCategoryId(""); setSelectedServiceId(""); setIsCategoryDialogOpen(false); setIsSubCategoryDialogOpen(true); }}>{c.name}</Button>))}</div></ScrollArea></DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-2"><Label>Sub-Category</Label>
                    <Dialog open={isSubCategoryDialogOpen} onOpenChange={setIsSubCategoryDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" className="w-full justify-between font-normal h-10 px-3" disabled={!selectedCategoryId}><span className="truncate">{selectedSubCategory ? selectedSubCategory.name : "Select Sub-Cat"}</span><ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" /></Button></DialogTrigger>
                      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Select Sub-Category</DialogTitle></DialogHeader><div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={subCategorySearch} onChange={e => setSubCategorySearch(e.target.value)} /></div><ScrollArea className="h-72 pr-4"><div className="space-y-1">{filteredSubCategories.map(sc => (<Button key={sc.id} variant="ghost" className={`w-full justify-start font-medium ${selectedSubCategoryId === sc.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedSubCategoryId(sc.id!); setSelectedServiceId(""); setIsSubCategoryDialogOpen(false); setIsServiceDialogOpen(true); }}>{sc.name}</Button>))}</div></ScrollArea></DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-2"><Label>Service</Label>
                    <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" className={`w-full justify-between font-normal h-10 px-3 ${hasAttemptedSubmit && !selectedServiceId ? 'border-destructive' : ''}`} disabled={!selectedSubCategoryId}><span className="truncate">{selectedService ? selectedService.name : "Select Service"}</span><ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" /></Button></DialogTrigger>
                      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Select Service</DialogTitle></DialogHeader><div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} /></div><ScrollArea className="h-96 pr-4"><div className="space-y-1">{filteredServices.map(s => (<Button key={s.id} variant="ghost" className={`w-full justify-start h-auto py-3 px-4 flex flex-col items-start gap-0.5 ${selectedServiceId === s.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedServiceId(s.id!); setIsServiceDialogOpen(false); }}><span className="font-bold text-sm text-left">{s.name}</span><span className="text-xs text-muted-foreground text-left">Price: ₹{s.discountedPrice ?? s.price}</span></Button>))}</div></ScrollArea></DialogContent>
                    </Dialog>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <div className="space-y-2"><Label>Name</Label><Input className={hasAttemptedSubmit && !customServiceName.trim() ? "border-destructive" : ""} value={customServiceName} onChange={e => setCustomServiceName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Price (₹)</Label><Input type="number" className={hasAttemptedSubmit && !customServicePrice ? "border-destructive" : ""} value={customServicePrice} onChange={e => setCustomServicePrice(e.target.value)} /></div>
                </div>
              )}
              {selectedServiceId && !isCustomService && (
                 <div className="flex items-center gap-4 pt-2"><Label>Quantity</Label><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedQuantity(q => Math.max(1, q-1))}>-</Button><span className="font-bold">{selectedQuantity}</span><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedQuantity(q => q+1)}>+</Button></div></div>
              )}
            </CardContent>
          </Card>

          <Card className={hasAttemptedSubmit && (formErrors.includes("date") || formErrors.includes("slot")) ? "border-destructive shadow-md" : ""}>
            <CardHeader><CardTitle className="text-lg flex items-center"><CalendarDays className="mr-2 h-5 w-5 text-primary" /> Schedule</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`border rounded-md p-2 flex justify-center ${hasAttemptedSubmit && !selectedDate ? 'border-destructive' : ''}`}><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} /></div>
              <div className="space-y-4"><Label className="flex items-center"><Clock className="mr-2 h-4 w-4" /> Slots</Label>
                {isLoadingSlots ? <div className="flex items-center gap-2 text-muted-foreground py-10"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div> : availableSlots.length > 0 ? <div className="grid grid-cols-2 gap-2">{availableSlots.map(s => <Button key={s.slot} variant={selectedSlot === s.slot ? "default" : "outline"} className={`text-xs ${hasAttemptedSubmit && !selectedSlot ? 'border-destructive' : ''}`} onClick={() => setSelectedSlot(s.slot)}>{s.slot}</Button>)}</div> : <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">{selectedDate ? "No slots." : "Select date."}</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Service:</span><span className="font-medium">₹{summary.itemTotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Visiting:</span><span className="font-medium">₹{summary.visitingCharge.toFixed(2)}</span></div>
                {summary.appliedPlatformFees.map((fee, idx) => (<div key={idx} className="flex justify-between"><span className="flex items-center gap-1 text-muted-foreground"><HandCoins className="h-3 w-3" /> {fee.name}:</span><span className="font-medium">₹{(fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2)}</span></div>))}
                <div className="flex justify-between"><span>Tax:</span><span className="font-medium">₹{summary.taxTotal.toFixed(2)}</span></div>
                <Separator /><div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-primary">₹{summary.grandTotal.toFixed(2)}</span></div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Payment</Label>
                <RadioGroup value={paymentMode} onValueChange={setPaymentMode} className="grid grid-cols-2 gap-2">
                  <Label className="flex items-center gap-2 border p-3 rounded-md cursor-pointer hover:bg-muted"><RadioGroupItem value="Pay after service" /> Pay after service</Label>
                  <Label className="flex items-center gap-2 border p-3 rounded-md cursor-pointer hover:bg-muted"><RadioGroupItem value="Online" /> Online</Label>
                  <Label className="flex items-center gap-2 border p-3 rounded-md cursor-pointer hover:bg-muted"><RadioGroupItem value="Pending" /> Pending</Label>
                </RadioGroup>
              </div>
              <div className="space-y-3">
                <Label>Status</Label>
                <Select value={bookingStatus} onValueChange={(v) => setBookingStatus(v as BookingStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Confirmed">Confirmed</SelectItem><SelectItem value="Pending Payment">Pending Payment</SelectItem></SelectContent></Select>
              </div>
            </CardContent>
            <CardFooter><Button className="w-full h-12 text-lg font-bold shadow-lg" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Create Booking"}</Button></CardFooter>
          </Card>
        </div>
      </div>

      <Dialog open={isSuccessDialogOpen} onOpenChange={(open) => !open && router.push('/admin/bookings')}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center justify-center space-y-4">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300"><CheckCircle className="h-10 w-10" /></div>
            <DialogTitle className="text-2xl font-bold text-center">Booking Created!</DialogTitle>
            <DialogDescription className="text-center text-base">The booking <strong>{createdBookingId}</strong> has been successfully created.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-lg space-y-2 mt-4 text-sm">
            <div className="flex justify-between"><span>Customer:</span><span className="font-bold">{customerDetails.name}</span></div>
            <div className="flex justify-between"><span>Service:</span><span className="font-bold truncate max-w-[200px]">{isCustomService ? customServiceName : selectedService?.name}</span></div>
            <div className="flex justify-between"><span>Date:</span><span className="font-bold">{selectedDate?.toLocaleDateString()}</span></div>
            <div className="flex justify-between pt-2 border-t font-bold"><span>Amount:</span><span className="text-primary">₹{summary.grandTotal.toFixed(2)}</span></div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
            <Button variant="outline" className="w-full sm:flex-1" onClick={() => router.push('/admin')}>Dashboard</Button>
            <Button className="w-full sm:flex-1" onClick={() => router.push('/admin/bookings')}>All Bookings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
