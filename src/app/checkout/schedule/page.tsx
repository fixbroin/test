
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowRight, ArrowLeft, Clock, Loader2, AlertTriangle, CalendarDays, CheckCircle2 } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import type { 
  FirestoreService, 
  FirestoreSubCategory, 
  TimeSlotCategoryLimit, 
  FirestoreBooking,
  AppSettings,
  DayAvailability
} from '@/types/firestore';
import { getActiveCheckoutEntries, type CartEntry } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext'; 
import { useRouter, usePathname } from 'next/navigation';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { defaultAppSettings } from '@/config/appDefaults';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Separator } from '@/components/ui/separator';

const DEFAULT_SLOT_INTERVAL_MINUTES = defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
const DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS = defaultAppSettings.enableLimitLateBookings;
const DEFAULT_HOURS_WHEN_LIMIT_ENABLED = defaultAppSettings.limitLateBookingHours;

const getServiceDurationInMinutes = (service: FirestoreService): number => {
    if (!service.taskTimeValue || !service.taskTimeUnit) return 0;
    if (service.taskTimeUnit === 'hours') {
        return service.taskTimeValue * 60;
    }
    return service.taskTimeValue;
};


export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [displayMonth, setDisplayMonth] = useState<Date>(new Date()); // State for calendar's month view
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{ slot: string; remainingCapacity: number; endDateTime: string }[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingSlotsAndConfig, setIsLoadingSlotsAndConfig] = useState(true); 
  const [isFetchingSlots, setIsFetchingSlots] = useState(false);
  const [isSearchingForNextDay, setIsSearchingForNextDay] = useState(false);
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);

  const { toast } = useToast();
  const { showLoading } = useLoading(); 
  const router = useRouter(); 
  const pathname = usePathname();
  const { user } = useAuth();

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  
  const [totalCartDuration, setTotalCartDuration] = useState(0); 

  const selectedSlotData = useMemo(() => {
    return availableTimeSlots.find(s => s.slot === selectedTimeSlot);
  }, [availableTimeSlots, selectedTimeSlot]);

  const fetchAvailableSlots = useCallback(async (date: Date) => {
    try {
        const cartEntries = getActiveCheckoutEntries();
        const response = await fetch('/api/checkout/available-slots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selectedDate: date.toISOString(),
                cartEntries: cartEntries
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch slots');
        }

        const data = await response.json();
        setTotalCartDuration(data.totalCartDuration);
        return data.availableTimeSlots;
    } catch (error) {
        console.error("Error fetching available slots from API:", error);
        throw error;
    }
  }, []);


  useEffect(() => {
    setIsMounted(true);
    const fetchInitialData = async () => {
      if (isLoadingAppSettings) return;
      setIsLoadingSlotsAndConfig(true);
      setDataFetchError(null);
      try {
        const savedDateStr = localStorage.getItem('fixbroScheduledDate');
        const now = new Date();
        let initialDateToDisplay = new Date(now); 
        initialDateToDisplay.setHours(0,0,0,0);
        if (savedDateStr) {
            const parsedSavedDate = new Date(savedDateStr);
            if (!isNaN(parsedSavedDate.getTime()) && parsedSavedDate >= initialDateToDisplay) {
                initialDateToDisplay = parsedSavedDate;
            }
        }
        setSelectedDate(initialDateToDisplay);
        setDisplayMonth(initialDateToDisplay); // Sync display month
        logUserActivity('checkoutStep', { checkoutStepName: 'schedule', pageUrl: pathname }, user?.uid, !user ? getGuestId() : null);

      } catch (error) {
        console.error("Error fetching initial schedule data:", error);
        setDataFetchError("Failed to load scheduling data. Please try again.");
        toast({ title: "Error", description: "Could not load schedule information.", variant: "destructive"});
      } finally {
        setIsLoadingSlotsAndConfig(false);
      }
    };
    if (isMounted && !isLoadingAppSettings) {
      fetchInitialData();
    }
  }, [isMounted, toast, isLoadingAppSettings, pathname, user]); 

  // Fetch bookings whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate || isSearchingForNextDay) return;
    
    const runSlotCalculation = async () => {
        setIsFetchingSlots(true);
        try {
            const slots = await fetchAvailableSlots(selectedDate);
            setAvailableTimeSlots(slots);

            // If selected day has no slots, find the next available day
            if (slots.length === 0 && !isSearchingForNextDay) {
                // 1. Show Red Toast for "No Slots" on selected date
                toast({
                    variant: "destructive",
                    title: "No Slots Available",
                    description: `Sorry, there are no slots available for ${selectedDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
                    duration: 6000,
                });

                setIsSearchingForNextDay(true);
                const nextDay = new Date(selectedDate);
                let found = false;

                // Small delay before searching and showing next toast to let user process the first one
                await new Promise(resolve => setTimeout(resolve, 1500));

                for (let i = 0; i < 30; i++) {
                    nextDay.setDate(nextDay.getDate() + 1);
                    const nextDaySlots = await fetchAvailableSlots(nextDay);
                    if (nextDaySlots.length > 0) {
                        const nextAvailableDate = new Date(nextDay);
                        setSelectedDate(nextAvailableDate);
                        setDisplayMonth(nextAvailableDate); 
                        setAvailableTimeSlots(nextDaySlots);
                        
                        // 2. Show Green Toast for "Found Slots" on next date
                        toast({
                            variant: "success" as any,
                            title: "Available Slots Found!",
                            description: `We found slots for you on ${nextDay.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
                            duration: 8000,
                        });
                        found = true;
                        break;
                    }
                }
                setIsSearchingForNextDay(false);
            }
        } catch (error) {
            setDataFetchError("Failed to load available slots. Please try again.");
        } finally {
            setIsFetchingSlots(false);
        }
    };
    runSlotCalculation();
  }, [selectedDate, fetchAvailableSlots, isSearchingForNextDay, toast]);


  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setDisplayMonth(date); // Sync display month
    setSelectedTimeSlot(undefined); 
  };
  

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const handleProceed = () => {
    if (typeof window !== 'undefined' && selectedDate && selectedTimeSlot && selectedSlotData) {
      showLoading();
      localStorage.setItem('fixbroScheduledDate', selectedDate.toLocaleDateString('en-CA'));
      localStorage.setItem('fixbroScheduledTimeSlot', selectedTimeSlot);
      localStorage.setItem('fixbroEstimatedEndTime', selectedSlotData.endDateTime);
      router.push('/checkout/address');
    }
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Cart", href: "/cart" },
    { label: "Schedule Service" },
  ];

  const formatDateForDisplay = (date: Date | undefined): string => {
    if (!date) return "";
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!isMounted || isLoadingAppSettings || (isLoadingSlotsAndConfig && !selectedDate)) { 
     return (
      <div className="max-w-4xl mx-auto px-2 sm:px-4">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="schedule" />
        <Card className="shadow-lg border-none sm:border">
          <CardHeader><CardTitle className="text-xl sm:text-2xl font-headline text-center">Select Date &amp; Time</CardTitle></CardHeader>
          <CardContent className="space-y-6 text-center py-12">
             <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
             <p className="text-muted-foreground animate-pulse font-medium">Preparing available slots...</p>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 border-t pt-6 bg-muted/20">
            <Button variant="ghost" disabled className="hidden sm:flex border border-input"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Cart</Button>
            <Button disabled className="w-full sm:w-auto px-8">
              Proceed to Address <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (dataFetchError) {
    return (
       <div className="max-w-4xl mx-auto px-2 sm:px-4">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        <CheckoutStepper currentStepId="schedule" />
        <Card className="shadow-lg border-destructive/20 overflow-hidden">
          <div className="bg-destructive/5 py-12 px-6 flex flex-col items-center text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-bold text-destructive mb-2">Something went wrong</h2>
            <p className="text-destructive/80 max-w-md mb-6">{dataFetchError}</p>
            <Button variant="outline" onClick={() => window.location.reload()} className="border-destructive text-destructive hover:bg-destructive hover:text-white">Try Again</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-4 pb-12">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <CheckoutStepper currentStepId="schedule" />
      
      <Card className="shadow-xl border-none sm:border overflow-hidden">
        <CardHeader className="bg-primary/5 border-b py-6">
          <CardTitle className="text-xl sm:text-2xl font-headline text-center flex items-center justify-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Select Date &amp; Time
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left Column: Calendar Selection */}
            <div className="lg:col-span-5 p-4 sm:p-8 border-b lg:border-b-0 lg:border-r bg-muted/5">
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                   <div className="h-8 w-1 bg-primary rounded-full" />
                   <h3 className="text-lg font-bold">Pick a Date</h3>
                </div>
                
                <div className="flex justify-center bg-background p-4 rounded-xl shadow-sm border">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    month={displayMonth}
                    onMonthChange={setDisplayMonth}
                    className="rounded-md"
                    disabled={(date) => date < today}
                  />
                </div>
                
                <div className="bg-primary/5 p-4 rounded-lg flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Service Duration</p>
                    <p className="text-xs text-muted-foreground">Estimated duration based on your cart: <span className="text-primary font-bold">{totalCartDuration} mins</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Time Slot Selection */}
            <div className="lg:col-span-7 p-4 sm:p-8 space-y-6 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-1 bg-primary rounded-full" />
                  <h3 className="text-lg font-bold">Available Slots</h3>
                </div>
                {selectedDate && (
                  <Badge variant="outline" className="bg-primary text-white border-primary/20 px-3 py-1 text-lg font-semibold">
                    {formatDateForDisplay(selectedDate)}
                  </Badge>
                )}
              </div>

              <div className="flex-grow">
                {selectedDate ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedDate.toISOString()}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="h-full"
                    >
                      {isSearchingForNextDay || isFetchingSlots ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                           <Loader2 className="h-10 w-10 text-primary animate-spin" />
                           <p className="text-muted-foreground font-medium">
                             {isSearchingForNextDay ? "Finding the next available day..." : "Checking available slots..."}
                           </p>
                        </div>
                      ) : availableTimeSlots.length > 0 ? (
                        <div className="space-y-4">
                           <RadioGroup
                            value={selectedTimeSlot}
                            onValueChange={setSelectedTimeSlot}
                            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                          >
                            {availableTimeSlots.map(({ slot, remainingCapacity }) => (
                              <div key={slot}>
                                <RadioGroupItem 
                                  value={slot} 
                                  id={`slot-${slot}`} 
                                  className="sr-only" 
                                />
                                <Label
                                  htmlFor={`slot-${slot}`}
                                  className={`group relative flex flex-col items-center justify-center border-2 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:border-primary/50
                                    ${selectedTimeSlot === slot 
                                      ? 'bg-primary border-primary text-primary-foreground shadow-md ring-2 ring-primary/20 scale-[1.02]' 
                                      : 'bg-background border-muted hover:bg-muted/30'}`}
                                >
                                  <Clock className={`h-4 w-4 mb-2 ${selectedTimeSlot === slot ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary'}`} />
                                  <span className="font-bold text-sm tracking-tight">{slot}</span>
                                  
                                  {remainingCapacity > 1 && (
                                      <Badge 
                                        variant="default" 
                                        className={`absolute -top-2 -right-1 text-[9px] px-1.5 py-0 bg-green-500 hover:bg-green-600 border-2 border-background shadow-sm
                                          ${selectedTimeSlot === slot ? 'bg-white text-green-600 border-primary' : ''}`}
                                      >
                                        {remainingCapacity} left
                                      </Badge>
                                  )}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                          
                          {selectedTimeSlot && (
                             <motion.div 
                               initial={{ opacity: 0, scale: 0.95 }}
                               animate={{ opacity: 1, scale: 1 }}
                               className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-4"
                             >
                               <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                   <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                                     <CheckCircle2 className="h-6 w-6" />
                                   </div>
                                   <div>
                                     <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Start Schedule</p>
                                     <p className="text-sm font-bold">{formatDateForDisplay(selectedDate)} at {selectedTimeSlot}</p>
                                   </div>
                                 </div>
                                 <Badge className="bg-primary text-primary-foreground">Confirmed</Badge>
                               </div>

                               <Separator className="bg-primary/10" />

                               <div className="flex items-center gap-3">
                                 <div className="h-10 w-10 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm">
                                   <Clock className="h-6 w-6" />
                                 </div>
                                 <div>
                                   <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Estimated Completion</p>
                                   <p className="text-sm font-bold">
                                     {selectedSlotData && (
                                       `Ends on ${new Date(selectedSlotData.endDateTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at ${new Date(selectedSlotData.endDateTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                                     )}
                                   </p>
                                 </div>
                               </div>
                             </motion.div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-muted/5">
                          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                          <h4 className="font-bold text-lg mb-1">No slots available</h4>
                          <p className="text-muted-foreground text-sm max-w-xs">
                            This date is fully booked or doesn't accommodate your service duration. Please select another date.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl opacity-60">
                    <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-medium">Please select a date on the left to see available time slots</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted/20 p-6 border-t">
          <Link href="/cart" passHref className="hidden sm:block order-2 sm:order-1">
            <Button variant="ghost" className="border border-input hover:bg-foreground hover:text-background transition-all duration-300 group">
              <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Cart
            </Button>
          </Link>
          
          <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3 order-1 sm:order-2">
            <Button 
              disabled={!selectedDate || !selectedTimeSlot} 
              onClick={handleProceed}
              className="w-full sm:w-auto px-10 py-6 text-base font-bold shadow-lg shadow-primary/20 group relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center">
                Proceed to Address <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Button>
          </div>
        </CardFooter>
      </Card>
      
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: "Instant Booking", desc: "Real-time availability updates" },
          { title: "Expert Pro", desc: "Verified professional for every job" },
          { title: "On-time Arrival", desc: "Punctuality is our top priority" }
        ].map((item, idx) => (
          <div key={idx} className="flex items-center gap-3 p-4 rounded-xl bg-background border shadow-sm">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <div>
              <p className="text-sm font-bold leading-none mb-1">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
