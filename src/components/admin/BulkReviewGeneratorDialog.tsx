
"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { FirestoreService, FirestoreSubCategory, FirestoreCategory, FirestoreReview } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { generateBulkReviews } from '@/ai/flows/generateBulkReviewsFlow';
import { db } from '@/lib/firebase';
import { collection, writeBatch, Timestamp, doc } from 'firebase/firestore';

const formSchema = z.object({
  serviceId: z.string({ required_error: "Please select a service." }),
  numberOfReviews: z.coerce.number().int().min(1, "Must generate at least 1 review.").max(20, "Cannot generate more than 20 reviews at once."),
});

type BulkReviewFormData = z.infer<typeof formSchema>;

interface BulkReviewGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerationComplete: () => void;
  services: Pick<FirestoreService, 'id' | 'name' | 'subCategoryId'>[];
  subCategories: Pick<FirestoreSubCategory, 'id' | 'name' | 'parentId'>[];
  parentCategories: Pick<FirestoreCategory, 'id' | 'name'>[];
}

export default function BulkReviewGeneratorDialog({
  isOpen,
  onClose,
  onGenerationComplete,
  services,
  subCategories,
  parentCategories,
}: BulkReviewGeneratorDialogProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<BulkReviewFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { serviceId: undefined, numberOfReviews: 5 },
  });

  const onSubmit = async (data: BulkReviewFormData) => {
    setIsGenerating(true);
    toast({ title: "Starting Review Generation...", description: "The AI is crafting reviews. This may take a moment." });

    const selectedService = services.find(s => s.id === data.serviceId);
    if (!selectedService) {
      toast({ title: "Error", description: "Selected service not found.", variant: "destructive" });
      setIsGenerating(false);
      return;
    }
    const subCategory = subCategories.find(sc => sc.id === selectedService.subCategoryId);
    const parentCategory = parentCategories.find(pc => pc.id === subCategory?.parentId);

    try {
      const aiResult = await generateBulkReviews({
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        subCategoryName: subCategory?.name || '',
        categoryName: parentCategory?.name || '',
        numberOfReviews: data.numberOfReviews,
      });

      if (!aiResult.reviews || aiResult.reviews.length === 0) {
        throw new Error("AI did not return any reviews.");
      }
      
      toast({ title: "AI Generation Complete", description: `Saving ${aiResult.reviews.length} new reviews to the database.` });

      // Save to Firestore
      const batch = writeBatch(db);
      const reviewsCollectionRef = collection(db, "adminReviews");

      aiResult.reviews.forEach(review => {
        const newReviewRef = doc(reviewsCollectionRef);
        const reviewData: Omit<FirestoreReview, 'id'> = {
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          userName: review.userName,
          rating: review.rating,
          comment: review.comment,
          status: "Approved", // Auto-approve AI-generated reviews
          adminCreated: true,
          createdAt: Timestamp.now(),
        };
        batch.set(newReviewRef, reviewData);
      });

      await batch.commit();

      toast({ title: "Success!", description: `${aiResult.reviews.length} reviews have been successfully generated and saved.`, className: "bg-green-100 text-green-700 border-green-300" });
      onGenerationComplete(); // To trigger a refresh on the main page
      onClose(); // Close the dialog

    } catch (error) {
      console.error("Error generating or saving bulk reviews:", error);
      toast({ title: "Error", description: (error as Error).message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {if (!isGenerating) onClose()}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center"><Wand2 className="mr-2 h-5 w-5 text-primary"/> AI Bulk Review Generator</DialogTitle>
          <DialogDescription>
            Select a service and generate multiple realistic reviews automatically.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Service</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isGenerating}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a service..." />
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
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="numberOfReviews"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Reviews to Generate</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="20" placeholder="e.g., 10" {...field} disabled={isGenerating} />
                  </FormControl>
                  <FormDescription>Max 20 reviews per generation.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isGenerating}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate Reviews
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
