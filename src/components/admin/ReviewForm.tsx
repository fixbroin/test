
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FirestoreReview, FirestoreService, ReviewStatus } from "@/types/firestore";
import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";

const reviewStatusOptions: [string, ...string[]] = ["Pending", "Approved", "Rejected", "Flagged"];

const reviewFormSchema = z.object({
  serviceId: z.string({ required_error: "Please select a service." }),
  userName: z.string().min(2, "Reviewer name must be at least 2 characters.").default("Admin"),
  rating: z.coerce.number().min(1, "Rating must be at least 1.").max(5, "Rating cannot exceed 5."),
  comment: z.string().min(10, "Comment must be at least 10 characters.").max(1000, "Comment too long."),
  status: z.enum(reviewStatusOptions),
});

export type ReviewFormData = z.infer<typeof reviewFormSchema>;

interface ReviewFormProps {
  onSubmit: (data: ReviewFormData & { serviceName: string, adminCreated: boolean, id?: string }) => Promise<void>;
  initialData?: FirestoreReview | null;
  services: Pick<FirestoreService, 'id' | 'name'>[]; 
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ReviewForm({ onSubmit: onSubmitProp, initialData, services, onCancel, isSubmitting = false }: ReviewFormProps) {
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      serviceId: initialData?.serviceId || undefined,
      userName: initialData?.userName || "Admin",
      rating: initialData?.rating || 3,
      comment: initialData?.comment || "",
      status: initialData?.status || "Pending",
    },
  });
  
  const watchedServiceId = form.watch("serviceId");

  useEffect(() => {
    if (initialData) {
      form.reset({
        serviceId: initialData.serviceId,
        userName: initialData.userName,
        rating: initialData.rating,
        comment: initialData.comment,
        status: initialData.status,
      });
      const service = services.find(s => s.id === initialData.serviceId);
      setSelectedServiceName(service?.name || "Unknown Service");
    } else {
      form.reset({
        serviceId: undefined,
        userName: "Admin",
        rating: 3,
        comment: "",
        status: "Pending",
      });
      setSelectedServiceName("");
    }
  }, [initialData, form, services]);

  useEffect(() => {
    if (watchedServiceId) {
      const service = services.find(s => s.id === watchedServiceId);
      setSelectedServiceName(service?.name || "Unknown Service");
    } else {
      setSelectedServiceName("");
    }
  }, [watchedServiceId, services]);


  const handleSubmit = async (formData: ReviewFormData) => {
    const serviceName = services.find(s => s.id === formData.serviceId)?.name || "Unknown Service";
    await onSubmitProp({ 
      ...formData, 
      serviceName,
      adminCreated: true, 
      id: initialData?.id 
    });
  };

  return (
    <Form {...form}>
      {/* Form takes full height of its container from reviews/page.tsx */}
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full"> 
        {/* This div contains the actual form fields and will scroll if needed */}
        <div className="p-6 space-y-6 flex-grow"> {/* Removed overflow-y-auto, parent handles scroll */}
            <FormField
            control={form.control}
            name="serviceId"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Service</FormLabel>
                <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value} 
                    value={field.value} 
                    disabled={isSubmitting || !!initialData} 
                >
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a service for the review" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    {services.map(service => (
                        <SelectItem key={service.id} value={service.id}>
                        {service.name}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                {initialData && <FormDescription>Service cannot be changed for an existing review.</FormDescription>}
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="userName"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Reviewer Name</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., Admin or John Doe" {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            
            <FormField
            control={form.control}
            name="rating"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Rating (1-5 stars)</FormLabel>
                <FormControl>
                    <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                        key={star}
                        className={`h-6 w-6 cursor-pointer transition-colors
                            ${star <= field.value ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground hover:text-yellow-300'}`}
                        onClick={() => field.onChange(star)}
                        />
                    ))}
                    <Input type="hidden" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Review Comment</FormLabel>
                <FormControl>
                    <Textarea placeholder="Write the review content here..." {...field} rows={5} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isSubmitting}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select review status" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    {reviewStatusOptions.map(status => (
                        <SelectItem key={status} value={status}>
                        {status}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>
        
        {/* Button footer - mt-auto pushes it down if form content is short. */}
        <div className="p-6 border-t bg-background flex flex-col sm:flex-row sm:justify-end gap-3 mt-auto">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Save Changes' : 'Create Review'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
