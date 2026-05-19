
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { HomepageAd, AdActionType, AdPlacement, FirestoreCategory, FirestoreService } from '@/types/firestore';
import { useEffect, useState, useRef } from "react";
import { Loader2, Image as ImageIconLucide, Trash2, ExternalLink, ListChecks, ShoppingBag } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase'; // Assuming firebase.ts exports storage
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";
import { nanoid } from 'nanoid'; // Import nanoid

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com/v0/b/fixbroweb.firebasestorage.app/o/public%2Fuploads%2Fads");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const adActionTypes: [string, ...string[]] = ['url', 'category', 'service'];
const adPlacements: [string, ...string[]] = [
    'AFTER_HERO_CAROUSEL', 'AFTER_POPULAR_SERVICES', 'AFTER_RECENTLY_ADDED_SERVICES', 'AFTER_CATEGORY_SECTIONS', 'BEFORE_FOOTER_CTA'
];

const adFormSchema = z.object({
  name: z.string().min(2, "Ad name is required.").max(100, "Name too long."),
  imageUrl: z.string().url({ message: "Valid image URL or uploaded image required." }).optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 chars.").optional().or(z.literal('')),
  actionType: z.enum(adActionTypes, { required_error: "Action type is required."}),
  targetValue: z.string().min(1, "Target value is required."),
  placement: z.enum(adPlacements, { required_error: "Placement is required."}),
  order: z.coerce.number().min(0, "Order must be non-negative.").default(0),
  isActive: z.boolean().default(true),
});

export type AdFormData = z.infer<typeof adFormSchema>;

interface AdFormProps {
  onSubmit: (data: AdFormData, adId?: string) => Promise<void>; // Pass adId if editing
  initialData?: HomepageAd | null;
  onCancel: () => void;
  allCategories: FirestoreCategory[];
  allServices: FirestoreService[];
  isSubmitting?: boolean;
}

