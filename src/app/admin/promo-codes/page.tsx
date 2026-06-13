
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, Ticket, CheckCircle2, XCircle } from "lucide-react";
import type { FirestorePromoCode } from '@/types/firestore';
import PromoCodeForm, { PromoCodeFormData } from '@/components/admin/PromoCodeForm';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, Timestamp, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getTimestampMillis } from '@/lib/utils';
import PermissionGuard from '@/components/admin/PermissionGuard';

const formatDate = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return new Date(millis).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function AdminPromoCodesPage() {
  const [promoCodes, setPromoCodes] = useState<FirestorePromoCode[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoCode, setEditingPromoCode] = useState<FirestorePromoCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const q = query(collection(db, "promoCodes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPromoCodes(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestorePromoCode)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching promo codes: ", error);
      toast({ title: "Error", description: "Could not fetch promo codes.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleAddPromoCode = () => {
    setEditingPromoCode(null);
    setIsFormOpen(true);
  };

  const handleEditPromoCode = (promoCode: FirestorePromoCode) => {
    setEditingPromoCode(promoCode);
    setIsFormOpen(true);
  };

  const handleDeletePromoCode = async (id: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "promoCodes", id));
      await triggerRefresh('promo-usage');
      toast({ title: "Success", description: "Promo code deleted successfully." });
    } catch (error) {
      console.error("Error deleting promo code: ", error);
      toast({ title: "Error", description: "Could not delete promo code.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: PromoCodeFormData & { id?: string }) => {
    setIsSubmitting(true);
    try {
      const { id, ...rawPromoData } = data;
      
      // Clean data for Firestore (replace null with undefined or remove)
      // Firestore will store Date as Timestamp, and we want to avoid explicit nulls for optional fields
      const promoData = {
          ...rawPromoData,
          minBookingAmount: rawPromoData.minBookingAmount === null ? undefined : rawPromoData.minBookingAmount,
          maxUses: rawPromoData.maxUses === null ? undefined : rawPromoData.maxUses,
          maxUsesPerUser: rawPromoData.maxUsesPerUser === null ? undefined : rawPromoData.maxUsesPerUser,
          validFrom: rawPromoData.validFrom === null ? undefined : rawPromoData.validFrom,
          validUntil: rawPromoData.validUntil === null ? undefined : rawPromoData.validUntil
      };

      if (id) {
        await updateDoc(doc(db, "promoCodes", id), { ...promoData, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Promo code updated successfully." });
      } else {
        await addDoc(collection(db, "promoCodes"), { 
            ...promoData, 
            usesCount: 0, 
            createdAt: Timestamp.now(), 
            updatedAt: Timestamp.now() 
        });
        toast({ title: "Success", description: "New promo code created." });
      }
      await triggerRefresh('promo-usage');
      setIsFormOpen(false);
      setEditingPromoCode(null);
    } catch (error) {
      console.error("Error saving promo code: ", error);
      toast({ title: "Error", description: "Could not save promo code.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPromoCodeActive = (promoCode: FirestorePromoCode) => {
    if (!promoCode.isActive) return false;
    const now = Date.now();
    const startMillis = getTimestampMillis(promoCode.startDate);
    const endMillis = getTimestampMillis(promoCode.endDate);
    if (startMillis && now < startMillis) return false;
    if (endMillis && now > endMillis) return false;
    if (promoCode.usageLimit && promoCode.currentUsage && promoCode.currentUsage >= promoCode.usageLimit) return false;
    return true;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Ticket className="mr-2 h-6 w-6 text-primary" />
              Promo Codes
            </CardTitle>
            <CardDescription>
              Create and manage discount codes for your customers.
            </CardDescription>
          </div>
          <PermissionGuard moduleId="promo_codes" action="create">
            <Button onClick={handleAddPromoCode} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Code
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading promo codes...</p>
            </div>
          ) : promoCodes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl">
              <p>No promo codes found. Create your first one above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Validity</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoCodes.map((promo) => {
                    const active = isPromoCodeActive(promo);
                    return (
                      <TableRow key={promo.id}>
                        <TableCell className="font-bold text-primary">{promo.code}</TableCell>
                        <TableCell>
                          {promo.discountType === 'percentage' ? `${promo.discountValue}% OFF` : `₹${promo.discountValue} OFF`}
                          {promo.minBookingAmount && <div className="text-[10px] text-muted-foreground">Min: ₹{promo.minBookingAmount}</div>}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>From: {formatDate(promo.startDate)}</div>
                          <div>To: {formatDate(promo.endDate)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {promo.currentUsage || 0} / {promo.usageLimit || '∞'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {active ? (
                            <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="mr-1 h-3 w-3" /> Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                            <PermissionGuard moduleId="promo_codes" action="write">
                              <Button variant="outline" size="icon" onClick={() => handleEditPromoCode(promo)} disabled={isSubmitting}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGuard>
                            <PermissionGuard moduleId="promo_codes" action="delete">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete the promo code "{promo.code}".
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeletePromoCode(promo.id!)}
                                      disabled={isSubmitting}
                                      className="bg-destructive hover:bg-destructive/90">
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </PermissionGuard>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingPromoCode(null); } }}>
        <DialogContent className="w-full max-w-3xl p-0 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="p-6 pb-4 border-b bg-muted/20 flex-shrink-0">
            <DialogTitle>{editingPromoCode ? 'Edit Promo Code' : 'Add New Promo Code'}</DialogTitle>
            <DialogDescription>
              {editingPromoCode ? 'Update promo code details and limits.' : 'Create a new discount code for your customers.'}
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
