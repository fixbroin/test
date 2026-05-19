
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProviderApplication, KycDocument, BankDetails, ProviderApplicationStatus } from '@/types/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle, Briefcase, FileText, Banknote, MapPin, Image as ImageIcon, ShieldCheck, CheckCircle, AlertTriangle, XCircle, Loader2, Download, Edit as EditIcon, ExternalLink } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import NextImage from 'next/image';
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { generateProviderApplicationPdf } from '@/lib/generateProviderPDF';
import { triggerPdfDownload } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Separator } from "@/components/ui/separator";
import { cn, getTimestampMillis } from "@/lib/utils";
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";

interface ProviderApplicationDetailsModalProps {
  application: ProviderApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (applicationId: string, newStatus: ProviderApplicationStatus, notes?: string) => Promise<void>;
  isLoadingStatusUpdate: boolean;
}

const formatTimestampToReadable = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return "N/A";
  return new Date(millis).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};


const KycDocDisplay: React.FC<{ 
  doc?: KycDocument | null, 
  docName: string,
  onVerify?: () => void,
  isVerifying?: boolean
}> = ({ doc, docName, onVerify, isVerifying }) => {
  if (!doc || (!doc.docNumber && !doc.frontImageUrl)) return <p className="text-sm text-muted-foreground">Not Provided</p>;
  return (
    <div className="space-y-2 border p-3 rounded-lg bg-muted/5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
            <p className="text-sm font-bold">{doc.docLabel || docName}</p>
            <Badge variant={doc.verified ? "default" : "secondary"} className={cn(doc.verified && "bg-green-500 hover:bg-green-600")}>
                {doc.verified ? "Verified" : "Pending Verification"}
            </Badge>
        </div>
        {!doc.verified && onVerify && (
            <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-[10px] border-green-500 text-green-600 hover:bg-green-50"
                onClick={(e) => { e.stopPropagation(); onVerify(); }}
                disabled={isVerifying}
            >
                {isVerifying ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <CheckCircle className="h-3 w-3 mr-1"/>}
                Approve
            </Button>
        )}
      </div>
      <p className="text-sm"><strong>ID Number:</strong> {doc.docNumber || "N/A"}</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        {doc.frontImageUrl && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase text-muted-foreground font-bold">Front Image</span>
            <div className="relative aspect-video w-full border rounded-md bg-white">
              <NextImage src={doc.frontImageUrl} alt={`${docName} Front`} fill className="object-contain p-1"/>
              <a href={doc.frontImageUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-1 right-1 bg-black/50 p-1 rounded text-white hover:bg-black/70"><ExternalLink className="h-3 w-3"/></a>
            </div>
          </div>
        )}
        {doc.backImageUrl && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase text-muted-foreground font-bold">Back Image</span>
            <div className="relative aspect-video w-full border rounded-md bg-white">
              <NextImage src={doc.backImageUrl} alt={`${docName} Back`} fill className="object-contain p-1"/>
              <a href={doc.backImageUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-1 right-1 bg-black/50 p-1 rounded text-white hover:bg-black/70"><ExternalLink className="h-3 w-3"/></a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BankDetailsDisplay: React.FC<{ 
  details?: BankDetails | null,
  onVerify?: () => void,
  isVerifying?: boolean
}> = ({ details, onVerify, isVerifying }) => {
  if (!details || !details.bankName) return <p className="text-sm text-muted-foreground">Not Provided</p>;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p><strong>Bank:</strong> {details.bankName}</p>
            <p><strong>A/C Holder:</strong> {details.accountHolderName}</p>
            <p><strong>A/C No:</strong> {details.accountNumber}</p>
            <p><strong>IFSC:</strong> {details.ifscCode}</p>
          </div>
          {!details.verified && onVerify && (
            <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-[10px] border-green-500 text-green-600 hover:bg-green-50"
                onClick={onVerify}
                disabled={isVerifying}
            >
                {isVerifying ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <CheckCircle className="h-3 w-3 mr-1"/>}
                Verify Bank
            </Button>
          )}
      </div>
      {details.cancelledChequeUrl && (
         <div className="mt-1">
            <a href={details.cancelledChequeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Cheque ({details.cancelledChequeFileName || 'View'})</a>
            {details.cancelledChequeUrl.startsWith('http') && <div className="relative w-32 h-20 mt-1 border rounded"><NextImage src={details.cancelledChequeUrl} alt="Cancelled Cheque" fill className="object-contain p-1"/></div>}
        </div>
      )}
      <div className="text-xs mt-1">Status: <Badge variant={details.verified ? "default" : "secondary"} className={cn(details.verified && "bg-green-500 hover:bg-green-600")}>{details.verified ? "Verified" : "Pending"}</Badge></div>
    </div>
  );
};


export default function ProviderApplicationDetailsModal({
  application,
  isOpen,
  onClose,
  onUpdateStatus,
  isLoadingStatusUpdate,
}: ProviderApplicationDetailsModalProps) {
  const [adminNotes, setAdminNotes] = useState("");
  const { toast } = useToast();
  const { settings: globalCompanySettings } = useGlobalSettings();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [verifyingDocType, setVerifyingDocType] = useState<string | null>(null);

  useEffect(() => {
    if (application) {
      setAdminNotes(application.adminReviewNotes || "");
    } else {
      setAdminNotes("");
    }
  }, [application]);

  if (!application) return null;

  const handleStatusAction = (newStatus: ProviderApplicationStatus) => {
    if (!application?.id) return;

    if (newStatus === 'rejected' || newStatus === 'needs_update') {
        if (!adminNotes.trim()) {
            toast({
              title: "Notes Required",
              description: "Please provide notes for approval, rejection, or requesting updates.",
              variant: "destructive"
            });
            return;
        }
    }
    onUpdateStatus(application.id, newStatus, adminNotes);
  };

  const handleVerifyDocument = async (docType: string) => {
    if (!application?.id) return;
    setVerifyingDocType(docType);
    
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      const updatePayload: any = { updatedAt: Timestamp.now() };

      if (docType === 'aadhaar') {
        updatePayload['aadhaar.verified'] = true;
      } else if (docType === 'pan') {
        updatePayload['pan.verified'] = true;
      } else if (docType === 'bank') {
        updatePayload['bankDetails.verified'] = true;
      } else {
        // Find and update in additionalDocuments array
        const updatedDocs = application.additionalDocuments?.map(d => 
          d.docType === docType ? { ...d, verified: true } : d
        );
        updatePayload['additionalDocuments'] = updatedDocs;
      }

      await updateDoc(appDocRef, updatePayload);
      toast({ title: "Verified", description: "Document has been marked as verified." });
    } catch (error) {
      console.error("Error verifying document:", error);
      toast({ title: "Error", description: "Could not verify document.", variant: "destructive" });
    } finally {
      setVerifyingDocType(null);
    }
  };

  const handleDownloadProviderPdf = async () => {
    if (!application) return;
    setIsDownloadingPdf(true);
    try {
      const companyInfo = {
        name: globalCompanySettings?.websiteName || "FixBro.in",
        address: globalCompanySettings?.address || "Company Address Placeholder",
        contactEmail: globalCompanySettings?.contactEmail || 'support@example.com',
        contactMobile: globalCompanySettings?.contactMobile || '+91-XXXXXXXXXX',
        logoUrl: globalCompanySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateProviderApplicationPdf(application, companyInfo);
      triggerPdfDownload(pdfDataUri, `ProviderApp-${application.fullName?.replace(/\s+/g, '_') || application.id}.pdf`);
    } catch (error) {
      console.error("Error generating or downloading provider PDF:", error);
      toast({ title: "PDF Error", description: (error as Error).message || "Could not generate or download PDF.", variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] max-h-[90vh] grid grid-rows-[auto_1fr_auto] p-0 overflow-x-hidden">
        <DialogHeader className="p-4 sm:p-6 border-b flex-shrink-0 w-full max-w-full overflow-hidden">
          <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
            <Avatar className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0">
              <AvatarImage src={application.profilePhotoUrl || undefined} alt={application.fullName || "Provider"} />
              <AvatarFallback className="text-xl sm:text-2xl">{application.fullName ? application.fullName[0].toUpperCase() : "P"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="text-xl sm:text-2xl break-words max-w-full">{application.fullName || "Provider Application"}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm break-words max-w-full">ID: {application.id}</DialogDescription>
              <Badge variant="outline" className="mt-1 text-xs capitalize">{application.status.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto overflow-x-hidden flex-grow min-h-0">
            <div className="p-4 sm:p-6">
            <Tabs defaultValue="personal" className="w-full">
                <div className="relative mb-6">
                    <TabsList className="h-11 w-full justify-start gap-1 bg-muted p-1 overflow-x-auto no-scrollbar flex-nowrap rounded-lg">
                        <TabsTrigger value="personal" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><UserCircle className="mr-1.5 h-4 w-4 shrink-0"/>Personal</TabsTrigger>
                        <TabsTrigger value="work" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><Briefcase className="mr-1.5 h-4 w-4 shrink-0"/>Work Info</TabsTrigger>
                        <TabsTrigger value="kyc" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><FileText className="mr-1.5 h-4 w-4 shrink-0"/>KYC Docs</TabsTrigger>
                        <TabsTrigger value="bank" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><Banknote className="mr-1.5 h-4 w-4 shrink-0"/>Bank & Area</TabsTrigger>
                        <TabsTrigger value="confirmation" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><EditIcon className="mr-1.5 h-4 w-4 shrink-0"/>Status</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="personal" className="space-y-3 text-sm focus-visible:outline-none focus-visible:ring-0 mt-0">
                    <p><strong>Full Name:</strong> {application.fullName || 'N/A'}</p>
                    <p><strong>Email:</strong> {application.email || 'N/A'}</p>
                    <p><strong>Mobile:</strong> {application.mobileNumber || 'N/A'}</p>
                    <p><strong>Alternate Mobile:</strong> {application.alternateMobile || 'N/A'}</p>
                    <p><strong>Address:</strong> {application.address || 'N/A'}</p>
                    <p><strong>Age:</strong> {application.age || 'N/A'}</p>
                    <p><strong>Qualification:</strong> {application.qualificationLabel || 'N/A'}</p>
                    <p><strong>Languages Spoken:</strong> {application.languagesSpokenLabels?.join(', ') || 'N/A'}</p>
                    <p><strong>Submitted:</strong> {formatTimestampToReadable(application.submittedAt || application.createdAt)}</p>
                </TabsContent>

                <TabsContent value="work" className="space-y-3 text-sm focus-visible:outline-none focus-visible:ring-0">
                    <p><strong>Category:</strong> {application.workCategoryName || 'N/A'}</p>
                    <p><strong>Experience:</strong> {application.experienceLevelLabel || 'N/A'}</p>
                    <p><strong>Skill Level:</strong> {application.skillLevelLabel || 'N/A'}</p>
                    <div className="pt-2">
                        <strong>Bio / About Me:</strong>
                        <p className="text-muted-foreground whitespace-pre-wrap mt-1 border p-3 rounded-md bg-muted/20">
                            {application.bio || 'No bio provided.'}
                        </p>
                    </div>
                </TabsContent>

                <TabsContent value="kyc" className="space-y-4 text-sm focus-visible:outline-none focus-visible:ring-0">
                    <KycDocDisplay 
                        doc={application.aadhaar} 
                        docName="Aadhaar Card"
                        onVerify={() => handleVerifyDocument('aadhaar')}
                        isVerifying={verifyingDocType === 'aadhaar'}
                    />
                    <KycDocDisplay 
                        doc={application.pan} 
                        docName="PAN Card"
                        onVerify={() => handleVerifyDocument('pan')}
                        isVerifying={verifyingDocType === 'pan'}
                    />
                    
                    {application.additionalDocuments && application.additionalDocuments.length > 0 && (
                        <div className="pt-2">
                          <h4 className="font-bold text-base mb-3 border-b pb-1">Additional Documents</h4>
                          <div className="space-y-4">
                            {application.additionalDocuments.map((doc, idx) => (
                                <KycDocDisplay 
                                  key={idx} 
                                  doc={doc} 
                                  docName={doc.docLabel || doc.docType || `Additional Document ${idx+1}`}
                                  onVerify={() => handleVerifyDocument(doc.docType)}
                                  isVerifying={verifyingDocType === doc.docType}
                                />
                            ))}
                          </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="bank" className="space-y-4 text-sm focus-visible:outline-none focus-visible:ring-0">
                    <div>
                        <h4 className="font-semibold mb-1">Work Area:</h4>
                        <p><strong>Center:</strong> {application.workAreaCenter ? `${application.workAreaCenter.latitude.toFixed(4)}, ${application.workAreaCenter.longitude.toFixed(4)}` : 'N/A'}</p>
                        <p><strong>Radius:</strong> {application.workAreaRadiusKm ? `${application.workAreaRadiusKm} km` : 'N/A'}</p>
                        {application.workAreaCenter && (
                            <Button variant="link" size="sm" onClick={() => window.open(`https://www.google.com/maps?q=${application.workAreaCenter?.latitude},${application.workAreaCenter?.longitude}`, '_blank')} className="px-0 h-auto">
                                View on Map <ExternalLink className="ml-1 h-3 w-3"/>
                            </Button>
                        )}
                    </div>
                    <Separator />
                    <div>
                        <h4 className="font-semibold mb-1">Bank Details:</h4>
                        <BankDetailsDisplay 
                            details={application.bankDetails} 
                            onVerify={() => handleVerifyDocument('bank')}
                            isVerifying={verifyingDocType === 'bank'}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="confirmation" className="space-y-4 text-sm focus-visible:outline-none focus-visible:ring-0">
                    <div>
                        <h4 className="font-semibold mb-1">Terms Confirmation:</h4>
                        {application.termsConfirmedAt ? (
                            <p className="flex items-center text-green-600"><CheckCircle className="mr-2 h-4 w-4"/>Confirmed on {formatTimestampToReadable(application.termsConfirmedAt)}</p>
                        ) : (
                            <p className="flex items-center text-destructive"><XCircle className="mr-2 h-4 w-4"/>Not Confirmed</p>
                        )}
                    </div>
                     <div>
                        <h4 className="font-semibold mb-1">Signature:</h4>
                        {application.signatureUrl ? (
                            <div className="mt-1">
                                <a href={application.signatureUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Signature ({application.signatureFileName || 'View Image'})</a>
                                {application.signatureUrl.startsWith('http') && <div className="relative w-48 h-24 mt-1 border rounded bg-white"><NextImage src={application.signatureUrl} alt="Provider Signature" fill className="object-contain p-1"/></div>}
                            </div>
                        ) : (
                            <p className="text-muted-foreground">No signature provided.</p>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {(application.status === 'pending_review' || application.status === 'needs_update' || application.status === 'rejected') && (
            <div className="mt-6 pt-4 border-t">
                <Label htmlFor="adminReviewNotes" className="font-semibold text-sm">Admin Review Notes:</Label>
                <Textarea
                    id="adminReviewNotes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes for approval, rejection, or update request..."
                    rows={3}
                    className="mt-1.5 text-sm"
                    disabled={isLoadingStatusUpdate}
                />
            </div>
            )}
            </div>
        </div>

        <DialogFooter className="p-4 sm:p-6 border-t bg-muted/50 flex flex-col gap-2 sm:gap-0 sm:flex-row sm:justify-between items-center flex-shrink-0">
          <Button variant="outline" onClick={handleDownloadProviderPdf} disabled={isLoadingStatusUpdate || isDownloadingPdf} className="w-full sm:w-auto order-last sm:order-first">
             {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>} Download PDF
          </Button>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <DialogClose asChild><Button variant="outline" disabled={isLoadingStatusUpdate} className="w-full sm:w-auto">Close</Button></DialogClose>
            
            {application.status !== 'approved' && (
                <Button onClick={() => handleStatusAction('approved')} disabled={isLoadingStatusUpdate} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                {isLoadingStatusUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} <CheckCircle className="mr-2 h-4 w-4"/>Approve
                </Button>
            )}
            
            {application.status !== 'rejected' && (
                <Button variant="destructive" onClick={() => handleStatusAction('rejected')} disabled={isLoadingStatusUpdate} className="w-full sm:w-auto">
                    {isLoadingStatusUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} <XCircle className="mr-2 h-4 w-4"/>Reject
                </Button>
            )}
            
            {application.status !== 'needs_update' && (
                <Button variant="outline" onClick={() => handleStatusAction('needs_update')} disabled={isLoadingStatusUpdate} className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/10 w-full sm:w-auto">
                    {isLoadingStatusUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} <AlertTriangle className="mr-2 h-4 w-4"/>Needs Update
                </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
