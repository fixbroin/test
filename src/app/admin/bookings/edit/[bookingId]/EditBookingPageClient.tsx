
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation'; // useParams is already imported
import Link from 'next/link';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ArrowLeft, Save, User, Mail, Phone, MapPin, Edit, Clock, Globe } from 'lucide-react';
import type { FirestoreBooking, BookingStatus } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp, addDoc, collection } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { triggerPushNotification } from '@/lib/fcmUtils';
import type { FirestoreNotification } from '@/types/firestore';

const statusOptions: [string, ...string[]] = [
  "Pending Payment",
  "Confirmed",
  "Processing",
  "Completed",
  "Cancelled",
  "Rescheduled",
  "AssignedToProvider",
  "ProviderAccepted",
  "ProviderRejected",
  "InProgressByProvider"
];

const timeSlots = {
  morning: ["09:00 AM", "10:00 AM", "11:00 AM"],
  afternoon: ["01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM"],
  evening: ["05:00 PM", "06:00 PM"],
};
const allTimeSlots = Object.values(timeSlots).flat();

const bookingEditSchema = z.object({
  customerName: z.string().min(2, "Full name must be at least 2 characters."),
  customerEmail: z.string().email("Invalid email address."),
  customerPhone: z.string().min(10, "Phone number must be at least 10 digits.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format."),
  addressLine1: z.string().min(5, "Address is too short."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City name is too short."),
  state: z.string().min(2, "State name is too short."),
  pincode: z.string().length(6, "Pincode must be 6 digits.").regex(/^\d+$/, "Invalid pincode."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  scheduledDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format." }), // Expecting YYYY-MM-DD
  scheduledTimeSlot: z.string().min(1, "Time slot is required."),
  status: z.enum(statusOptions),
  notes: z.string().optional(),
});

type BookingEditFormData = z.infer<typeof bookingEditSchema>;

// Removed params from props
export default function EditBookingPageClient() {
  const router = useRouter();
  const paramsFromHook = useParams(); // Use the hook
  const { toast } = useToast();
  const bookingId = paramsFromHook.bookingId as string; // Get bookingId from the hook

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [booking, setBooking] = useState<FirestoreBooking | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);


  const form = useForm<BookingEditFormData>({
    resolver: zodResolver(bookingEditSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      pincode: "",
      latitude: null,
      longitude: null,
      scheduledDate: "",
      scheduledTimeSlot: "",
      status: "Pending Payment",
      notes: "",
    },
  });

  useEffect(() => {
    if (!bookingId) {
        // This check might still run if useParams() initially returns undefined params
        // but should resolve quickly. The toast will only show if it remains undefined after re-renders.
        console.log("EditBookingPageClient: bookingId is falsy in useEffect", bookingId);
        if (typeof bookingId === 'string' && bookingId.trim() === "") { // Only toast if it's truly empty after potentially being set
          toast({ title: "Error", description: "Booking ID not found.", variant: "destructive" });
          router.push('/admin/bookings');
        }
        return;
    }

    const fetchBooking = async () => {
      setIsLoading(true);
      try {
        const bookingDocRef = doc(db, "bookings", bookingId);
        const docSnap = await getDoc(bookingDocRef);

        if (docSnap.exists()) {
          const bookingData = docSnap.data() as FirestoreBooking;
          setBooking(bookingData);
          form.reset({
            customerName: bookingData.customerName,
            customerEmail: bookingData.customerEmail,
            customerPhone: bookingData.customerPhone,
            addressLine1: bookingData.addressLine1,
            addressLine2: bookingData.addressLine2 || "",
            city: bookingData.city,
            state: bookingData.state,
            pincode: bookingData.pincode,
            latitude: bookingData.latitude || null,
            longitude: bookingData.longitude || null,
            scheduledDate: bookingData.scheduledDate,
            scheduledTimeSlot: bookingData.scheduledTimeSlot,
            status: bookingData.status,
            notes: bookingData.notes || "",
          });
          
          if (bookingData.scheduledDate) {
            const dateParts = bookingData.scheduledDate.split('-');
            if (dateParts.length === 3) {
              setCalendarDate(new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
            } else {
               const parsedDate = new Date(bookingData.scheduledDate);
               if (!isNaN(parsedDate.getTime())) {
                  setCalendarDate(parsedDate);
                  form.setValue('scheduledDate', parsedDate.toLocaleDateString('en-CA'));
               }
            }
          }
        } else {
          toast({ title: "Not Found", description: "Booking not found.", variant: "destructive" });
          router.push('/admin/bookings');
        }
      } catch (error) {
        console.error("Error fetching booking:", error);
        toast({ title: "Error", description: "Could not fetch booking details.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId, router, toast, form]);
  
  const handleCalendarSelect = (date: Date | undefined) => {
    setCalendarDate(date);
    if (date) {
      form.setValue('scheduledDate', date.toLocaleDateString('en-CA')); // YYYY-MM-DD
    } else {
      form.setValue('scheduledDate', '');
    }
  };

  const onSubmit = async (data: BookingEditFormData) => {
    if (!booking) return;
    setIsSubmitting(true);

    try {
      const bookingDocRef = doc(db, "bookings", bookingId);
      
      const updateData: Partial<FirestoreBooking> = {
        ...data,
        status: data.status as BookingStatus,
        latitude: data.latitude === null ? undefined : data.latitude, // Ensure nulls become undefined for Firestore
        longitude: data.longitude === null ? undefined : data.longitude,
        updatedAt: Timestamp.now(),
      };

      await updateDoc(bookingDocRef, updateData);

      // Trigger post-process API to update system stats, send emails, etc.
      fetch('/api/bookings/post-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingDocId: bookingId }),
      }).catch(err => console.error("Error calling post-process after edit:", err));

      // Create notification for the user
      const userNotificationData: Omit<FirestoreNotification, 'id'> = {
        userId: booking.userId || "anonymous",
        title: `Booking Update: ${data.status}`,
        message: `Your booking ${booking.bookingId} has been updated to ${data.status}.`,
        type: data.status === 'Completed' ? 'success' : (data.status === 'Cancelled' ? 'error' : 'info'),
        href: '/my-bookings',
        read: false,
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, "userNotifications"), userNotificationData);

      // Trigger Push Notification
      if (booking.userId) {
        triggerPushNotification({
            userId: booking.userId,
            title: userNotificationData.title,
            body: userNotificationData.message,
            href: userNotificationData.href
        });
      }

      toast({ title: "Success", description: "Booking updated successfully." });
      router.push('/admin/bookings');
    } catch (error) {
      console.error("Error updating booking:", error);
      toast({ title: "Error", description: "Could not update booking.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !booking) { // Show loader if still loading and no booking data yet
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading booking details...</p>
      </div>
    );
  }

  if (!booking && !isLoading) { // If loading is done and still no booking, then it wasn't found (or ID was invalid)
    // The useEffect would have redirected, but this is a fallback.
    return <p className="text-center text-muted-foreground">Booking data could not be loaded or was not found.</p>;
  }
  
  // If booking is loaded, render the form (even if isLoading might still be true briefly due to state updates)
  return (
    <div className="max-w-4xl mx-auto p-4">
      <Card className="shadow-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl flex items-center">
                  <Edit className="mr-2 h-6 w-6 text-primary" /> Edit Booking: {booking?.bookingId || bookingId}
                </CardTitle>
                <Link href="/admin/bookings" passHref>
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Bookings
                  </Button>
                </Link>
              </div>
              <CardDescription>Modify the details of this booking. Service items cannot be changed here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <section className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><User className="mr-2 h-5 w-5 text-muted-foreground"/>Customer Details</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="customerEmail"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="customerPhone"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input type="tel" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
              </section>
              
              <section className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><MapPin className="mr-2 h-5 w-5 text-muted-foreground"/>Address & Location</h3>
                <FormField
                  control={form.control}
                  name="addressLine1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 1</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressLine2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 2 (Optional)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pincode"
                    render={({ field }) => (
                      <FormItem><FormLabel>Pincode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <FormItem>
                        <FormLabel className="flex items-center"><Globe className="mr-2 h-4 w-4 text-muted-foreground"/>Latitude (Read-only)</FormLabel>
                        <FormControl><Input value={form.watch('latitude') !== null && form.watch('latitude') !== undefined ? form.watch('latitude')?.toFixed(6) : "N/A"} readOnly disabled className="bg-muted/50"/></FormControl>
                    </FormItem>
                     <FormItem>
                        <FormLabel className="flex items-center"><Globe className="mr-2 h-4 w-4 text-muted-foreground"/>Longitude (Read-only)</FormLabel>
                        <FormControl><Input value={form.watch('longitude') !== null && form.watch('longitude') !== undefined ? form.watch('longitude')?.toFixed(6) : "N/A"} readOnly disabled className="bg-muted/50"/></FormControl>
                    </FormItem>
                </div>
              </section>

              <section className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><Clock className="mr-2 h-5 w-5 text-muted-foreground"/>Schedule & Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <FormField
                    control={form.control}
                    name="scheduledDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Scheduled Date</FormLabel>
                        <Calendar
                            mode="single"
                            selected={calendarDate}
                            onSelect={handleCalendarSelect}
                            className="rounded-md border p-0 self-start"
                            disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))} 
                        />
                         <Input type="hidden" {...field} /> 
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <div className="space-y-4">
                        <FormField
                        control={form.control}
                        name="scheduledTimeSlot"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Scheduled Time Slot</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select time slot" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {allTimeSlots.map(slot => <SelectItem key={slot} value={slot}>{slot}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Booking Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>
                </div>
              </section>

              <section className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold">Notes</h3>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Notes (Optional)</FormLabel>
                      <FormControl><Textarea rows={4} placeholder="Any special instructions or notes..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

            </CardContent>
            <CardFooter className="flex justify-end pt-6">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
