"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users2, Eye, Edit, Trash2, CheckCircle, XCircle, AlertTriangle, Loader2, PackageSearch, UserCircle } from "lucide-react";
import type { ProviderApplication, ProviderApplicationStatus, FirestoreNotification } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, deleteDoc, addDoc, where, getDocs, limit } from "firebase/firestore";
 
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ProviderApplicationDetailsModal from '@/components/admin/ProviderApplicationDetailsModal';
import { Textarea } from '@/components/ui/textarea'; 
import { Label } from '@/components/ui/label'; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 
import { sendProviderApplicationStatusEmail } from '@/ai/flows/sendProviderApplicationStatusUpdateFlow'; 
import { getBaseUrl } from '@/lib/config'; 
import { Separator } from "@/components/ui/separator";
import { getTimestampMillis } from '@/lib/utils';

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";
const applicationStatusOptions: ProviderApplicationStatus[] = ['pending_review', 'pending_step_1', 'pending_step_2', 'pending_step_3', 'pending_step_4', 'approved', 'rejected', 'needs_update'];

const formatApplicationTimestamp = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return new Date(millis).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function AdminProviderApplicationsPage() {
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null); 
  const [filterStatus, setFilterStatus] = useState<ProviderApplicationStatus | "all">("all");
  const { toast } = useToast();
  const router = useRouter();

  const [selectedApplication, setSelectedApplication] = useState<ProviderApplication | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [adminReviewNotes, setAdminReviewNotes] = useState("");
  const [showNotesInputFor, setShowNotesInputFor] = useState<string | null>(null); 
  const [pendingStatusForNotes, setPendingStatusForNotes] = useState<ProviderApplicationStatus | null>(null);

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const fetchApplications = async () => {
    setIsLoading(true);
    try {
      const applicationsCollectionRef = collection(db, PROVIDER_APPLICATION_COLLECTION);
      const q = query(applicationsCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedApplications = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as ProviderApplication));
      setApplications(fetchedApplications);
    } catch (error) {
      console.error("Error fetching provider applications: ", error);
      toast({ title: "Error", description: "Could not fetch provider applications.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [toast]);


  const filteredApplications = useMemo(() => {
    if (filterStatus === "all") {
      return applications;
    }
    return applications.filter(app => app.status === filterStatus);
  }, [applications, filterStatus]);

  const handleUpdateStatus = async (applicationId: string, newStatus: ProviderApplicationStatus, notes?: string) => {
    if (!applicationId) return;
    setIsUpdating(applicationId);
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, applicationId);
      const appToUpdate = applications.find(app => app.id === applicationId);
      if (!appToUpdate) {
          toast({ title: "Error", description: "Application not found.", variant: "destructive"});
          setIsUpdating(null);
          return;
      }

      const updatePayload: Partial<ProviderApplication> = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };
      if (notes && (newStatus === 'rejected' || newStatus === 'needs_update')) {
        updatePayload.adminReviewNotes = notes;
      }
      
      await updateDoc(appDocRef, updatePayload);
      toast({ title: "Success", description: `Application status updated to ${newStatus}.` });
      setShowNotesInputFor(null); 
      setAdminReviewNotes("");
      setPendingStatusForNotes(null);
      await fetchApplications(); // Refresh list


      // Send email to provider
      if (appConfig.smtpHost && appConfig.senderEmail && appToUpdate.email && appToUpdate.userId) {
        let emailMessageAction = "";
        let notificationType: "success" | "error" | "warning" = "warning";
        let notificationLink = `/provider-registration`; 

        switch(newStatus) {
            case 'approved':
                emailMessageAction = "Congratulations! Your application is approved. You can now access your provider dashboard.";
                notificationType = "success";
                notificationLink = "/provider"; 
                break;
            case 'rejected':
                emailMessageAction = "Your application was not approved at this time." + (notes ? ` Feedback: ${notes}` : "");
                notificationType = "error";
                break;
            case 'needs_update':
                emailMessageAction = "Your application requires updates." + (notes ? ` Please address: ${notes}` : "");
                notificationType = "warning";
                break;
        }

        const emailInput = {
          providerName: appToUpdate.fullName || "Provider",
          providerEmail: appToUpdate.email,
          applicationStatus: newStatus,
          adminReviewNotes: notes,
          applicationUrl: `${getBaseUrl()}/provider-registration`, 
          smtpHost: appConfig.smtpHost,
          smtpPort: appConfig.smtpPort,
          smtpUser: appConfig.smtpUser,
          smtpPass: appConfig.smtpPass,
          senderEmail: appConfig.senderEmail,
        };
        try {
            await sendProviderApplicationStatusEmail(emailInput);
        } catch (emailError) {
            console.error("Failed to send provider status update email:", emailError);
        }
        
        const providerNotification: Omit<FirestoreNotification, 'id'> = {
            userId: appToUpdate.userId,
            title: `Application Status: ${newStatus.replace(/_/g, ' ')}`,
            message: emailMessageAction || `Your application status is now ${newStatus.replace(/_/g, ' ')}.`,
            type: notificationType,
            href: notificationLink,
            read: false,
            createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), providerNotification);

        // Trigger Push Notification for the provider
        triggerPushNotification({
          userId: appToUpdate.userId,
          title: providerNotification.title,
          body: providerNotification.message,
          href: providerNotification.href
        });
      }

    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update application status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };
  
  const handleDeleteApplication = async (applicationId: string) => {
    if (!applicationId) return;
    setIsUpdating(applicationId);
    try {
        await deleteDoc(doc(db, PROVIDER_APPLICATION_COLLECTION, applicationId));
        toast({title: "Success", description: "Provider application deleted."});
    } catch (error) {
        toast({title: "Error", description: "Could not delete application.", variant: "destructive"});
    } finally {
        setIsUpdating(null);
    }
  };

  const handleViewDetails = (app: ProviderApplication) => {
    setSelectedApplication(app);
    setAdminReviewNotes(app.adminReviewNotes || ""); 
    setIsDetailsModalOpen(true);
  };

  const prepareActionWithNotes = (applicationId: string, newStatus: ProviderApplicationStatus) => {
    if (adminReviewNotes.trim() === "" && (newStatus === 'rejected' || newStatus === 'needs_update')) {
        toast({ title: "Notes Required", description: "Please provide notes for rejection or requesting updates.", variant: "destructive"});
        return;
    }
    handleUpdateStatus(applicationId, newStatus, adminReviewNotes);
  };
  
  const getStatusBadgeVariant = (status: ProviderApplicationStatus) => {
    switch (status) {
      case 'approved': return 'default'; 
      case 'pending_review': return 'secondary'; 
      case 'rejected': return 'destructive'; 
      case 'needs_update': return 'outline'; 
      default: return 'outline'; 
    }
  };

  const renderApplicationCard = (app: ProviderApplication) => (
    <Card key={app.id} className="mb-4 shadow-sm border overflow-hidden">
      <CardHeader className="p-4 bg-muted/20">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarImage src={app.profilePhotoUrl || undefined} alt={app.fullName || "P"} />
              <AvatarFallback>{app.fullName ? app.fullName[0].toUpperCase() : <UserCircle />}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base font-bold truncate">{app.fullName || "N/A"}</CardTitle>
              <CardDescription className="text-xs truncate">{app.email || "No Email"}</CardDescription>
            </div>
          </div>
          <Badge variant={getStatusBadgeVariant(app.status)} className={`text-xs capitalize whitespace-nowrap ${app.status === 'approved' ? 'bg-green-500 text-white' : ''}`}>
            {app.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 text-sm space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-medium">Category:</span>
          <span className="text-foreground">{app.workCategoryName || "N/A"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-medium">Mobile:</span>
          <span className="text-foreground">{app.mobileNumber || "N/A"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-medium">Submitted:</span>
          <span className="text-foreground">{formatApplicationTimestamp(app.submittedAt || app.createdAt)}</span>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-wrap gap-2 justify-end border-t mt-2 pt-4">
        <Button variant="outline" size="sm" onClick={() => handleViewDetails(app)} className="h-8 text-xs">
          <Eye className="h-3.5 w-3.5 mr-1" /> Details
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push(`/provider-registration?editApplicationId=${app.id}`)} className="h-8 text-xs">
          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        {app.status !== 'approved' && (
          <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(app.id!, 'approved')} className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50">
            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
        )}
        {app.status !== 'rejected' && (
          <Button variant="outline" size="sm" onClick={() => { setShowNotesInputFor(app.id!); setPendingStatusForNotes('rejected'); }} className="h-8 text-xs text-destructive border-destructive/20 hover:bg-destructive/10">
            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
          </Button>
        )}
        {app.status !== 'needs_update' && (
          <Button variant="outline" size="sm" onClick={() => { setShowNotesInputFor(app.id!); setPendingStatusForNotes('needs_update'); }} className="h-8 text-xs text-yellow-600 border-yellow-200 hover:bg-yellow-50">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Update
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon" className="h-8 w-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>Permanently delete application for {app.fullName || "this provider"}?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteApplication(app.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
      {showNotesInputFor === app.id && (
        <div className="p-4 pt-0 space-y-3 bg-muted/10">
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Notes for Provider ({pendingStatusForNotes?.replace(/_/g, ' ')}):</Label>
            <Textarea
              placeholder="Explain why this action is being taken..."
              value={adminReviewNotes}
              onChange={(e) => setAdminReviewNotes(e.target.value)}
              className="text-xs min-h-[80px]"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => {setShowNotesInputFor(null); setAdminReviewNotes(""); setPendingStatusForNotes(null);}}>Cancel</Button>
              <Button size="sm" onClick={() => prepareActionWithNotes(app.id!, pendingStatusForNotes!)}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Users2 className="mr-2 h-6 w-6 text-primary" /> Provider Applications
            </CardTitle>
            <CardDescription>
              Review and manage provider registration applications.
            </CardDescription>
          </div>
          <div className="mt-4 sm:mt-0 w-full sm:w-auto sm:min-w-[200px]">
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as ProviderApplicationStatus | "all")}>
              <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {applicationStatusOptions.map(status => (
                  <SelectItem key={status} value={status} className="capitalize">{status.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading || isLoadingAppSettings ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : filteredApplications.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {filterStatus === "all" ? "No provider applications found yet." : `No applications found with status: ${filterStatus.replace(/_/g, ' ')}.`}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Avatar</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell>
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={app.profilePhotoUrl || undefined} alt={app.fullName || "P"} />
                            <AvatarFallback>{app.fullName ? app.fullName[0].toUpperCase() : <UserCircle />}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{app.fullName || "N/A"}</div>
                          <div className="text-xs text-muted-foreground">{app.email}</div>
                          <div className="text-xs text-muted-foreground">{app.mobileNumber}</div>
                        </TableCell>
                        <TableCell className="text-sm">{app.workCategoryName || "N/A"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatApplicationTimestamp(app.submittedAt || app.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(app.status)} className={`text-[10px] capitalize ${app.status === 'approved' ? 'bg-green-500 text-white' : ''}`}>{app.status.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end items-center gap-1.5">
                            <Button variant="outline" size="icon" onClick={() => handleViewDetails(app)} className="h-8 w-8" title="View Details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => router.push(`/provider-registration?editApplicationId=${app.id}`)} className="h-8 w-8" title="Edit Application">
                              <Edit className="h-4 w-4" />
                            </Button>
                            
                            {app.status !== 'approved' && (
                              <Button variant="outline" size="icon" onClick={() => handleUpdateStatus(app.id!, 'approved')} className="h-8 w-8 text-green-600 border-green-200 hover:bg-green-50" title="Approve">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {app.status !== 'rejected' && (
                              <Button variant="outline" size="icon" onClick={() => { setShowNotesInputFor(app.id!); setPendingStatusForNotes('rejected'); }} className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10" title="Reject">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {app.status !== 'needs_update' && (
                              <Button variant="outline" size="icon" onClick={() => { setShowNotesInputFor(app.id!); setPendingStatusForNotes('needs_update'); }} className="h-8 w-8 text-yellow-600 border-yellow-200 hover:bg-yellow-50" title="Request Update">
                                <AlertTriangle className="h-4 w-4" />
                              </Button>
                            )}

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                  <AlertDialogDescription>Permanently delete application for {app.fullName || "this provider"}?</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteApplication(app.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          {showNotesInputFor === app.id && (
                            <div className="mt-2 p-2 border rounded-md bg-muted/50 space-y-2 max-w-xs ml-auto text-left">
                                <Label className="text-xs font-semibold">Notes for Provider ({pendingStatusForNotes?.replace(/_/g, ' ')}):</Label>
                                <Textarea
                                    placeholder="Reason for rejection or update request..."
                                    value={adminReviewNotes}
                                    onChange={(e) => setAdminReviewNotes(e.target.value)}
                                    className="text-xs min-h-[60px]"
                                />
                                <div className="flex gap-2 justify-end">
                                    <Button size="xs" variant="ghost" onClick={() => {setShowNotesInputFor(null); setAdminReviewNotes(""); setPendingStatusForNotes(null);}}>Cancel</Button>
                                    <Button size="xs" onClick={() => prepareActionWithNotes(app.id!, pendingStatusForNotes!)}>Confirm</Button>
                                </div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View */}
              <div className="lg:hidden space-y-4">
                {filteredApplications.map(renderApplicationCard)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {selectedApplication && (
        <ProviderApplicationDetailsModal
          application={selectedApplication}
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          onUpdateStatus={(appId, newStatus, notesFromModal) => handleUpdateStatus(appId, newStatus, notesFromModal)}
          isLoadingStatusUpdate={!!isUpdating}
        />
      )}
    </div>
  );
}