export default function AdForm({ onSubmit: onSubmitProp, initialData, onCancel, allCategories, allServices, isSubmitting: isParentSubmitting = false }: AdFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);
  
  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<AdFormData>({
    resolver: zodResolver(adFormSchema),
    defaultValues: initialData ? 
      { ...initialData, targetValue: initialData.targetValue || "" } : 
      { name: "", imageUrl: "", imageHint: "", actionType: "url", targetValue: "", placement: "AFTER_HERO_CAROUSEL", order: 0, isActive: true },
  });

  const watchedActionType = form.watch("actionType");

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        actionType: initialData.actionType,
        targetValue: initialData.targetValue || "",
        placement: initialData.placement,
        order: initialData.order,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({ name: "", imageUrl: "", imageHint: "", actionType: "url", targetValue: "", placement: "AFTER_HERO_CAROUSEL", order: 0, isActive: true });
      setCurrentImagePreview(null); setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null); setUploadProgress(null); setIsFormBusyForImage(false); setStatusMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialData, form]);

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({ title: "File Too Large", description: "Image must be < 2MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null); setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      setSelectedFile(file); setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('imageUrl', '', { shouldValidate: false }); // Clear URL if file selected
    } else {
      setSelectedFile(null); setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
    }
  };

  const handleRemoveImage = () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) URL.revokeObjectURL(currentImagePreview);
    setSelectedFile(null); setCurrentImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (formData: AdFormData) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || "";

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image..."); setUploadProgress(0);
        if (originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
          try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); }
          catch (error) { console.warn("Error deleting old ad image:", error); }
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `ad_${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/ads/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);
        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => { const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100; setUploadProgress(p); setStatusMessage(`Uploading: ${Math.round(p)}%`); },
            (error) => { console.error("Upload error:", error); reject(new Error(`Upload failed: ${error.message}`)); },
            async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(new Error(`URL failed: ${(e as Error).message}`)); } }
          );
        });
        setUploadProgress(100); setStatusMessage("Image uploaded. Saving ad...");
      } else if (!formData.imageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
        setStatusMessage("Removing image...");
        try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); finalImageUrl = ""; setStatusMessage("Image removed. Saving ad..."); }
        catch (e: any) { throw new Error(`Failed to delete image: ${e.message}. Ad not saved.`); }
      } else { setStatusMessage(initialData ? "Saving changes..." : "Creating ad..."); }

      if (!finalImageUrl) {
        form.setError("imageUrl", { type: "manual", message: "An image URL or uploaded file is required." });
        setIsFormBusyForImage(false); setStatusMessage(""); toast({title: "Image Required", variant: "destructive"}); return;
      }

      await onSubmitProp({ ...formData, imageUrl: finalImageUrl }, initialData?.id);
      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Ad form submission/image error:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save ad.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false); setStatusMessage(""); setUploadProgress(null);
    }
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-4 p-6 overflow-y-auto">
        <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Ad Name (Internal)</FormLabel><FormControl><Input placeholder="e.g., Summer Sale Banner" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />
        <FormItem>
          <FormLabel>Ad Image <span className="text-destructive">*</span></FormLabel>
          {displayPreviewUrl ? (<div className="my-2 relative w-full h-32 rounded-md overflow-hidden border bg-muted/10"><NextImage src={displayPreviewUrl} alt="Ad preview" fill className="object-contain" data-ai-hint={form.watch('imageHint') || "advertisement banner"} unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/></div>) : (<div className="my-2 flex items-center justify-center w-full h-32 rounded-md border border-dashed bg-muted/10"><ImageIconLucide className="h-10 w-10 text-muted-foreground" /></div>)}
          <FormControl><Input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleFileSelected} disabled={effectiveIsSubmitting} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"/></FormControl>
          <FormDescription className="mt-1">Upload (PNG, JPG, GIF, WEBP, max 2MB).</FormDescription>
          {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)}
        </FormItem>
        <FormField control={form.control} name="imageUrl" render={({ field }) => (<FormItem><FormLabel>Or Image URL <span className="text-destructive">*</span></FormLabel><div className="flex items-center gap-2"><FormControl className="flex-grow"><Textarea placeholder="https://example.com/ad.png" {...field} disabled={effectiveIsSubmitting || !!selectedFile} rows={2} onChange={(e) => { field.onChange(e); if (!selectedFile) setCurrentImagePreview(e.target.value || null); }}/></FormControl>{(field.value || selectedFile || currentImagePreview) && (<Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image"><Trash2 className="h-4 w-4 text-destructive"/></Button>)}</div><FormDescription>Required if no file uploaded.</FormDescription><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image AI Hint</FormLabel><FormControl><Input placeholder="e.g., summer sale offer" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="actionType" render={({ field }) => (<FormItem><FormLabel>Action Type</FormLabel><Select onValueChange={(value) => { field.onChange(value as AdActionType); form.setValue('targetValue', ''); }} value={field.value} disabled={effectiveIsSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger></FormControl><SelectContent>{adActionTypes.map(type => (<SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
          <FormField control={form.control} name="targetValue" render={({ field }) => (
            <FormItem>
              <FormLabel>Target Value <span className="text-destructive">*</span>
                {watchedActionType === 'category' && <ListChecks className="inline ml-1 h-3 w-3 text-muted-foreground"/>}
                {watchedActionType === 'service' && <ShoppingBag className="inline ml-1 h-3 w-3 text-muted-foreground"/>}
                {watchedActionType === 'url' && <ExternalLink className="inline ml-1 h-3 w-3 text-muted-foreground"/>}
              </FormLabel>
              {watchedActionType === 'url' && <FormControl><Input placeholder="https://example.com/target" {...field} disabled={effectiveIsSubmitting} /></FormControl>}
              {watchedActionType === 'category' && <Select onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting || allCategories.length === 0}><FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl><SelectContent>{allCategories.map(c => (<SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>))}</SelectContent></Select>}
              {watchedActionType === 'service' && <Select onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting || allServices.length === 0}><FormControl><SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger></FormControl><SelectContent>{allServices.map(s => (<SelectItem key={s.id} value={s.slug}>{s.name}</SelectItem>))}</SelectContent></Select>}
              <FormMessage />
            </FormItem>
          )}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="placement" render={({ field }) => (<FormItem><FormLabel>Placement</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="Select placement" /></SelectTrigger></FormControl><SelectContent>{adPlacements.map(place => (<SelectItem key={place} value={place}>{place.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Sort order within the same placement.</FormDescription><FormMessage /></FormItem>)}/>
        </div>
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Ad Active</FormLabel><FormDescription>Enable this ad to be shown.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)}/>
        
        <div className="p-6 border-t sticky bottom-0 bg-background flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
          <Button type="submit" disabled={effectiveIsSubmitting}>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Ad')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
