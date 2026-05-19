
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FirestoreCategory, TimeSlotCategoryLimit } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

const timeSlotLimitFormSchema = z.object({
  categoryId: z.string({ required_error: "Please select a category." }),
  maxConcurrentBookings: z.coerce
    .number()
    .min(1, { message: "Limit must be at least 1." })
    .max(100, { message: "Limit cannot exceed 100." }), // Sensible upper bound
});

type TimeSlotLimitFormData = z.infer<typeof timeSlotLimitFormSchema>;

interface TimeSlotCategoryLimitFormProps {
  onSubmitSuccess: () => void; // Callback on successful save
  initialData?: TimeSlotCategoryLimit | null;
  categories: FirestoreCategory[];
  existingLimitCategoryIds: string[]; // To filter categories in dropdown for "add" mode
  onCancel: () => void;
}

export default function TimeSlotCategoryLimitForm({
  onSubmitSuccess,
  initialData,
  categories,
  existingLimitCategoryIds,
  onCancel,
}: TimeSlotCategoryLimitFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | undefined>(undefined);

  const form = useForm<TimeSlotLimitFormData>({
    resolver: zodResolver(timeSlotLimitFormSchema),
    defaultValues: {
      categoryId: initialData?.categoryId || undefined,
      maxConcurrentBookings: initialData?.maxConcurrentBookings || 1,
    },
  });
  
  const watchedCategoryId = form.watch("categoryId");

  useEffect(() => {
    if (initialData) {
      form.reset({
        categoryId: initialData.categoryId,
        maxConcurrentBookings: initialData.maxConcurrentBookings,
      });
      setSelectedCategoryName(categories.find(c => c.id === initialData.categoryId)?.name);
    } else {
      form.reset({ categoryId: undefined, maxConcurrentBookings: 1 });
      setSelectedCategoryName(undefined);
    }
  }, [initialData, form, categories]);

  useEffect(() => {
    if (watchedCategoryId) {
      setSelectedCategoryName(categories.find(c => c.id === watchedCategoryId)?.name);
    } else {
      setSelectedCategoryName(undefined);
    }
  }, [watchedCategoryId, categories]);

  const handleSubmit = async (formData: TimeSlotLimitFormData) => {
    setIsSubmitting(true);
    if (!selectedCategoryName) {
        toast({ title: "Error", description: "Category name not found.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    try {
      const limitDocRef = doc(db, "timeSlotCategoryLimits", formData.categoryId);
      const payload: TimeSlotCategoryLimit = {
        id: formData.categoryId, // Use categoryId as document ID
        categoryId: formData.categoryId,
        categoryName: selectedCategoryName, 
        maxConcurrentBookings: formData.maxConcurrentBookings,
        updatedAt: Timestamp.now(),
      };
      await setDoc(limitDocRef, payload, { merge: true }); // Use setDoc with merge to create or update
      
      toast({ title: "Success", description: `Limit for ${selectedCategoryName} ${initialData ? 'updated' : 'added'} successfully.` });
      onSubmitSuccess(); // Call parent's success handler (e.g., close dialog)
    } catch (error) {
      console.error("Error saving time slot limit: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save limit.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Filter categories for "Add New Limit" mode: show only those without an existing limit
  const availableCategoriesForNewLimit = initialData 
    ? categories // If editing, show all categories (dropdown will be disabled for categoryId)
    : categories.filter(cat => !existingLimitCategoryIds.includes(cat.id));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-2">
        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isSubmitting || !!initialData} // Disable if editing existing limit
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableCategoriesForNewLimit.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                  {availableCategoriesForNewLimit.length === 0 && !initialData && (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                        All categories have limits.
                    </div>
                  )}
                </SelectContent>
              </Select>
              {!!initialData && <FormDescription>Category cannot be changed for an existing limit.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="maxConcurrentBookings"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max Concurrent Bookings Per Slot</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 2" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormDescription>
                How many bookings for this category can exist in the same time slot.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || (availableCategoriesForNewLimit.length === 0 && !initialData)}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Add Limit'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
