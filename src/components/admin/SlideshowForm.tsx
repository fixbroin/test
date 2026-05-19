
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FirestoreSlide, SlideButtonLinkType, FirestoreCategory, FirestoreSubCategory, FirestoreService } from "@/types/firestore";
import { useEffect, useState, useRef } from "react";
import { Loader2, Image as ImageIconLucide, Trash2 } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";

const slideFormSchema = z.object({
  title: z.string().max(100, "Title too long.").optional().or(z.literal('')),
  description: z.string().max(250, "Description too long.").optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 characters.").optional().or(z.literal('')),
  order: z.coerce.number().min(0, "Order must be non-negative."),
  buttonText: z.string().max(30, "Button text too long.").optional().or(z.literal('')),
  buttonLinkType: z.enum(['category', 'subcategory', 'service', 'url']).optional().nullable(), // Allow null for reset
  buttonLinkValue: z.string().max(255, "Link value is too long.").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
}).refine(data => {
  if (data.buttonText && data.buttonText.trim() !== "") {
    return !!data.buttonLinkType && !!(data.buttonLinkValue && data.buttonLinkValue.trim() !== "");
  }
  return true;
}, {
  message: "If Button Text is present, Link Type and Link Value are required.",
  path: ["buttonLinkValue"],
});

type SlideFormData = z.infer<typeof slideFormSchema>;

interface SlideshowFormProps {
  onSubmit: (data: Omit<FirestoreSlide, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreSlide | null;
  onCancel: () => void;
  categories: FirestoreCategory[];
  subCategories: FirestoreSubCategory[];
  services: FirestoreService[];
  isSubmitting?: boolean;
}

const isFirebaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
};

