
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FirestorePopup, PopupType, PopupDisplayRuleType, PopupDisplayFrequency } from '@/types/firestore';
import { useEffect, useState, useRef } from "react";
import { Loader2, Image as ImageIconLucide, Trash2, User, Phone, MapPin } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const popupTypes: [string, ...string[]] = ["newsletter_signup", "promotional", "welcome", "exit_intent", "marketing_modal", "lead_capture", "subscribe", "video"];
const displayRuleTypes: [string, ...string[]] = ["on_page_load", "on_exit_intent", "after_x_seconds", "on_scroll_percentage"];
const displayFrequencies: [string, ...string[]] = ["once_per_session", "once_per_day", "always"];

const popupFormSchema = z.object({
  name: z.string().min(2, "Internal Name is required.").max(100, "Name too long."),
  popupType: z.enum(popupTypes, { required_error: "Popup type is required." }),
  title: z.string().max(150, "Title too long.").optional().or(z.literal('')),
  displayText: z.string().max(500, "Display text too long.").optional().or(z.literal('')),
  imageUrl: z.string().url({ message: "Must be a valid URL if provided." }).optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 chars.").optional().or(z.literal('')),
  videoUrl: z.string().url({ message: "Must be a valid URL if provided." }).optional().or(z.literal('')),
  showEmailInput: z.boolean().default(false),
  showNameInput: z.boolean().default(false),
  showMobileInput: z.boolean().default(false),
  promoCode: z.string().max(50, "Promo code too long.").optional().or(z.literal('')),
  promoCodeConditionFieldsRequired: z.coerce.number().min(0).max(3).optional().default(0),
  targetUrl: z.string().url({ message: "Must be a valid URL if provided." }).optional().or(z.literal('')),
  displayRuleType: z.enum(displayRuleTypes).default("on_page_load"),
  displayRuleValue: z.coerce.number().min(0).optional().nullable(),
  displayFrequency: z.enum(displayFrequencies).default("once_per_session"),
  showCloseButton: z.boolean().default(true),
  isActive: z.boolean().default(true),
  targetPagesString: z.string().optional().or(z.literal('')),
});

export type PopupFormData = z.infer<typeof popupFormSchema>;

