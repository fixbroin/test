
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProviderApplication, ProviderControlOptions, BankDetails } from '@/types/firestore';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, Banknote, Camera, Image as ImageIcon, Trash2, Check, Lock, ChevronRight, AlertCircle, FileText } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState, useCallback } from "react";
import { Timestamp, doc, getDoc } from "firebase/firestore";
import { nanoid } from 'nanoid';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = 'fixbro_reg_step4';

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false
});

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const DEFAULT_MAP_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore

const createStep4Schema = (maxRadius: number) => z.object({
  workAreaCenter: z.object({
    lat: z.number({ required_error: "Please select a location on the map." }),
    lng: z.number({ required_error: "Please select a location on the map." }),
  }),
  workAreaRadiusKm: z.coerce.number().min(1, "Radius must be at least 1 km.").max(maxRadius, `Radius cannot exceed the maximum of ${maxRadius} km.`),
  bankName: z.string().min(2, "Bank name is required.").max(100),
  accountHolderName: z.string().min(2, "Account holder name is required.").max(100),
  accountNumber: z.string().min(5, "Account number seems too short.").max(25, "Account number too long."),
  confirmAccountNumber: z.string(),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format (e.g., SBIN0001234).").length(11, "IFSC code must be 11 characters."),
  cancelledChequeUrl: z.string().url("Invalid URL for cheque.").optional().nullable(),
  signatureUrl: z.string().url("Invalid URL for signature.").optional().nullable(),
  termsConfirmation: z.boolean().refine(value => value === true, {
    message: "You must agree to the terms and conditions.",
  }),
}).refine(data => data.accountNumber === data.confirmAccountNumber, {
  message: "Account numbers do not match.",
  path: ["confirmAccountNumber"],
});

type Step4FormData = z.infer<ReturnType<typeof createStep4Schema>>;

interface Step4LocationBankProps {
  onSubmit: (data: Partial<ProviderApplication>) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string;
}