const generateRandomHexString = (length: number) => {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/')) {
        try {
            if (url.startsWith('http:') || url.startsWith('https:')) {
                new URL(url);
            }
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
};

export default function SlideshowForm({
  onSubmit: onSubmitProp,
  initialData,
  onCancel,
  categories,
  subCategories,
  services,
  isSubmitting: isParentSubmitting = false,
}: SlideshowFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);

  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<SlideFormData>({
    resolver: zodResolver(slideFormSchema),
    defaultValues: {
      title: "",
      description: "",
      imageUrl: "",
      imageHint: "",
      order: 0,
      buttonText: "",
      buttonLinkType: undefined,
      buttonLinkValue: "",
      isActive: true,
    },
  });

  const watchedLinkType = form.watch("buttonLinkType");
  const watchedButtonText = form.watch("buttonText");

  useEffect(() => {
    if (initialData) {
      form.reset({
        title: initialData.title || "",
        description: initialData.description || "",
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        order: initialData.order,
        buttonText: initialData.buttonText || "",
        buttonLinkType: initialData.buttonLinkType === null ? undefined : initialData.buttonLinkType, // Map null to undefined
        buttonLinkValue: initialData.buttonLinkValue || "",
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({
        title: "", description: "", imageUrl: "", imageHint: "", order: 0,
        buttonText: "", buttonLinkType: undefined, buttonLinkValue: "", isActive: true,
      });
      setCurrentImagePreview(null);
      setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null);
    setUploadProgress(null);
    setIsFormBusyForImage(false);
    setStatusMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialData, form]);

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Select image smaller than 5MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null);
        setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      setSelectedFile(file);
      setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('imageUrl', '', { shouldValidate: false });
      form.clearErrors("imageUrl");
    } else {
      setSelectedFile(null);
      setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
    }
  };

  const handleRemoveImage = async () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(currentImagePreview);
    }
    setSelectedFile(null);
    setCurrentImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    form.clearErrors("imageUrl");
  };

  const handleSubmit = async (formData: SlideFormData) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || "";

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image...");
        setUploadProgress(0);
        if (originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
          try {
            const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
            await deleteObject(oldImageRef);
          } catch (error) {
            console.warn("Error deleting old image from Firebase Storage: ", error);
          }
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/slideshows/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);

        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              setStatusMessage(`Uploading: ${Math.round(progress)}%`);
            },
            (error) => { console.error("Upload error:", error); reject(new Error(`Image upload failed: ${error.message}`)); },
            async () => {
              try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); }
              catch (error) { reject(new Error(`Failed to get download URL: ${(error as Error).message}`)); }
            }
          );
        });
        setUploadProgress(100);
        setStatusMessage("Image uploaded. Saving...");
      } else {
         finalImageUrl = formData.imageUrl || "";
         if (!finalImageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
            setStatusMessage("Removing image...");
            try {
                const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
                await deleteObject(oldImageRef);
            } catch (error: any) {
                console.error("Error deleting image from Firebase Storage: ", error);
                throw new Error(`Failed to delete previous image from storage. Slide not saved.`);
            }
            setStatusMessage("Image removed. Saving...");
         }
         else if (finalImageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData) && finalImageUrl !== originalImageUrlFromInitialData) {
             setStatusMessage("Replacing image URL...");
             try {
                const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
                await deleteObject(oldImageRef);
             } catch (error) {
                 console.warn("Error deleting old image for URL replacement:", error);
             }
             setStatusMessage("Old image removed (if existed). Saving...");
         } else {
            setStatusMessage(initialData ? "Saving changes..." : "Creating slide...");
         }
      }

      if (!finalImageUrl) {
        form.setError("imageUrl", { type: "manual", message: "An image URL or uploaded file is required." });
        setIsFormBusyForImage(false);
        setStatusMessage("");
        toast({title: "Image Required", description: "Please provide an image for the slide.", variant: "destructive"});
        return;
      }

      const payload: Omit<FirestoreSlide, 'id' | 'createdAt' | 'updatedAt'> = {
        title: formData.title || "",
        description: formData.description || "",
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint || "",
        order: Number(formData.order),
        buttonText: formData.buttonText || "",
        buttonLinkType: (formData.buttonText && formData.buttonText.trim() !== "") || (formData.buttonLinkType && formData.buttonLinkValue?.trim() !== "") ? formData.buttonLinkType : null,
        buttonLinkValue: (formData.buttonText && formData.buttonText.trim() !== "") || (formData.buttonLinkType && formData.buttonLinkValue?.trim() !== "") ? formData.buttonLinkValue : null,
        isActive: formData.isActive === undefined ? true : formData.isActive,
      };

      if (!payload.buttonText && !(payload.buttonLinkType && payload.buttonLinkValue)) {
          payload.buttonLinkType = null;
          payload.buttonLinkValue = null;
      }

      await onSubmitProp({
        ...payload,
        id: initialData?.id,
      });

      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = "";

    } catch (error) {
      console.error("Error during slide form submission:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save slide.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false);
      setStatusMessage("");
      setUploadProgress(null);
    }
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;
  const showLinkRequiredAsterisk = !!watchedButtonText?.trim() || !!watchedLinkType;

  return (
    <Form {...form} key={initialData ? `slide-form-${initialData.id}` : 'new-slide-form'}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-4 p-6 overflow-y-auto">
        <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem><FormLabel>Title (Optional)</FormLabel><FormControl><Input placeholder="E.g., Summer Sale" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>
        <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Short description for the slide" {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>

        <FormItem>
          <FormLabel>Slide Image <span className="text-destructive">*</span></FormLabel>
          {displayPreviewUrl ? (
            <div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10">
              <NextImage src={displayPreviewUrl} alt="Current slide image" fill className="object-contain" data-ai-hint={form.watch('imageHint') || "slide image preview"} unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw" />
            </div>
          ) : (
            <div className="my-2 flex items-center justify-center w-full h-40 rounded-md border border-dashed bg-muted/10"><ImageIconLucide className="h-10 w-10 text-muted-foreground" /></div>
          )}
          <FormControl><Input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleFileSelected} disabled={effectiveIsSubmitting} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90" /></FormControl>
          <FormDescription className="mt-1">Upload new image (PNG, JPG, GIF, WEBP, max 5MB).</FormDescription>
          {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)}
        </FormItem>

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Or Enter Image URL <span className="text-destructive">*</span></FormLabel>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <FormControl className="flex-grow"><Textarea placeholder="https://example.com/image.png. Clear to remove image." {...field} disabled={effectiveIsSubmitting || selectedFile !== null} rows={2} onChange={(e) => { field.onChange(e); if (!selectedFile) { setCurrentImagePreview(e.target.value || null); }}}/></FormControl>
                {(field.value || selectedFile || currentImagePreview) && (<Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image" className="sm:ml-auto mt-2 sm:mt-0"><Trash2 className="h-4 w-4 text-destructive"/></Button>)}
              </div>
              <FormDescription>An image (uploaded or via URL) is required for the slide to display correctly.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField control={form.control} name="imageHint" render={({ field }) => (
            <FormItem><FormLabel>Image AI Hint (Optional)</FormLabel><FormControl><Input placeholder="e.g., happy family cleaning" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Keywords for AI (e.g. "tools repair"). Max 50 chars.</FormDescription><FormMessage /></FormItem>
        )}/>
        <FormField control={form.control} name="order" render={({ field }) => (
            <FormItem><FormLabel>Display Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>
        <FormField control={form.control} name="buttonText" render={({ field }) => (
            <FormItem><FormLabel>Button Text (Optional)</FormLabel><FormControl><Input placeholder="e.g., Shop Now" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>

        <FormField
            control={form.control}
            name="buttonLinkType"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Link Type {showLinkRequiredAsterisk && <span className="text-destructive">*</span>}</FormLabel>
                    <Select
                        key={`link-type-select-${initialData?.id || 'new'}-${field.value}`}
                        onValueChange={(value) => {
                            field.onChange(value as SlideButtonLinkType | undefined); // Cast to allow undefined for reset
                            form.setValue('buttonLinkValue', '');
                            form.trigger('buttonLinkValue');
                        }}
                        value={field.value || undefined} // Ensure undefined is passed if field.value is null/empty for placeholder
                        disabled={effectiveIsSubmitting}
                    >
                        <FormControl><SelectTrigger><SelectValue placeholder="Select link type (for image or button)" /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="url">Custom URL</SelectItem>
                            <SelectItem value="category">Category</SelectItem>
                            <SelectItem value="subcategory">Sub-Category</SelectItem>
                            <SelectItem value="service">Service</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormDescription>This link applies to the image if no button text is set.</FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
        <FormField
            control={form.control}
            name="buttonLinkValue"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Link Value {showLinkRequiredAsterisk && <span className="text-destructive">*</span>}</FormLabel>
                    {watchedLinkType === 'url' && <FormControl><Input placeholder="https://example.com/offer" {...field} value={field.value || ""} disabled={effectiveIsSubmitting || !watchedLinkType} /></FormControl>}
                    {watchedLinkType === 'category' && (
                        <Select
                            key={`link-value-cat-${initialData?.id || 'new'}-${field.value}-${categories.length}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                            disabled={effectiveIsSubmitting || categories.length === 0 || !watchedLinkType}
                        >
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl>
                            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )}
                    {watchedLinkType === 'subcategory' && (
                         <Select
                            key={`link-value-subcat-${initialData?.id || 'new'}-${field.value}-${subCategories.length}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                            disabled={effectiveIsSubmitting || subCategories.length === 0 || !watchedLinkType}
                         >
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a sub-category" /></SelectTrigger></FormControl>
                            <SelectContent>{subCategories.map(sc => <SelectItem key={sc.id} value={sc.slug}>{sc.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )}
                    {watchedLinkType === 'service' && (
                        <Select
                            key={`link-value-serv-${initialData?.id || 'new'}-${field.value}-${services.length}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                            disabled={effectiveIsSubmitting || services.length === 0 || !watchedLinkType}
                        >
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger></FormControl>
                            <SelectContent>{services.map(s => <SelectItem key={s.id} value={s.slug}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )}
                    {!watchedLinkType && <Input placeholder="Select Link Type first" disabled={true} />}
                    <FormMessage />
                </FormItem>
            )}
        />
        <FormField control={form.control} name="isActive" render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5"><FormLabel>Slide Active</FormLabel><FormDescription>If unchecked, slide will not be shown.</FormDescription></div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl>
            </FormItem>
        )}/>

        <div className="p-6 border-t sticky bottom-0 bg-background flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
          <Button type="submit" disabled={effectiveIsSubmitting}>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Slide')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
