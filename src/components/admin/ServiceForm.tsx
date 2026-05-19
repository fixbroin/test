
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import type { FirestoreService, FirestoreSubCategory, FirestoreTax, FirestoreCategory, ServiceFaqItem, PriceVariant } from '@/types/firestore';
import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, Image as ImageIcon, Trash2, PlusCircle, Percent, Clock, HelpCircle, Sparkles, Wand2, Users, ShoppingBag, ListOrdered, Edit2, Lock, Star, MessageSquare } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { nanoid } from 'nanoid';
import { generateServiceDetails } from '@/ai/flows/generateServiceDetailsFlow';

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const serviceFaqItemSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(5, "Question must be at least 5 characters.").max(250, "Question too long."),
  answer: z.string().min(10, "Answer must be at least 10 characters.").max(2000, "Answer too long."),
});

const priceVariantSchema = z.object({
  id: z.string(),
  fromQuantity: z.coerce.number().min(1, "From quantity must be at least 1."),
  toQuantity: z.coerce.number().min(1, "To quantity must be at least 1.").optional().nullable(),
  price: z.coerce.number().min(0, "Price must be non-negative."),
}).refine(data => data.toQuantity === null || data.toQuantity === undefined || data.toQuantity >= data.fromQuantity, {
  message: "To quantity must be greater than or equal to From quantity.",
  path: ["toQuantity"],
});

const serviceFormSchema = z.object({
  name: z.string().min(3, { message: "Service name must be at least 3 characters." }),
  slug: z.string().min(3, "Slug must be at least 3 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-service-name).").optional().or(z.literal('')),
  parentCategoryId: z.string({ required_error: "Please select a parent category." }),
  subCategoryId: z.string({ required_error: "Please select a sub-category." }),
  price: z.coerce.number().positive({ message: "Price must be a positive number." }),
  discountedPrice: z.coerce.number().nonnegative({ message: "Discounted price must be non-negative." }).optional().nullable(),
  hasPriceVariants: z.boolean().default(false),
  priceVariants: z.array(priceVariantSchema).optional(),
  description: z.string().min(10, { message: "Description must be at least 10 characters." }).max(200, { message: "Description must be 200 characters or less."}),
  shortDescription: z.string().max(300, {message: "Short description max 300 chars."}).optional().nullable(),
  fullDescription: z.string().optional().nullable(),
  serviceHighlights: z.array(z.object({ value: z.string().min(5, "Highlight must be at least 5 characters.").max(150, "Highlight too long.") })).optional(),
  imageUrl: z.string().url({ message: "Must be a valid URL if provided." }).optional().or(z.literal('')),
  imageHint: z.string().max(50, { message: "Image hint should be max 50 characters."}).optional().or(z.literal('')),
  rating: z.coerce.number().min(0).max(5).default(0),
  reviewCount: z.coerce.number().min(0).default(0),
  hasMinQuantity: z.boolean().default(false),
  minQuantity: z.coerce.number().min(1, "Min quantity must be at least 1.").optional().nullable(),
  maxQuantity: z.coerce.number().min(0, "Max quantity must be non-negative.").optional().nullable(),
  order: z.coerce.number().min(0, { message: "Order must be a non-negative number." }).default(0),
  isActive: z.boolean().default(true),
  taxId: z.string().nullable().optional(),
  isTaxInclusive: z.enum(["true", "false"], { required_error: "Please select tax type."}).default("false"),
  h1_title: z.string().optional().or(z.literal('')),
  seo_title: z.string().optional().or(z.literal('')),
  seo_description: z.string().optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
  taskTimeValue: z.coerce.number().nonnegative("Task time must be non-negative.").optional().nullable(),
  taskTimeUnit: z.enum(['hours', 'minutes']).optional().nullable(),
  includedItems: z.array(z.object({ value: z.string().min(3, "Included item must be at least 3 characters.").max(200, "Included item too long.") })).optional(),
  excludedItems: z.array(z.object({ value: z.string().min(3, "Excluded item must be at least 3 characters.").max(200, "Excluded item too long.") })).optional(),
  allowPayLater: z.boolean().default(true),
  serviceFaqs: z.array(serviceFaqItemSchema).optional(),
  membersRequired: z.coerce.number().int().min(1, "At least 1 member is required.").optional().nullable(),
}).refine(data => {
    if (data.taskTimeValue && !data.taskTimeUnit) return false;
    if (!data.taskTimeValue && data.taskTimeUnit) return false;
    return true;
  }, {
    message: "Both task time value and unit must be provided together, or neither.",
    path: ["taskTimeUnit"],
  });

type ServiceFormDataInternal = z.infer<typeof serviceFormSchema>;