export default function Step4LocationBank({
  onSubmit,
  onPrevious,
  initialData,
  isSaving,
  userUid,
}: Step4LocationBankProps) {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsContent, setTermsContent] = useState("");
  const [canAgreeTerms, setCanAgreeTerms] = useState(false);
  const termsScrollRef = useRef<HTMLDivElement>(null);

  const [currentChequePreview, setCurrentChequePreview] = useState<string | null>(initialData.bankDetails?.cancelledChequeUrl || null);
  const [selectedChequeFile, setSelectedChequeFile] = useState<File | null>(null);
  const chequeFileInputRef = useRef<HTMLInputElement>(null);
  const [chequeUploadProgress, setChequeUploadProgress] = useState<number | null>(null);
  const [chequeStatusMessage, setChequeStatusMessage] = useState("");
  const [isFormBusyForCheque, setIsFormBusyForCheque] = useState(false);

  const [currentSignaturePreview, setCurrentSignaturePreview] = useState<string | null>(initialData.signatureUrl || null);
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const signatureFileInputRef = useRef<HTMLInputElement>(null);
  const [signatureUploadProgress, setSignatureUploadProgress] = useState<number | null>(null);
  const [signatureStatusMessage, setSignatureStatusMessage] = useState("");
  const [isFormBusyForSignature, setIsFormBusyForSignature] = useState(false);

  const maxRadius = appConfig.maxProviderRadiusKm || 50;
  const step4Schema = createStep4Schema(maxRadius);
  
  const form = useForm<Step4FormData>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      workAreaCenter: initialData.workAreaCenter ? { lat: initialData.workAreaCenter.latitude, lng: initialData.workAreaCenter.longitude } : DEFAULT_MAP_CENTER,
      workAreaRadiusKm: initialData.workAreaRadiusKm || 5,
      bankName: initialData.bankDetails?.bankName || "",
      accountHolderName: initialData.bankDetails?.accountHolderName || "",
      accountNumber: initialData.bankDetails?.accountNumber || "",
      confirmAccountNumber: initialData.bankDetails?.accountNumber || "",
      ifscCode: initialData.bankDetails?.ifscCode || "",
      cancelledChequeUrl: initialData.bankDetails?.cancelledChequeUrl || null,
      signatureUrl: initialData.signatureUrl || null,
      termsConfirmation: initialData.termsConfirmedAt ? true : false,
    },
  });

  // Automated flow: Open map if location not set
  useEffect(() => {
    const hasSelectedLocation = initialData.workAreaCenter?.latitude && initialData.workAreaCenter?.longitude;
    const storageData = localStorage.getItem(STORAGE_KEY);
    if (!hasSelectedLocation && !storageData) {
      setIsMapModalOpen(true);
    }
  }, [initialData.workAreaCenter]);

  // Load terms content
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const docRef = doc(db, "providerControlOptions", "termsAndConditions");
        const snap = await getDoc(docRef);
        if (snap.exists()) setTermsContent(snap.data().content || "");
      } catch (e) {
        console.error("Error loading terms:", e);
      }
    };
    fetchTerms();
  }, []);

  // Restore from Local Storage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        form.reset({ ...initialData, ...data });
        if (data.cancelledChequeUrl) setCurrentChequePreview(data.cancelledChequeUrl);
        if (data.signatureUrl) setCurrentSignaturePreview(data.signatureUrl);
      } catch (e) {
        console.error("Error restoring Step 4 from storage:", e);
      }
    }
  }, [initialData, form]);

  // Auto-save to Local Storage
  useEffect(() => {
    const subscription = form.watch((value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    form.reset({
      workAreaCenter: initialData.workAreaCenter ? { lat: initialData.workAreaCenter.latitude, lng: initialData.workAreaCenter.longitude } : DEFAULT_MAP_CENTER,
      workAreaRadiusKm: initialData.workAreaRadiusKm || 5,
      bankName: initialData.bankDetails?.bankName || "",
      accountHolderName: initialData.bankDetails?.accountHolderName || "",
      accountNumber: initialData.bankDetails?.accountNumber || "",
      confirmAccountNumber: initialData.bankDetails?.accountNumber || "",
      ifscCode: initialData.bankDetails?.ifscCode || "",
      cancelledChequeUrl: initialData.bankDetails?.cancelledChequeUrl || null,
      signatureUrl: initialData.signatureUrl || null,
      termsConfirmation: initialData.termsConfirmedAt ? true : false,
    });
    setCurrentChequePreview(initialData.bankDetails?.cancelledChequeUrl || null);
    setSelectedChequeFile(null);
    if (chequeFileInputRef.current) chequeFileInputRef.current.value = "";
    
    setCurrentSignaturePreview(initialData.signatureUrl || null);
    setSelectedSignatureFile(null);
    if (signatureFileInputRef.current) signatureFileInputRef.current.value = "";
  }, [initialData, form]);

  const handleMapAddressSelect = (addressData: any) => {
    if (addressData.latitude && addressData.longitude) {
      form.setValue("workAreaCenter", { lat: addressData.latitude, lng: addressData.longitude });
      setIsMapModalOpen(false);
      setIsTermsModalOpen(true); 
    }
  };

  const handleScrollTerms = () => {
    const el = termsScrollRef.current;
    if (el) {
      const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 5;
      if (isAtBottom) setCanAgreeTerms(true);
    }
  };

  useEffect(() => {
    if (isTermsModalOpen && termsScrollRef.current) {
      const el = termsScrollRef.current;
      if (el.scrollHeight <= el.clientHeight) {
        setCanAgreeTerms(true);
      }
    }
  }, [isTermsModalOpen, termsContent]);

  const handleAgreeTerms = () => {
    form.setValue("termsConfirmation", true, { shouldValidate: true });
    setIsTermsModalOpen(false);
    toast({ title: "Consent Recorded", description: "You have agreed to the terms and conditions." });
  };

  const handleFileUpload = async (
    file: File,
    storageFolder: string,
    fileTypeLabel: string,
    existingUrl: string | null | undefined,
    setUploadProgressFn: React.Dispatch<React.SetStateAction<number | null>>,
    setStatusMessageFn: React.Dispatch<React.SetStateAction<string>>
  ): Promise<{ url: string; fileName: string } | null> => {
    setStatusMessageFn(`Uploading ${fileTypeLabel}...`);
    setUploadProgressFn(0);
    try {
      if (existingUrl && isFirebaseStorageUrl(existingUrl)) {
        try { await deleteObject(storageRefStandard(storage, existingUrl)); }
        catch (e) { console.warn(`Old ${fileTypeLabel} image not deleted:`, e); }
      }
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const randomString = generateRandomHexString(8);
      const autoFileName = `${fileTypeLabel.toLowerCase().replace(/\s+/g, '_')}_${randomString}.${extension}`;
      const imagePath = `provider_documents/${userUid}/${storageFolder}/${autoFileName}`;
      const imageRef = storageRefStandard(storage, imagePath);
      const uploadTask = uploadBytesResumable(imageRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => setUploadProgressFn((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          (error) => reject(error),
          async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); } }
        );
      });
      setStatusMessageFn(`${fileTypeLabel} uploaded.`);
      return { url: downloadURL, fileName: file.name };
    } catch (uploadError) {
      toast({ title: `${fileTypeLabel} Upload Failed`, description: (uploadError as Error).message || `Could not upload ${fileTypeLabel}.`, variant: "destructive" });
      setStatusMessageFn(""); setUploadProgressFn(null);
      throw uploadError;
    }
  };

  const handleSubmit = async (data: Step4FormData) => {
    if (!data.termsConfirmation) {
        form.setError("termsConfirmation", { type: "manual", message: "You must confirm the information." });
        return;
    }
    
    const errors: string[] = [];
    if (!selectedSignatureFile && !data.signatureUrl && !initialData.signatureUrl) {
        errors.push("Signature Image");
    }

    if (errors.length > 0) {
        setValidationErrors(errors);
        toast({ title: "Missing Required Fields", description: "Please upload required documents", variant: "destructive" });
        return;
    }

    setValidationErrors([]);
    setIsFormBusyForCheque(!!selectedChequeFile);
    setIsFormBusyForSignature(!!selectedSignatureFile);

    let finalChequeUrl = data.cancelledChequeUrl || null;
    let finalChequeFileName = initialData.bankDetails?.cancelledChequeFileName || null;

    let finalSignatureUrl = data.signatureUrl || null;
    let finalSignatureFileName = initialData.signatureFileName || null;

    try {
      if (selectedChequeFile) {
        const chequeUploadResult = await handleFileUpload(selectedChequeFile, 'bank', 'Cancelled Cheque', initialData.bankDetails?.cancelledChequeUrl, setChequeUploadProgress, setChequeStatusMessage);
        finalChequeUrl = chequeUploadResult?.url || null;
        finalChequeFileName = chequeUploadResult?.fileName || null;
      }

      if (selectedSignatureFile) {
        const signatureUploadResult = await handleFileUpload(selectedSignatureFile, 'signature', 'Signature', initialData.signatureUrl, setSignatureUploadProgress, setSignatureStatusMessage);
        finalSignatureUrl = signatureUploadResult?.url || null;
        finalSignatureFileName = signatureUploadResult?.fileName || null;
      }
      
      if (!finalSignatureUrl && !initialData.signatureUrl) { 
        toast({ title: "Signature Required", description: "Please upload your signature image to proceed.", variant: "destructive" });
        setIsFormBusyForCheque(false); setIsFormBusyForSignature(false);
        return;
      }

      const bankDetailsData: BankDetails = {
        bankName: data.bankName,
        accountHolderName: data.accountHolderName,
        accountNumber: data.accountNumber,
        ifscCode: data.ifscCode.toUpperCase(),
        cancelledChequeUrl: finalChequeUrl || undefined,
        cancelledChequeFileName: finalChequeFileName || undefined,
        verified: initialData.bankDetails?.verified || false,
      };
      
      const applicationStepData: Partial<ProviderApplication> = {
        workAreaCenter: {
          latitude: data.workAreaCenter.lat,
          longitude: data.workAreaCenter.lng,
        },
        workAreaRadiusKm: data.workAreaRadiusKm,
        bankDetails: bankDetailsData,
        termsConfirmedAt: data.termsConfirmation ? Timestamp.now() : undefined,
        signatureUrl: finalSignatureUrl || initialData.signatureUrl,
        signatureFileName: finalSignatureFileName || initialData.signatureFileName,
      };
      onSubmit(applicationStepData);

    } catch (error) {
      console.error("Error in Step 4 submission:", error);
    } finally {
      setIsFormBusyForCheque(false);
      setIsFormBusyForSignature(false);
      setChequeStatusMessage(""); setSignatureStatusMessage("");
      setChequeUploadProgress(null); setSignatureUploadProgress(null);
    }
  };

  const displayChequePreviewUrl = isValidImageSrc(currentChequePreview) ? currentChequePreview : null;
  const displaySignaturePreviewUrl = isValidImageSrc(currentSignaturePreview) ? currentSignaturePreview : null;
  const effectiveIsSaving = isSaving || isFormBusyForCheque || isFormBusyForSignature;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <CardContent className="space-y-6">
          <Card className="p-4 border bg-muted/10 shadow-sm">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg flex items-center"><MapPin className="mr-2 h-5 w-5 text-primary"/>Work Area</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-3">
              <Button type="button" variant="outline" className="w-full h-11 justify-between px-4" onClick={() => setIsMapModalOpen(true)}>
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary"/> Update Service Location</span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </Button>
              <FormField control={form.control} name="workAreaRadiusKm" render={({ field }) => (<FormItem><FormLabel>Service Radius (in kilometers)</FormLabel><FormControl><Input type="number" step="1" placeholder="e.g., 10" {...field} disabled={effectiveIsSaving} /></FormControl><FormDescription className="text-[10px]">Max allowed: {maxRadius} km.</FormDescription><FormMessage /></FormItem>)}/>
            </CardContent>
          </Card>

          <Card className="p-4 border shadow-sm">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg flex items-center"><Banknote className="mr-2 h-5 w-5 text-primary"/>Bank Account Details</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              <FormField control={form.control} name="accountHolderName" render={({ field }) => (<FormItem><FormLabel>Account Holder Name *</FormLabel><FormControl><Input placeholder="As per bank records" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="bankName" render={({ field }) => (<FormItem><FormLabel>Bank Name *</FormLabel><FormControl><Input placeholder="e.g., State Bank of India" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="accountNumber" render={({ field }) => (<FormItem><FormLabel>Account Number *</FormLabel><FormControl><Input placeholder="Enter bank account number" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="confirmAccountNumber" render={({ field }) => (<FormItem><FormLabel>Confirm Account Number *</FormLabel><FormControl><Input placeholder="Re-enter account number" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              </div>
              <FormField control={form.control} name="ifscCode" render={({ field }) => (<FormItem><FormLabel>IFSC Code *</FormLabel><FormControl><Input placeholder="e.g., SBIN0001234" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormItem>
                <FormLabel className="flex items-center"><Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Upload Cancelled Cheque (Optional)</FormLabel>
                <div 
                  onClick={() => !effectiveIsSaving && chequeFileInputRef.current?.click()}
                  className="relative aspect-video rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 bg-muted/30 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all shadow-sm"
                >
                  {displayChequePreviewUrl ? (
                    <>
                      <NextImage src={displayChequePreviewUrl} alt="Cheque preview" fill className="object-contain p-1" unoptimized={displayChequePreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/>
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="h-8 w-8 text-white" /></div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-muted-foreground" />
                      <span className="text-[10px] font-bold text-muted-foreground">CLICK TO UPLOAD</span>
                    </div>
                  )}
                  {chequeUploadProgress !== null && selectedChequeFile && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
                      <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                      <Progress value={chequeUploadProgress} className="h-1.5 w-full bg-white/20" />
                    </div>
                  )}
                </div>
                <FormControl><Input type="file" accept="image/png, image/jpeg, image/webp" onChange={(e) => { if (e.target.files?.[0]) { const file = e.target.files[0]; if (file.size > 15 * 1024 * 1024) { toast({ title: "File Too Large", description: "Image must be < 15MB.", variant: "destructive" }); e.target.value = ""; return; } setSelectedChequeFile(file); setCurrentChequePreview(URL.createObjectURL(file)); form.setValue('cancelledChequeUrl', null, { shouldValidate: false }); } }} ref={chequeFileInputRef} className="hidden" disabled={effectiveIsSaving}/></FormControl>
                <FormDescription className="text-[10px]">Clear image of a cancelled cheque. Max 15MB.</FormDescription>
                {(displayChequePreviewUrl || selectedChequeFile) && (<Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedChequeFile(null); setCurrentChequePreview(null); form.setValue('cancelledChequeUrl', null); }} disabled={effectiveIsSaving} className="text-xs mt-1 text-destructive"><Trash2 className="h-3 w-3 mr-1 text-destructive"/>Remove Image</Button>)}
              </FormItem>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {validationErrors.includes("Signature Image") && (
              <div className="flex justify-center">
                <span className="text-[10px] bg-destructive text-white px-2 py-0.5 rounded animate-pulse">REQUIRED</span>
              </div>
            )}
            
            <div 
              onClick={() => !effectiveIsSaving && signatureFileInputRef.current?.click()}
              className={cn(
                "relative aspect-[3/1] max-h-32 w-full max-w-sm rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-sm mx-auto",
                validationErrors.includes("Signature Image") ? "border-destructive bg-destructive/5" : "border-muted-foreground/25 hover:border-primary/50 bg-background",
                !displaySignaturePreviewUrl && !selectedSignatureFile && "animate-pulse"
              )}
            >
              {displaySignaturePreviewUrl ? (
                <>
                  <NextImage src={displaySignaturePreviewUrl} alt="Signature preview" fill className="object-contain p-1" unoptimized={displaySignaturePreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/>
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="h-8 w-8 text-white" /></div>
                </>
              ) : (
               <div className="flex flex-col items-center gap-2">
                  <Camera className={cn("h-10 w-10", validationErrors.includes("Signature Image") ? "text-destructive" : "text-muted-foreground")} />
                  {validationErrors.includes("Signature Image") && <AlertCircle className="h-5 w-5 text-destructive animate-bounce" />}
                  <span className="text-[10px] font-bold text-muted-foreground">CLICK TO UPLOAD</span>
                </div>
              )}
              {signatureUploadProgress !== null && selectedSignatureFile && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
                  <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                  <Progress value={signatureUploadProgress} className="h-1.5 w-full bg-white/20" />
                </div>
              )}
            </div>
            <FormControl>
                <input 
                    type="file" 
                    accept="image/png, image/jpeg" 
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) { const file = e.target.files[0]; if (file.size > 15 * 1024 * 1024) { toast({ title: "File Too Large", description: "Image must be < 15MB.", variant: "destructive" }); return; } setSelectedSignatureFile(file); setCurrentSignaturePreview(URL.createObjectURL(file)); form.setValue('signatureUrl', null, { shouldValidate: false }); } }}
                    ref={signatureFileInputRef} 
                    disabled={effectiveIsSaving}
                />
            </FormControl>
            <FormDescription className="text-center text-[10px]">Clear image of your signature. Max 15MB.</FormDescription>
            {currentSignaturePreview && <div className="flex justify-center"><Button type="button" variant="ghost" size="sm" className="h-8 text-[10px] text-destructive" onClick={() => { setSelectedSignatureFile(null); setCurrentSignaturePreview(null); form.setValue('signatureUrl', null); }} disabled={effectiveIsSaving}><Trash2 className="h-3 w-3 mr-1" /> Remove Signature</Button></div>}
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <FormLabel className="text-sm font-semibold">Terms & Conditions Confirmation</FormLabel>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsTermsModalOpen(true)} className="h-8 text-xs">
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> Read Terms Again
                </Button>
            </div>
            
            <FormField
                control={form.control}
                name="termsConfirmation"
                render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-primary/5 border-primary/20">
                    <FormControl>
                    <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={effectiveIsSaving}
                        id="termsConfirmationStep4"
                    />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                    <FormLabel htmlFor="termsConfirmationStep4" className="cursor-pointer text-sm font-semibold text-primary">
                        I confirm that all the information provided above is true and accurate to the best of my knowledge.
                    </FormLabel>
                    <FormMessage />
                    </div>
                </FormItem>
                )}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6 bg-muted/5">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={effectiveIsSaving}>Previous</Button>
          <Button type="submit" disabled={effectiveIsSaving}>
            {effectiveIsSaving && !(isFormBusyForCheque || isFormBusyForSignature) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForCheque && chequeStatusMessage ? chequeStatusMessage : 
             isFormBusyForSignature && signatureStatusMessage ? signatureStatusMessage : 
             effectiveIsSaving ? "Submitting..." : "Submit Application"}
          </Button>
        </CardFooter>
      </form>

      {/* Popups Flow */}
      <Dialog open={isMapModalOpen} onOpenChange={(open) => { if (!open) setIsMapModalOpen(false); }}>
        <DialogContent className="max-w-3xl w-[95vw] h-[80vh] p-0 flex flex-col" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} hideCloseButton={true}>
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Set Your Service Location</DialogTitle>
            <DialogDescription>Select the center point from where you will provide services.</DialogDescription>
          </DialogHeader>
          <div className="flex-grow relative">
            {!isLoadingAppSettings && appConfig.googleMapsApiKey ? (
              <MapAddressSelector 
                apiKey={appConfig.googleMapsApiKey} 
                onAddressSelect={handleMapAddressSelect} 
                onClose={() => setIsMapModalOpen(false)} 
                initialCenter={form.getValues('workAreaCenter')} 
                serviceZones={[]} 
              />
            ) : <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin"/></div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTermsModalOpen} onOpenChange={(open) => { if (!open) setIsTermsModalOpen(false); }}>
        <DialogContent 
          className="max-w-xl w-[90vw] p-0 flex flex-col" 
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          hideCloseButton={true}
        >
          <DialogHeader className="p-6 border-b bg-primary text-primary-foreground">
            <DialogTitle className="text-xl">Provider Terms & Conditions</DialogTitle>
            <DialogDescription className="text-primary-foreground/80">Please read and accept our terms to join the network.</DialogDescription>
          </DialogHeader>
          <div 
            ref={termsScrollRef}
            onScroll={handleScrollTerms}
            className="flex-grow overflow-y-auto max-h-[60vh] p-6 text-sm leading-relaxed prose prose-sm dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: termsContent || "<p>Loading terms...</p>" }}
          />
          <DialogFooter className="p-6 border-t bg-muted/50 flex flex-col gap-3">
            <div className="flex items-center space-x-2 text-xs text-muted-foreground italic">
              {!canAgreeTerms && <span>Please scroll to the bottom to enable the Agree button.</span>}
              {canAgreeTerms && <span className="text-green-600 flex items-center gap-1"><Check className="h-3 w-3"/> Content read. You may proceed.</span>}
            </div>
            <Button onClick={handleAgreeTerms} disabled={!canAgreeTerms} className="w-full">
              I Agree to the Terms & Conditions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
