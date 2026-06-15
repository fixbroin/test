
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Clock, Loader2, AlertTriangle, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getZonedDate, formatZonedDateToISO } from '@/lib/utils';
import { getActiveCheckoutEntries } from '@/lib/cartManager';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Separator } from '@/components/ui/separator';

interface ScheduleSelectionProps {
  onSelect: (date: Date, slot: string, endTime: string) => void;
  initialDate?: Date;
  initialSlot?: string;
}

export default function ScheduleSelection({ onSelect, initialDate, initialSlot }: ScheduleSelectionProps) {
  const slotsSectionRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [displayMonth, setDisplayMonth] = useState<Date>(initialDate || new Date());
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{ slot: string; remainingCapacity: number; endDateTime: string }[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>(initialSlot);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSearchingForNextDay, setIsSearchingForNextDay] = useState(false);
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);
  const [totalCartDuration, setTotalCartDuration] = useState(0);

  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

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
                selectedDate: formatZonedDateToISO(date, appConfig?.timezone),
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
  }, [appConfig?.timezone]);

  useEffect(() => {
    if (!selectedDate || isSearchingForNextDay || isLoadingAppSettings) return;
    
    const runSlotCalculation = async () => {
        setIsLoadingSlots(true);
        try {
            const slots = await fetchAvailableSlots(selectedDate);
            setAvailableTimeSlots(slots);

            if (slots.length === 0 && !isSearchingForNextDay) {
                toast({
                    variant: "destructive",
                    title: "No Slots Available",
                    description: `Sorry, there are no slots available for ${selectedDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
                });

                setIsSearchingForNextDay(true);
                const nextDay = new Date(selectedDate);
                let found = false;

                await new Promise(resolve => setTimeout(resolve, 1500));

                for (let i = 0; i < 30; i++) {
                    nextDay.setDate(nextDay.getDate() + 1);
                    const nextDaySlots = await fetchAvailableSlots(nextDay);
                    if (nextDaySlots.length > 0) {
                        const nextAvailableDate = new Date(nextDay);
                        setSelectedDate(nextAvailableDate);
                        setDisplayMonth(nextAvailableDate); 
                        setAvailableTimeSlots(nextDaySlots);
                        
                        toast({
                            variant: "success" as any,
                            title: "Available Slots Found!",
                            description: `We found slots for you on ${nextDay.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
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
            setIsLoadingSlots(false);
        }
    };
    runSlotCalculation();
  }, [selectedDate, fetchAvailableSlots, isSearchingForNextDay, toast, isLoadingAppSettings]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setDisplayMonth(date);
    setSelectedTimeSlot(undefined);

    // Scroll to slots section on mobile
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        slotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleConfirm = () => {
    if (selectedDate && selectedTimeSlot && selectedSlotData) {
      onSelect(selectedDate, selectedTimeSlot, selectedSlotData.endDateTime);
    }
  };

  const today = useMemo(() => {
    const d = getZonedDate(new Date(), appConfig.timezone);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [appConfig.timezone]);

  const formatDateForDisplay = (date: Date | undefined): string => {
    if (!date) return "";
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (isLoadingAppSettings) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Calendar Selection */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2">
             <div className="h-6 w-1 bg-primary rounded-full" />
             <h3 className="text-lg font-bold">Pick a Date</h3>
          </div>
          
          <div className="flex justify-center bg-background p-2 rounded-xl border">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              disabled={(date) => date < today}
              className="rounded-md"
            />
          </div>
          
          <div className="bg-primary/5 p-4 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Service Duration</p>
              <p className="text-xs text-muted-foreground">Estimated duration: <span className="text-primary font-bold">{totalCartDuration} mins</span></p>
            </div>
          </div>
        </div>

        {/* Time Slot Selection */}
        <div className="lg:col-span-7 space-y-4" ref={slotsSectionRef}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-1 bg-primary rounded-full" />
              <h3 className="text-lg font-bold">Available Slots</h3>
            </div>
            {selectedDate && (
              <Badge variant="outline" className="bg-primary text-white border-primary/20">
                {formatDateForDisplay(selectedDate)}
              </Badge>
            )}
          </div>

          <div className="min-h-[200px]">
            {selectedDate ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedDate.toISOString()}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {isSearchingForNextDay || isLoadingSlots ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
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
                              className={`group relative flex flex-col items-center justify-center border-2 rounded-xl p-3 cursor-pointer transition-all duration-200 hover:border-primary/50
                                ${selectedTimeSlot === slot 
                                  ? 'bg-primary border-primary text-primary-foreground shadow-md' 
                                  : 'bg-background border-muted hover:bg-muted/30'}`}
                            >
                              <Clock className={`h-4 w-4 mb-1 ${selectedTimeSlot === slot ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                              <span className="font-bold text-sm">{slot}</span>
                              
                              {remainingCapacity > 1 && (
                                  <Badge 
                                    variant="default" 
                                    className={`absolute -top-2 -right-1 text-[9px] px-1.5 py-0 bg-green-500
                                      ${selectedTimeSlot === slot ? 'bg-white text-green-600' : ''}`}
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
                           className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-3"
                         >
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                               <CheckCircle2 className="h-5 w-5 text-primary" />
                               <div>
                                 <p className="text-xs text-muted-foreground uppercase font-bold">Start Schedule</p>
                                 <p className="text-sm font-bold">{formatDateForDisplay(selectedDate)} at {selectedTimeSlot}</p>
                               </div>
                             </div>
                           </div>

                           <Separator className="bg-primary/10" />

                           <div className="flex items-center gap-3">
                             <Clock className="h-5 w-5 text-green-500" />
                             <div>
                               <p className="text-xs text-muted-foreground uppercase font-bold">Estimated Completion</p>
                               <p className="text-sm font-bold">
                                 {selectedSlotData && (
                                   `Ends at ${new Date(selectedSlotData.endDateTime).toLocaleTimeString('en-IN', { timeZone: appConfig.timezone, hour: '2-digit', minute: '2-digit', hour12: true })}`
                                 )}
                               </p>
                             </div>
                           </div>
                         </motion.div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-muted/5">
                      <AlertTriangle className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                      <h4 className="font-bold text-lg mb-1">No slots available</h4>
                      <p className="text-muted-foreground text-sm max-w-xs">
                        This date is fully booked. Please select another date.
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-2xl opacity-60">
                <CalendarDays className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-medium">Please select a date on the left</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-background pt-4 pb-2 mt-auto border-t sm:border-none flex justify-end">
        <Button 
          disabled={!selectedDate || !selectedTimeSlot} 
          onClick={handleConfirm}
          className="w-full sm:w-auto px-10 py-6 sm:py-2 text-lg sm:text-base font-bold sm:font-medium shadow-lg sm:shadow-none"
        >
          Confirm Schedule
        </Button>
      </div>
    </div>
  );
}