interface ServiceFormProps {
  onSubmit: (data: Omit<FirestoreService, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreService | null;
  onCancel: () => void;
  parentCategories: FirestoreCategory[];
  subCategories: FirestoreSubCategory[];
  taxes: FirestoreTax[];
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

const NO_TAX_VALUE = "__NO_TAX__";

export default function ServiceForm({ onSubmit: onSubmitProp, initialData, onCancel, parentCategories, subCategories, taxes, isSubmitting: isParentSubmitting = false }: ServiceFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);

  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [isGeneratingAiContent, setIsGeneratingAiContent] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [filteredSubCategories, setFilteredSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [isSlugEditable, setIsSlugEditable] = useState(false);

  const form = useForm<ServiceFormDataInternal>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "", slug: "", parentCategoryId: undefined, subCategoryId: undefined, price: 0, discountedPrice: undefined,
      hasPriceVariants: false, priceVariants: [],
      description: "", shortDescription: "", fullDescription: "", serviceHighlights: [],
      imageUrl: "", imageHint: "", rating: 0, reviewCount: 0, 
      hasMinQuantity: false, minQuantity: 2, maxQuantity: null, order: 0, isActive: true,
      taxId: null, isTaxInclusive: "false",
      h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      taskTimeValue: null, taskTimeUnit: null, includedItems: [], excludedItems: [], allowPayLater: true, serviceFaqs: [],
      membersRequired: null,
    },
  });

  const { fields: highlightFields, append: appendHighlight, remove: removeHighlight, replace: replaceHighlights } = useFieldArray({ control: form.control, name: "serviceHighlights" });
  const { fields: includedFields, append: appendIncluded, remove: removeIncluded, replace: replaceIncluded } = useFieldArray({ control: form.control, name: "includedItems" });
  const { fields: excludedFields, append: appendExcluded, remove: removeExcluded, replace: replaceExcluded } = useFieldArray({ control: form.control, name: "excludedItems" });
  const { fields: faqFields, append: appendFaq, remove: removeFaq, replace: replaceFaqs } = useFieldArray({ control: form.control, name: "serviceFaqs" });
  const { fields: priceVariantFields, append: appendPriceVariant, remove: removePriceVariant } = useFieldArray({ control: form.control, name: "priceVariants" });

  const watchedName = form.watch("name");
  const watchedImageHint = form.watch("imageHint");
  const watchedParentCategoryId = form.watch("parentCategoryId");
  const watchedTaxId = form.watch("taxId");
  const watchedHasPriceVariants = form.watch("hasPriceVariants");
  const watchedSlug = form.watch("slug");
  const taxSelected = watchedTaxId !== null && watchedTaxId !== NO_TAX_VALUE;

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "adminServices"),
        where("slug", "==", uniqueSlug),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        isUnique = true;
      } else {
        const doc = querySnapshot.docs[0];
        if (currentId && doc.id === currentId) {
          isUnique = true;
        } else {
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    }
    return uniqueSlug;
  }, []);

  useEffect(() => {
    if (initialData) {
      const initialSubCategory = subCategories.find(sc => sc.id === initialData.subCategoryId);
      const initialParentCategoryId = initialSubCategory?.parentId;

      if (initialParentCategoryId) {
        setFilteredSubCategories(subCategories.filter(sc => sc.parentId === initialParentCategoryId));
      } else {
        setFilteredSubCategories([]);
      }

      form.reset({
        ...initialData,
        parentCategoryId: initialParentCategoryId || "",
        subCategoryId: initialData.subCategoryId || "",
        discountedPrice: initialData.discountedPrice === undefined || initialData.discountedPrice === null ? null : initialData.discountedPrice,
        hasPriceVariants: initialData.hasPriceVariants || false,
        priceVariants: initialData.priceVariants?.map(v => ({...v, id: v.id || nanoid()})) || [],
        description: initialData.description || "",
        shortDescription: initialData.shortDescription || "",
        fullDescription: initialData.fullDescription || "",
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        rating: initialData.rating || 0,
        reviewCount: initialData.reviewCount || 0,
        hasMinQuantity: initialData.hasMinQuantity || false,
        minQuantity: initialData.minQuantity === undefined ? 2 : initialData.minQuantity,
        maxQuantity: initialData.maxQuantity === undefined ? null : initialData.maxQuantity,
        order: initialData.order || 0,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        taxId: initialData.taxId || null,
        isTaxInclusive: initialData.isTaxInclusive === true ? "true" : "false",
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
        taskTimeValue: initialData.taskTimeValue === undefined ? null : initialData.taskTimeValue,
        taskTimeUnit: initialData.taskTimeUnit === undefined ? null : initialData.taskTimeUnit,
        serviceHighlights: initialData.serviceHighlights?.map(val => ({ value: val })) || [],
        includedItems: initialData.includedItems?.map(val => ({ value: val })) || [],
        excludedItems: initialData.excludedItems?.map(val => ({ value: val })) || [],
        allowPayLater: initialData.allowPayLater === undefined ? true : initialData.allowPayLater,
        serviceFaqs: initialData.serviceFaqs?.map(faq => ({ ...faq, id: faq.id || nanoid() })) || [],
        membersRequired: initialData.membersRequired === undefined ? null : initialData.membersRequired,
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({
        name: "", slug: "", parentCategoryId: undefined, subCategoryId: undefined, price: 0, discountedPrice: null,
        hasPriceVariants: false, priceVariants: [],
        description: "", shortDescription: "", fullDescription: "", serviceHighlights: [],
        imageUrl: "", imageHint: "", rating: 0, reviewCount: 0, 
        hasMinQuantity: false, minQuantity: 2, maxQuantity: null, isActive: true,
        taxId: null, isTaxInclusive: "false",
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
        taskTimeValue: null, taskTimeUnit: null, includedItems: [], excludedItems: [], allowPayLater: true, serviceFaqs: [],
        membersRequired: null,
      });
      setFilteredSubCategories([]);
      setCurrentImagePreview(null);
      setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null);
    setUploadProgress(null);
    setIsFormBusyForImage(false);
    setStatusMessage("");
    setIsSlugEditable(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialData, form, subCategories]);

  useEffect(() => {
    if (watchedName && !isSlugEditable) {
      const delayDebounceFn = setTimeout(async () => {
        const baseSlug = generateSlug(watchedName);
        const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
        form.setValue('slug', uniqueSlug, { shouldValidate: true });
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [watchedName, isSlugEditable, initialData, form, checkSlugUniqueness]);

  // Handle manual slug changes to ensure uniqueness if needed
  useEffect(() => {
    if (isSlugEditable && watchedSlug && form.getFieldState('slug').isDirty) {
        const delayDebounceFn = setTimeout(async () => {
            const baseSlug = generateSlug(watchedSlug);
            if (baseSlug !== watchedSlug) {
                form.setValue('slug', baseSlug, { shouldValidate: true });
            }
            const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
            if (uniqueSlug !== baseSlug) {
                form.setValue('slug', uniqueSlug, { shouldValidate: true });
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }
  }, [watchedSlug, isSlugEditable, initialData, form, checkSlugUniqueness]);

  useEffect(() => {
    const currentParentId = form.getValues('parentCategoryId');
    if (currentParentId) {
      const newFiltered = subCategories.filter(sc => sc.parentId === currentParentId);
      setFilteredSubCategories(newFiltered);

      const currentSubCatId = form.getValues('subCategoryId');
      if (currentSubCatId && !newFiltered.find(sc => sc.id === currentSubCatId)) {
        if (!initialData || initialData.subCategoryId !== currentSubCatId ||
            (initialData && initialData.subCategoryId === currentSubCatId && subCategories.find(sc => sc.id === currentSubCatId)?.parentId !== currentParentId )) {
             form.setValue('subCategoryId', "", { shouldValidate: true });
        }
      }
    } else {
      setFilteredSubCategories([]);
      if (!initialData) {
        form.setValue('subCategoryId', "", { shouldValidate: true });
      }
    }
  }, [watchedParentCategoryId, subCategories, form, initialData]);

  useEffect(() => {
    const currentTaxId = form.getValues('taxId');
    const isCurrentTaxValid = currentTaxId && currentTaxId !== NO_TAX_VALUE;
    if (!isCurrentTaxValid) {
      if (form.getValues("isTaxInclusive") === "true") {
        form.setValue("isTaxInclusive", "false", { shouldValidate: true });
      }
    }
  }, [watchedTaxId, form]);

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null);
        setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      setSelectedFile(file);
      setCurrentImagePreview(URL.createObjectURL(file));
      form.setValue('imageUrl', '', { shouldValidate: false });
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
  };

  const handleAiGenerate = async () => {
    setIsGeneratingAiContent(true);
    toast({ title: "Generating Content...", description: "Please wait while the AI creates the service details." });

    const serviceName = form.getValues('name');
    const subCategoryId = form.getValues('subCategoryId');
    const parentCategoryId = form.getValues('parentCategoryId');

    if (!serviceName || !subCategoryId || !parentCategoryId) {
      toast({
        title: "Information Needed",
        description: "Please enter a Service Name and select a Category/Sub-Category before generating AI content.",
        variant: "default",
        duration: 7000,
      });
      setIsGeneratingAiContent(false);
      return;
    }

    const subCategory = subCategories.find(sc => sc.id === subCategoryId);
    const parentCategory = parentCategories.find(pc => pc.id === parentCategoryId);

    try {
      const result = await generateServiceDetails({
        serviceName,
        subCategoryName: subCategory?.name || '',
        categoryName: parentCategory?.name || '',
      });

      if (result) {
        form.setValue('description', result.shortDescription, { shouldValidate: true });
        form.setValue('shortDescription', result.fullDescription, { shouldValidate: true });
        form.setValue('fullDescription', result.pleaseNote?.join('\n') || '', { shouldValidate: true });
        form.setValue('imageHint', result.imageHint, { shouldValidate: true });
        replaceHighlights(result.serviceHighlights.map(h => ({ value: h })) || []);
        replaceIncluded(result.includedItems.map(i => ({ value: i })) || []);
        replaceExcluded(result.excludedItems.map(e => ({ value: e })) || []);
        form.setValue('taskTimeValue', result.taskTime.value, { shouldValidate: true });
        form.setValue('taskTimeUnit', result.taskTime.unit, { shouldValidate: true });
        const faqsWithIds = result.serviceFaqs.map(faq => ({...faq, id: nanoid() }));
        replaceFaqs(faqsWithIds);
        form.setValue('h1_title', result.seo.h1_title, { shouldValidate: true });
        form.setValue('seo_title', result.seo.seo_title, { shouldValidate: true });
        form.setValue('seo_description', result.seo.seo_description, { shouldValidate: true });
        form.setValue('seo_keywords', result.seo.seo_keywords, { shouldValidate: true });
        form.setValue('rating', result.rating, { shouldValidate: true });
        form.setValue('reviewCount', result.reviewCount, { shouldValidate: true });

        toast({ title: "Content Generated", description: "AI content has been populated in the relevant fields.", className: "bg-green-100 text-green-700 border-green-300" });
      } else {
        throw new Error("AI returned an empty response.");
      }
    } catch (error) {
      console.error("AI Generation Error:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate AI content.", variant: "destructive" });
    } finally {
      setIsGeneratingAiContent(false);
    }
  };

  const handleSubmit = async (formData: ServiceFormDataInternal) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || "";

    const currentIsTaxInclusiveString = form.getValues('isTaxInclusive');
    const finalTaxIdValue = (formData.taxId && formData.taxId !== NO_TAX_VALUE) ? formData.taxId : null;
    const finalIsTaxInclusiveValue = finalTaxIdValue ? (currentIsTaxInclusiveString === "true") : false;

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image...");
        setUploadProgress(0);
        if (originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
          try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); }
          catch (error) { console.warn("Error deleting old image: ", error); }
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/services/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);
        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress); setStatusMessage(`Uploading: ${Math.round(progress)}%`);
            },
            (error) => { console.error("Upload error:", error); reject(new Error(`Upload failed: ${error.message}`)); },
            async () => {
              try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); }
              catch (error) { reject(new Error(`Download URL failed: ${(error as Error).message}`)); }
            }
          );
        });
        setUploadProgress(100); setStatusMessage("Image uploaded. Saving...");
      } else if (!formData.imageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
        setStatusMessage("Removing image...");
        try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); finalImageUrl = ""; setStatusMessage("Image removed. Saving..."); }
        catch (error: any) { throw new Error(`Failed to delete image: ${error.message}. Not saved.`); }
      } else { setStatusMessage(initialData ? "Saving changes..." : "Creating service..."); }
      
      const payload: Omit<FirestoreService, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        subCategoryId: formData.subCategoryId,
        price: formData.price,
        isTaxInclusive: finalIsTaxInclusiveValue,
        discountedPrice: formData.discountedPrice === null ? null : formData.discountedPrice,
        hasPriceVariants: formData.hasPriceVariants,
        priceVariants: formData.hasPriceVariants ? (formData.priceVariants?.map(v => ({...v, toQuantity: v.toQuantity === undefined ? null : v.toQuantity})) || []) : [],
        description: formData.description,
        shortDescription: formData.shortDescription === null ? null : formData.shortDescription,
        fullDescription: formData.fullDescription === null ? null : formData.fullDescription,
        serviceHighlights: formData.serviceHighlights?.map(h => h.value).filter(v => v.trim() !== "") || [],
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint,
        rating: formData.rating,
        reviewCount: formData.reviewCount,
        hasMinQuantity: formData.hasMinQuantity,
        minQuantity: (formData.hasMinQuantity && formData.minQuantity !== null) ? formData.minQuantity : null,
        maxQuantity: formData.maxQuantity === null ? null : formData.maxQuantity,
        order: formData.order,
        isActive: formData.isActive,
        taxId: finalTaxIdValue,
        h1_title: formData.h1_title,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
        seo_keywords: formData.seo_keywords,
        id: initialData?.id,
        taskTimeValue: formData.taskTimeValue === null ? null : formData.taskTimeValue,
        taskTimeUnit: formData.taskTimeUnit === null ? null : formData.taskTimeUnit,
        includedItems: formData.includedItems?.map(i => i.value).filter(v => v.trim() !== "") || [],
        excludedItems: formData.excludedItems?.map(e => e.value).filter(v => v.trim() !== "") || [],
        allowPayLater: formData.allowPayLater,
        serviceFaqs: formData.serviceFaqs?.map(faq => ({ question: faq.question, answer: faq.answer })) || [],
        membersRequired: formData.membersRequired === null ? null : formData.membersRequired,
      };

      await onSubmitProp(payload);
      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Error in service form submission:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save service.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false); setStatusMessage(""); setUploadProgress(null);
    }
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage || isGeneratingAiContent;

  return (
    <Form {...form} key={initialData ? `service-form-${initialData.id}` : 'new-service-form'}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-6 p-6 overflow-y-auto">
        <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Service Name</FormLabel><FormControl><Input placeholder="e.g., Premium AC Servicing" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        <div className="flex items-center justify-end">
            <Button type="button" size="sm" variant="outline" onClick={handleAiGenerate} disabled={effectiveIsSubmitting || !watchedName.trim() || !form.getValues('subCategoryId')}>
              {isGeneratingAiContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4"/>}
              Generate AI Content
            </Button>
        </div>
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Service Slug {initialData ? "(Editing might affect SEO)" : "(Auto-generated or custom)"}</FormLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSlugEditable(!isSlugEditable)}
                  className="h-8 px-2 text-xs"
                  disabled={effectiveIsSubmitting}
                >
                  {isSlugEditable ? (
                    <><Lock className="mr-1 h-3 w-3" /> Lock</>
                  ) : (
                    <><Edit2 className="mr-1 h-3 w-3" /> Edit Manually</>
                  )}
                </Button>
              </div>
              <FormControl>
                <Input
                  placeholder="e.g., premium-ac-servicing"
                  {...field}
                  onChange={(e) => field.onChange(generateSlug(e.target.value))}
                  disabled={effectiveIsSubmitting || !isSlugEditable}
                  className={!isSlugEditable ? "bg-muted/50 font-mono text-xs" : "font-mono text-xs"}
                />
              </FormControl>
              <FormDescription>
                {isSlugEditable 
                  ? "Lowercase, dash-separated. Uniqueness is automatically checked." 
                  : "Automatically generated and unique. Click 'Edit Manually' to customize."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="parentCategoryId" render={({ field }) => ( <FormItem> <FormLabel>Parent Category</FormLabel> <Select key={`parent-cat-select-${initialData?.id || 'new-service'}-${parentCategories.length}-${field.value}`} onValueChange={(value) => { field.onChange(value); }} value={field.value} disabled={effectiveIsSubmitting || parentCategories.length === 0}> <FormControl><SelectTrigger><SelectValue placeholder={parentCategories.length > 0 ? "Select a parent category" : "No parent categories"} /></SelectTrigger></FormControl> <SelectContent>{parentCategories.map(cat => (<SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>))}</SelectContent> </Select><FormMessage /> </FormItem> )}/>
          <FormField control={form.control} name="subCategoryId" render={({ field }) => ( <FormItem> <FormLabel>Sub-Category</FormLabel> <Select key={`subcat-select-${initialData?.id || 'new-service'}-${watchedParentCategoryId}-${filteredSubCategories.length}-${field.value}`} onValueChange={field.onChange} value={field.value} disabled={effectiveIsSubmitting || !watchedParentCategoryId || filteredSubCategories.length === 0}> <FormControl><SelectTrigger><SelectValue placeholder={!watchedParentCategoryId ? "Select parent category first" : (filteredSubCategories.length > 0 ? "Select a sub-category" : "No sub-categories for selected parent")} /></SelectTrigger></FormControl> <SelectContent>{filteredSubCategories.map(subCat => (<SelectItem key={subCat.id} value={subCat.id}>{subCat.name}</SelectItem>))}</SelectContent> </Select><FormMessage /> </FormItem> )}/>
        </div>
        
        <Separator />
        
        <FormField
          control={form.control}
          name="hasPriceVariants"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Enable Price Variation</FormLabel>
                <FormDescription>Define different prices for different quantities.</FormDescription>
              </div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl>
            </FormItem>
          )}
        />
        
        {watchedHasPriceVariants ? (
          <div className="space-y-3 p-4 border rounded-md">
            <h3 className="text-lg font-medium">Price Tiers</h3>
            {priceVariantFields.map((item, index) => (
              <div key={item.id} className="p-3 border rounded-md space-y-2 relative">
                 <div className="grid grid-cols-3 gap-2 items-end">
                    <FormField control={form.control} name={`priceVariants.${index}.fromQuantity`} render={({ field }) => (<FormItem><FormLabel className="text-xs">From Qty</FormLabel><FormControl><Input type="number" placeholder="1" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`priceVariants.${index}.toQuantity`} render={({ field }) => (<FormItem><FormLabel className="text-xs">To Qty (Opt.)</FormLabel><FormControl><Input type="number" placeholder="5" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`priceVariants.${index}.price`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Price (₹)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="100" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                 </div>
                <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-destructive" onClick={() => removePriceVariant(index)} disabled={effectiveIsSubmitting}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => appendPriceVariant({ id: nanoid(), fromQuantity: priceVariantFields.length > 0 ? (priceVariantFields[priceVariantFields.length - 1].toQuantity || 0) + 1 : 1, price: 0 })} disabled={effectiveIsSubmitting}><PlusCircle className="mr-2 h-4 w-4" />Add Tier</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="price" render={({ field }) => (<FormItem><FormLabel>Default Price (₹)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g., 1200" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="discountedPrice" render={({ field }) => (<FormItem><FormLabel>Default Discounted Price (₹) (Optional)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g., 999" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="taxId" render={({ field }) => ( <FormItem><FormLabel className="flex items-center"><Percent className="mr-2 h-4 w-4 text-muted-foreground" />Applicable Tax (Optional)</FormLabel> <Select key={`tax-id-select-${initialData?.id || 'new-service'}-${taxes.length}-${field.value}`} onValueChange={(value) => { const newTaxId = value === NO_TAX_VALUE ? null : value; field.onChange(newTaxId); if (newTaxId === null) { form.setValue('isTaxInclusive', "false", { shouldValidate: true });}}} value={field.value ?? NO_TAX_VALUE} disabled={effectiveIsSubmitting || taxes.length === 0}> <FormControl><SelectTrigger><SelectValue placeholder={taxes.length > 0 ? "Select a tax configuration" : "No active taxes"} /></SelectTrigger></FormControl> <SelectContent><SelectItem value={NO_TAX_VALUE}>No Tax</SelectItem>{taxes.map(tax => (<SelectItem key={tax.id} value={tax.id}>{tax.taxName} ({tax.taxPercent}%)</SelectItem>))}</SelectContent> </Select><FormMessage /> </FormItem> )}/>
          <FormField control={form.control} name="isTaxInclusive" render={({ field }) => { return ( <FormItem><FormLabel className={!taxSelected ? "text-muted-foreground" : ""}>Price Tax Type</FormLabel> <Select key={`is-tax-inclusive-select-${initialData?.id || 'new-service'}-${taxes.length}-${String(field.value)}`} onValueChange={field.onChange} value={field.value} disabled={!taxSelected || effectiveIsSubmitting}> <FormControl><SelectTrigger><SelectValue placeholder="Select tax type" /></SelectTrigger></FormControl> <SelectContent><SelectItem value={"false"}>Tax Exclusive (Price + Tax)</SelectItem><SelectItem value={"true"}>Tax Inclusive (Price includes Tax)</SelectItem></SelectContent> </Select>{!taxSelected && <FormDescription className="text-xs">Select a tax first to enable this option.</FormDescription>}<FormMessage /> </FormItem> ); }}/>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="hasMinQuantity"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background/50">
                <div className="space-y-0.5">
                  <FormLabel className="text-base flex items-center">
                    <ListOrdered className="mr-2 h-4 w-4 text-muted-foreground"/>
                    Enforce Min Quantity
                  </FormLabel>
                  <FormDescription>Set a minimum number of units for booking.</FormDescription>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl>
              </FormItem>
            )}
          />
          {form.watch("hasMinQuantity") && (
            <FormField
              control={form.control}
              name="minQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">Min Quantity Value</FormLabel>
                  <FormControl><Input type="number" placeholder="e.g., 2" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl>
                  <FormDescription className="text-xs">Automatically added to cart.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="membersRequired" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground"/>Members Required</FormLabel><FormControl><Input type="number" placeholder="e.g., 2" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormDescription className="text-xs">Technicians for this task.</FormDescription><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="maxQuantity" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><ShoppingBag className="mr-2 h-4 w-4 text-muted-foreground"/>Max Quantity</FormLabel><FormControl><Input type="number" placeholder="e.g., 5" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormDescription className="text-xs">Max bookable units per user.</FormDescription><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><ListOrdered className="mr-2 h-4 w-4 text-muted-foreground"/>Display Order</FormLabel><FormControl><Input type="number" placeholder="e.g., 0" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription className="text-xs">Lower numbers appear first.</FormDescription><FormMessage /></FormItem>)}/>
        </div>

       
        <Separator />
        <div>
            <FormLabel className="text-md font-semibold text-muted-foreground flex items-center"><Clock className="mr-2 h-4 w-4" />Task Performance Time (Optional)</FormLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <FormField control={form.control} name="taskTimeValue" render={({ field }) => (<FormItem><FormLabel>Time Value</FormLabel><FormControl><Input type="number" placeholder="e.g., 30 or 2" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="taskTimeUnit" render={({ field }) => ( <FormItem><FormLabel>Time Unit</FormLabel> <Select key={`task-unit-select-${initialData?.id || 'new-service'}-${String(field.value)}`} onValueChange={field.onChange} value={field.value === null ? undefined : field.value} disabled={effectiveIsSubmitting || !form.watch('taskTimeValue')}> <FormControl><SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger></FormControl> <SelectContent><SelectItem value="minutes">Minutes</SelectItem><SelectItem value="hours">Hours</SelectItem></SelectContent> </Select> {!form.watch('taskTimeValue') && <FormDescription className="text-xs">Enter a time value first.</FormDescription>} <FormMessage /> </FormItem> )}/>
            </div>
        </div>
        <Separator />
        <div>
            <FormLabel className="text-md font-semibold text-muted-foreground">Service Descriptions</FormLabel>
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem className="mt-2"><FormLabel>Short Description (for cards, max 200 chars)</FormLabel><FormControl><Textarea placeholder="Briefly describe the service" {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="shortDescription" render={({ field }) => (<FormItem className="mt-2"><FormLabel>Detailed Short Description (Optional, max 300 chars)</FormLabel><FormControl><Textarea placeholder="Slightly more detailed description for service page intro." {...field} value={field.value ?? ""} rows={3} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="fullDescription" render={({ field }) => (<FormItem className="mt-2"><FormLabel>Please Note (Optional)</FormLabel><FormControl><Textarea placeholder="Important notes and disclaimers for the customer..." {...field} value={field.value ?? ""} rows={5} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        </div>
        <Separator />
        <div>
            <FormLabel className="text-md font-semibold text-muted-foreground">What's Included (Optional)</FormLabel> <FormDescription className="mb-2 text-xs">List items or tasks included in this service.</FormDescription>
            {includedFields.map((item, index) => (<FormField key={item.id} control={form.control} name={`includedItems.${index}.value`} render={({ field: itemField }) => (<FormItem className="flex items-center gap-2 mb-2"><FormControl><Input placeholder={`Included item ${index + 1}`} {...itemField} disabled={effectiveIsSubmitting} /></FormControl><Button type="button" variant="ghost" size="icon" onClick={() => removeIncluded(index)} disabled={effectiveIsSubmitting}><Trash2 className="h-4 w-4 text-destructive" /></Button><FormMessage /></FormItem>)}/>))}
            <Button type="button" variant="outline" size="sm" onClick={() => appendIncluded({ value: "" })} disabled={effectiveIsSubmitting} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Included Item</Button>
        </div>
        <Separator />
        <div>
            <FormLabel className="text-md font-semibold text-muted-foreground">What's Not Included (Optional)</FormLabel> <FormDescription className="mb-2 text-xs">List items or tasks explicitly excluded from this service.</FormDescription>
            {excludedFields.map((item, index) => (<FormField key={item.id} control={form.control} name={`excludedItems.${index}.value`} render={({ field: itemField }) => (<FormItem className="flex items-center gap-2 mb-2"><FormControl><Input placeholder={`Excluded item ${index + 1}`} {...itemField} disabled={effectiveIsSubmitting} /></FormControl><Button type="button" variant="ghost" size="icon" onClick={() => removeExcluded(index)} disabled={effectiveIsSubmitting}><Trash2 className="h-4 w-4 text-destructive" /></Button><FormMessage /></FormItem>)}/>))}
            <Button type="button" variant="outline" size="sm" onClick={() => appendExcluded({ value: "" })} disabled={effectiveIsSubmitting} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Excluded Item</Button>
        </div>
        <Separator />
        <div>
          <FormLabel className="text-md font-semibold text-muted-foreground">Service Highlights (Optional)</FormLabel><FormDescription className="mb-2 text-xs">Key benefits or features. Max 150 chars each.</FormDescription>
          {highlightFields.map((item, index) => (<FormField key={item.id} control={form.control} name={`serviceHighlights.${index}.value`} render={({ field: itemField }) => (<FormItem className="flex items-center gap-2 mb-2"><FormControl><Input placeholder={`Highlight ${index + 1}`} {...itemField} disabled={effectiveIsSubmitting} /></FormControl><Button type="button" variant="ghost" size="icon" onClick={() => removeHighlight(index)} disabled={effectiveIsSubmitting}><Trash2 className="h-4 w-4 text-destructive" /></Button><FormMessage /></FormItem>)}/>))}
          <Button type="button" variant="outline" size="sm" onClick={() => appendHighlight({ value: "" })} disabled={effectiveIsSubmitting} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Add Highlight</Button>
        </div>
        <Separator />
        <div>
            <FormLabel className="text-md font-semibold text-muted-foreground flex items-center"><HelpCircle className="mr-2 h-4 w-4" />Service Specific FAQs (Optional)</FormLabel> <FormDescription className="mb-3 text-xs">Add frequently asked questions related to this specific service.</FormDescription>
            {faqFields.map((item, index) => ( <Card key={item.id} className="mb-3 p-3 relative"><FormField control={form.control} name={`serviceFaqs.${index}.question`} render={({ field }) => (<FormItem className="mb-2"><FormLabel className="text-xs">Question {index + 1}</FormLabel><FormControl><Input placeholder="e.g., How long does it take?" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} /> <FormField control={form.control} name={`serviceFaqs.${index}.answer`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Answer {index + 1}</FormLabel><FormControl><Textarea placeholder="e.g., Typically about 2 hours..." {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} /> <Button type="button" variant="ghost" size="icon" onClick={() => removeFaq(index)} disabled={effectiveIsSubmitting} className="absolute top-1 right-1 h-6 w-6"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button> </Card> ))}
            <Button type="button" variant="outline" size="sm" onClick={() => appendFaq({ id: nanoid(), question: "", answer: ""})} disabled={effectiveIsSubmitting} className="mt-1"><PlusCircle className="mr-2 h-4 w-4" /> Add FAQ</Button>
        </div>
        <Separator />
        <FormItem> <FormLabel>Service Main Image (Optional)</FormLabel> {displayPreviewUrl ? (<div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10"><NextImage src={displayPreviewUrl} alt="Current service image" fill className="object-contain" data-ai-hint={watchedImageHint || "service image preview"} unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/></div>) : (<div className="my-2 flex items-center justify-center w-full h-40 rounded-md border border-dashed bg-muted/10"><ImageIcon className="h-10 w-10 text-muted-foreground" /></div>)} <FormControl><Input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleFileSelected} disabled={effectiveIsSubmitting} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"/></FormControl> <FormDescription className="mt-1">Upload new image (PNG, JPG, GIF, WEBP, max 5MB).</FormDescription> {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)} </FormItem>
        <FormField control={form.control} name="imageUrl" render={({ field }) => (<FormItem><FormLabel>Image URL (Leave empty to remove image on save if one exists)</FormLabel><div className="flex flex-col sm:flex-row sm:items-center gap-2"><FormControl className="flex-grow"><Textarea placeholder="Auto-filled after upload, or manually enter a URL. Clear to remove existing image." {...field} disabled={effectiveIsSubmitting || selectedFile !== null} rows={3} onChange={(e) => { field.onChange(e); if (!selectedFile) { setCurrentImagePreview(e.target.value || null); }}}/></FormControl>{(field.value || selectedFile || currentImagePreview) && (<Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image selection or URL" className="sm:ml-auto mt-2 sm:mt-0"><Trash2 className="h-4 w-4 text-destructive"/></Button>)}</div><FormDescription>If file uploaded, URL ignored. Empty this and save to remove existing image.</FormDescription><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image AI Hint (Optional)</FormLabel><FormControl><Input placeholder="e.g., ac unit repair" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Keywords for AI. Max 50 chars.</FormDescription><FormMessage /></FormItem>)}/>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="rating" render={({ field }) => (<FormItem><FormLabel>Default Rating (0-5)</FormLabel><FormControl><Input type="number" step="0.1" placeholder="e.g., 4.5" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="reviewCount" render={({ field }) => (<FormItem><FormLabel>Default Review Count</FormLabel><FormControl><Input type="number" placeholder="e.g., 50" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        </div>
        <FormField control={form.control} name="allowPayLater" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50"><div className="space-y-0.5"><FormLabel>Allow "Pay After Service"</FormLabel><FormDescription>If enabled, this service can be booked with this option (if globally enabled).</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)}/>
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50"><div className="space-y-0.5"><FormLabel>Service Active</FormLabel><FormDescription>If unchecked, this service will not be shown publicly.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting}/></FormControl></FormItem>)}/>
        <Separator />
        <div className="space-y-4 pt-4 border-t">
            <h3 className="text-md font-semibold text-muted-foreground">SEO Settings (Optional)</h3>
            <p className="text-xs text-muted-foreground">Use placeholders like {"{{serviceName}}"} and {"{{categoryName}}"} for global patterns.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (<FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Expert AC Servicing" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (<FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., AC Servicing | Best AC Repair" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (<FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Get your AC serviced by professionals." {...field} value={field.value ?? ""} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (<FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., ac service, ac repair" {...field} value={field.value ?? ""} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        </div>

        <div className="p-6 border-t sticky bottom-0 bg-background flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
          <Button type="submit" disabled={effectiveIsSubmitting || (parentCategories.length === 0 && !initialData) || (filteredSubCategories.length === 0 && !form.getValues('subCategoryId') && !initialData) }>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Service')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
