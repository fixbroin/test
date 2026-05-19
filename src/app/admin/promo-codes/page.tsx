
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, Percent, CheckCircle, XCircle, CalendarDays, EyeOff, Eye } from "lucide-react";
import type { FirestorePromoCode, DiscountType } from '@/types/firestore';
import PromoCodeForm, { type PromoCodeFormData } from '@/components/admin/PromoCodeForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, where, runTransaction } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getTimestampMillis } from '@/lib/utils';

export default function AdminPromoCodesPage() {
  const [promoCodes, setPromoCodes] = useState<FirestorePromoCode[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoCode, setEditingPromoCode] = useState<FirestorePromoCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const promoCodesCollectionRef = collection(db, "adminPromoCodes");

  const fetchPromoCodes = async () => {
    setIsLoading(true);
    try {
      const q = query(promoCodesCollectionRef, orderBy("createdAt", "desc"));
      const data = await getDocs(q);
      const fetchedCodes = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestorePromoCode));
      setPromoCodes(fetchedCodes);
    } catch (error) {
      console.error("Error fetching promo codes: ", error);
      toast({ title: "Error", description: "Could not fetch promo codes.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPromoCodes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddPromoCode = () => {
    setEditingPromoCode(null);
    setIsFormOpen(true);
  };

  const handleEditPromoCode = (code: FirestorePromoCode) => {
    setEditingPromoCode(code);
    setIsFormOpen(true);
  };

  const handleDeletePromoCode = async (codeId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminPromoCodes", codeId));
      setPromoCodes(promoCodes.filter(pc => pc.id !== codeId));
      toast({ title: "Success", description: "Promo code deleted successfully." });
    } catch (error) {
      console.error("Error deleting promo code: ", error);
      toast({ title: "Error", description: "Could not delete promo code.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleToggleActive = async (code: FirestorePromoCode) => {
    setIsSubmitting(true);
    try {
      const codeDocRef = doc(db, "adminPromoCodes", code.id);
      await updateDoc(codeDocRef, { isActive: !code.isActive, updatedAt: Timestamp.now() });
      fetchPromoCodes(); 
      toast({ title: "Status Updated", description: `Promo code ${code.code} ${!code.isActive ? "activated" : "deactivated"}.`});
    } catch (error) {
        console.error("Error toggling promo code status:", error);
        toast({ title: "Error", description: "Could not update promo code status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: PromoCodeFormData & { id?: string }) => {
    setIsSubmitting(true);
    
    const codeExistsQuery = query(promoCodesCollectionRef, where("code", "==", data.code.toUpperCase()));
    const existingCodesSnapshot = await getDocs(codeExistsQuery);
    const isCodeDuplicate = !existingCodesSnapshot.empty && (!data.id || existingCodesSnapshot.docs[0].id !== data.id);

    if (isCodeDuplicate) {
      toast({ title: "Duplicate Code", description: `Promo code "${data.code.toUpperCase()}" already exists. Please use a unique code.`, variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const payload: Omit<FirestorePromoCode, 'id' | 'createdAt' | 'updatedAt' | 'usesCount'> & { updatedAt?: Timestamp, createdAt?: Timestamp, usesCount?: number } = {
      code: data.code.toUpperCase(),
      description: data.description,
      discountType: data.discountType,
      discountValue: Number(data.discountValue),
      minBookingAmount: data.minBookingAmount ? Number(data.minBookingAmount) : undefined,
      maxUses: data.maxUses ? Number(data.maxUses) : undefined,
      maxUsesPerUser: data.maxUsesPerUser ? Number(data.maxUsesPerUser) : undefined,
      validFrom: data.validFrom ? Timestamp.fromDate(new Date(data.validFrom)) : undefined,
      validUntil: data.validUntil ? Timestamp.fromDate(new Date(data.validUntil)) : undefined,
      isActive: data.isActive === undefined ? true : data.isActive,
      isHidden: data.isHidden,
    };

    try {
      if (data.id) { 
        const promoCodeDoc = doc(db, "adminPromoCodes", data.id);
        payload.updatedAt = Timestamp.now();
        await updateDoc(promoCodeDoc, payload);
        toast({ title: "Success", description: "Promo code updated successfully." });
      } else { 
        payload.createdAt = Timestamp.now();
        payload.usesCount = 0; 
        await addDoc(promoCodesCollectionRef, payload);
        toast({ title: "Success", description: "Promo code added successfully." });
      }
      setIsFormOpen(false);
      setEditingPromoCode(null);
      await fetchPromoCodes(); 
    } catch (error) {
      console.error("Error saving promo code: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save promo code.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const formatDateForIndia = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return "N/A";
    return new Date(millis).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getDiscountDisplay = (type: DiscountType, value: number) => {
    if (type === 'percentage') return `${value}%`;
    if (type === 'fixed') return `₹${value.toLocaleString()}`;
    return String(value);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><Percent className="mr-2 h-6 w-6 text-primary" />Manage Promo Codes</CardTitle>
            <CardDescription>Create, edit, and manage promotional discount codes for customers.</CardDescription>
          </div>
          <Button onClick={handleAddPromoCode} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Promo Code
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading promo codes...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="text-center">Min. Booking (₹)</TableHead>
                  <TableHead className="text-center">Uses / Max</TableHead>
                  <TableHead className="text-center">Max/User</TableHead>
                  <TableHead className="text-center">Valid From</TableHead>
                  <TableHead className="text-center">Valid Until</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-center">Hidden</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                      No promo codes found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  promoCodes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-medium text-primary">{code.code}</TableCell>
                      <TableCell>{getDiscountDisplay(code.discountType, code.discountValue)}</TableCell>
                      <TableCell className="text-center">{code.minBookingAmount?.toLocaleString() || "N/A"}</TableCell>
                      <TableCell className="text-center">{code.usesCount} / {code.maxUses || "∞"}</TableCell>
                      <TableCell className="text-center">{code.maxUsesPerUser || "∞"}</TableCell>
                      <TableCell className="text-center text-xs">
                        {code.validFrom ? formatDateForIndia(code.validFrom) : <span title="Not set"><XCircle className="h-4 w-4 text-muted-foreground/70 mx-auto" /></span>}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {code.validUntil ? formatDateForIndia(code.validUntil) : <span title="Not set"><XCircle className="h-4 w-4 text-muted-foreground/70 mx-auto" /></span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={code.isActive}
                          onCheckedChange={() => handleToggleActive(code)}
                          disabled={isSubmitting}
                          aria-label={`Toggle active status for ${code.code}`}
                        />
                      </TableCell>
                       <TableCell className="text-center">
                        {code.isHidden ? <span title="Hidden"><EyeOff className="h-5 w-5 text-muted-foreground mx-auto" /></span> : <span title="Visible"><Eye className="h-5 w-5 text-green-500 mx-auto" /></span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <Button variant="outline" size="icon" onClick={() => handleEditPromoCode(code)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the promo code "{code.code}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeletePromoCode(code.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingPromoCode(null); } }}>
        <DialogContent 
          onPointerDownOutside={(e) => {
             // Check if the click is inside a calendar popover
             const target = e.target as HTMLElement;
             if(target.closest('.rdp')) {
               e.preventDefault();
             }
          }}
          className="w-[90vw] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] p-0 flex flex-col"
        >
          <DialogHeader className="p-6 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingPromoCode ? 'Edit Promo Code' : 'Add New Promo Code'}</DialogTitle>
            <DialogDescription>
              {editingPromoCode ? 'Update details for this promo code.' : 'Fill in the details for a new promo code.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto">
            <PromoCodeForm
              onSubmit={handleFormSubmit}
              initialData={editingPromoCode}
              onCancel={() => { setIsFormOpen(false); setEditingPromoCode(null); }}
              isSubmitting={isSubmitting}
              allPromoCodes={promoCodes} 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