interface PopupFormProps {
  onSubmit: (data: Omit<FirestorePopup, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestorePopup | null;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

export default function PopupForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting: isParentSubmitting = false }: PopupFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(initialData?.imageUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(initialData?.imageUrl || null);
  
  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<PopupFormData>({
    resolver: zodResolver(popupFormSchema),
    defaultValues: {
        name: "", popupType: "newsletter_signup", title: "", displayText: "", imageUrl: "", imageHint: "", videoUrl: "",
        showEmailInput: false, showNameInput: false, showMobileInput: false,
        promoCode: "", promoCodeConditionFieldsRequired: 0,
        targetUrl: "", displayRuleType: "on_page_load",
        displayRuleValue: null, displayFrequency: "once_per_session", showCloseButton: true, isActive: true,
        targetPagesString: "",
    },
  });

  const watchedPopupType = form.watch("popupType");
  const watchedDisplayRuleType = form.watch("displayRuleType");
  const watchedPromoCode = form.watch("promoCode");

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || "",
        popupType: (initialData.popupType as any) || "newsletter_signup",
        title: initialData.title || "",
        displayText: initialData.displayText || "",
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        videoUrl: initialData.videoUrl || "",
        showEmailInput: initialData.showEmailInput ?? false,
        showNameInput: initialData.showNameInput ?? false,
        showMobileInput: initialData.showMobileInput ?? false,
        promoCode: initialData.promoCode || "",
        promoCodeConditionFieldsRequired: initialData.promoCodeConditionFieldsRequired ?? 0,
        targetUrl: initialData.targetUrl || "",
        displayRuleType: (initialData.displayRuleType as any) || "on_page_load",
        displayRuleValue: initialData.displayRuleValue === undefined ? null : initialData.displayRuleValue,
        displayFrequency: (initialData.displayFrequency as any) || "once_per_session",
        showCloseButton: initialData.showCloseButton ?? true,
        isActive: initialData.isActive ?? true,
        targetPagesString: initialData.targetPages?.join(', ') || "",
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    }
  }, [initialData, form]);

  useEffect(() => {
    if (!watchedPromoCode || watchedPromoCode.trim() === "") {
      form.setValue('promoCodeConditionFieldsRequired', 0);
    }
  }, [watchedPromoCode, form]);

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 2 * 1024 * 1024) { 
        toast({ title: "File Too Large", description: "Image must be < 2MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null); setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      setSelectedFile(file); setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('imageUrl', '', { shouldValidate: false });
    }
  };

  const handleRemoveImage = () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) URL.revokeObjectURL(currentImagePreview);
    setSelectedFile(null); setCurrentImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (formData: PopupFormData) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || "";

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image..."); setUploadProgress(0);
        if (originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
          try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); } catch (e) {}
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/popups/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);
        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => { const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100; setUploadProgress(p); setStatusMessage(`Uploading: ${Math.round(p)}%`); },
            (error) => reject(new Error(`Image upload failed: ${error.message}`)),
            async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (error: any) { reject(new Error(`Failed to get URL: ${error.message}`)); } }
          );
        });
        setUploadProgress(100); setStatusMessage("Image uploaded. Saving...");
      } else if (!formData.imageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
        setStatusMessage("Removing image...");
        try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); finalImageUrl = ""; setStatusMessage("Image removed. Saving..."); }
        catch (error: any) { throw new Error(`Failed to delete previous image: ${error.message}`); }
      }

      const targetPages = formData.targetPagesString ? formData.targetPagesString.split(',').map(p => p.trim()).filter(p => p !== "") : [];

      const payload: Omit<FirestorePopup, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } = { 
        name: formData.name,
        popupType: formData.popupType as PopupType,
        title: formData.title || "",
        displayText: formData.displayText || "",
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint || "",
        videoUrl: formData.videoUrl || "",
        showEmailInput: formData.showEmailInput,
        showNameInput: formData.showNameInput,
        showMobileInput: formData.showMobileInput,
        promoCode: formData.promoCode || "",
        promoCodeConditionFieldsRequired: formData.promoCode?.trim() ? (formData.promoCodeConditionFieldsRequired ?? 0) : 0,
        targetUrl: formData.targetUrl || "",
        displayRuleType: formData.displayRuleType as PopupDisplayRuleType,
        displayRuleValue: formData.displayRuleValue === undefined || formData.displayRuleValue === null ? null : formData.displayRuleValue,
        displayFrequency: formData.displayFrequency as PopupDisplayFrequency,
        showCloseButton: formData.showCloseButton,
        isActive: formData.isActive,
        targetPages: targetPages,
        id: initialData?.id,
      };
      await onSubmitProp(payload);
      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save popup.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false); setStatusMessage(""); setUploadProgress(null);
    }
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;
  const showDisplayRuleValue = watchedDisplayRuleType === 'after_x_seconds' || watchedDisplayRuleType === 'on_scroll_percentage';
  const isFormTypePopup = watchedPopupType === 'newsletter_signup' || watchedPopupType === 'lead_capture' || watchedPopupType === 'subscribe';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-4 p-6 overflow-y-auto">
        <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Internal Popup Name *</FormLabel><FormControl><Input placeholder="e.g., Summer Sale Banner" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>For admin identification only.</FormDescription><FormMessage /></FormItem>)} />
        
        <FormField control={form.control} name="targetPagesString" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary"/> Target Pages</FormLabel>
            <FormControl><Input placeholder="e.g., /, /blog, /categories" {...field} disabled={effectiveIsSubmitting} /></FormControl>
            <FormDescription>Comma-separated paths. Use <code>/</code> for home, <code>*</code> for all pages.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="popupType" render={({ field }) => (
          <FormItem>
            <FormLabel>Popup Type *</FormLabel>
            <Select key={`type-${field.value}`} onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting}>
              <FormControl><SelectTrigger><SelectValue placeholder="Select popup type" /></SelectTrigger></FormControl>
              <SelectContent>{popupTypes.map(type => (<SelectItem key={type} value={type}>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        
        <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>Popup Title (Optional)</FormLabel><FormControl><Input placeholder="e.g., Special Offer!" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name="displayText" render={({ field }) => (<FormItem><FormLabel>Display Text / Message (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Get 20% off your first order..." {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />

        {watchedPopupType === 'video' ? (
            <FormField control={form.control} name="videoUrl" render={({ field }) => (<FormItem><FormLabel>Video URL (Optional)</FormLabel><FormControl><Input placeholder="https://example.com/video.mp4" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />
        ) : (
          <>
            <FormItem>
              <FormLabel>Image (Optional)</FormLabel>
              {displayPreviewUrl ? (<div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10"><NextImage src={displayPreviewUrl} alt="Current popup image" fill className="object-contain" data-ai-hint={form.watch('imageHint') || "advertisement banner"} unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/></div>) : (<div className="my-2 flex items-center justify-center w-full h-40 rounded-md border border-dashed bg-muted/10"><ImageIconLucide className="h-10 w-10 text-muted-foreground" /></div>)}
              <FormControl><Input type="file" accept="image/*" onChange={handleFileSelected} disabled={effectiveIsSubmitting} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"/></FormControl>
              {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)}
            </FormItem>
            <FormField control={form.control} name="imageUrl" render={({ field }) => (<FormItem><FormLabel>Or Enter Image URL</FormLabel><div className="flex items-center gap-2"><FormControl className="flex-grow"><Textarea placeholder="https://example.com/image.png" {...field} disabled={effectiveIsSubmitting || !!selectedFile} rows={2} onChange={(e) => { field.onChange(e); if (!selectedFile) setCurrentImagePreview(e.target.value || null); }}/></FormControl>{(field.value || selectedFile || currentImagePreview) && (<Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} className="sm:ml-auto mt-2 sm:mt-0"><Trash2 className="h-4 w-4 text-destructive"/></Button>)}</div><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image AI Hint</FormLabel><FormControl><Input placeholder="e.g., happy customer sale" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
          </>
        )}
        
        {isFormTypePopup && (
            <div className="space-y-3 pt-2 border-t">
                <FormLabel className="text-base font-medium">Input Fields to Show</FormLabel>
                <FormField control={form.control} name="showNameInput" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel className="flex items-center"><User className="mr-2 h-4 w-4 text-muted-foreground"/>Enable Name Input</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="showEmailInput" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Enable Email Input</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="showMobileInput" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Enable Mobile Input</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)} />
            </div>
        )}
        
        <div className="space-y-3 pt-2 border-t">
            <FormLabel className="text-base font-medium">Promo Code Display</FormLabel>
            <FormField control={form.control} name="promoCode" render={({ field }) => (<FormItem><FormLabel>Promo Code to Display (Optional)</FormLabel><FormControl><Input placeholder="e.g., SAVE20" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />
            {watchedPromoCode && watchedPromoCode.trim() !== "" && (
                <FormField control={form.control} name="promoCodeConditionFieldsRequired" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Show Promo After User Fills:</FormLabel>
                        <Select key={`fields-req-${field.value}`} onValueChange={(value) => field.onChange(parseInt(value))} value={String(field.value ?? 0)} disabled={effectiveIsSubmitting}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="0">0 fields (Show immediately)</SelectItem>
                                <SelectItem value="1">At least 1 enabled field</SelectItem>
                                <SelectItem value="2">At least 2 enabled fields</SelectItem>
                                <SelectItem value="3">All 3 enabled fields</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
            )}
        </div>

        <FormField control={form.control} name="targetUrl" render={({ field }) => (<FormItem><FormLabel>Target URL (Optional)</FormLabel><FormControl><Input type="url" placeholder="https://example.com/target-page" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-md font-semibold text-muted-foreground">Display Rules</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="displayRuleType" render={({ field }) => (
              <FormItem>
                <FormLabel>Show Popup</FormLabel>
                <Select key={`rule-${field.value}`} onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select display rule" /></SelectTrigger></FormControl>
                  <SelectContent>{displayRuleTypes.map(type => (<SelectItem key={type} value={type}>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>))}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            {showDisplayRuleValue && (
              <FormField control={form.control} name="displayRuleValue" render={({ field }) => (<FormItem><FormLabel>{watchedDisplayRuleType === "after_x_seconds" ? "Seconds" : "Scroll %"}</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />
            )}
          </div>
          <FormField control={form.control} name="displayFrequency" render={({ field }) => (
            <FormItem>
              <FormLabel>Display Frequency</FormLabel>
              <Select key={`freq-${field.value}`} onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger></FormControl>
                <SelectContent>{displayFrequencies.map(type => (<SelectItem key={type} value={type}>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>))}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        
        <FormField control={form.control} name="showCloseButton" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Show Close Button</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)} />
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Enable Popup</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)} />

        <div className="flex justify-end space-x-3 pt-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
          <Button type="submit" disabled={effectiveIsSubmitting}>
            {effectiveIsSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {statusMessage || (initialData ? 'Save Changes' : 'Create Popup')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
