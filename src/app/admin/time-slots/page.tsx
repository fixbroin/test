
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, ListChecks, XCircle } from "lucide-react";
import type { FirestoreCategory, TimeSlotCategoryLimit } from '@/types/firestore';
import TimeSlotCategoryLimitForm from '@/components/admin/TimeSlotCategoryLimitForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";



export default function AdminTimeSlotLimitsPage() {
  const [limits, setLimits] = useState<TimeSlotCategoryLimit[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLimit, setEditingLimit] = useState<TimeSlotCategoryLimit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const limitsCollectionRef = collection(db, "timeSlotCategoryLimits");
  const categoriesCollectionRef = collection(db, "adminCategories");

  const fetchCategoriesAndLimits = async () => {
    setIsLoading(true);
    try {
      const categoriesQuery = query(categoriesCollectionRef, orderBy("name", "asc"));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      const fetchedCategories = categoriesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
      setCategories(fetchedCategories);

      // Use onSnapshot for real-time updates on limits
      const unsubscribeLimits = onSnapshot(query(limitsCollectionRef, orderBy("categoryName", "asc")), (snapshot) => {
        const fetchedLimits = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TimeSlotCategoryLimit));
        setLimits(fetchedLimits);
        setIsLoading(false); // Set loading to false after initial fetch/update
      }, (error) => {
        console.error("Error fetching time slot limits: ", error);
        toast({ title: "Error", description: "Could not fetch time slot limits.", variant: "destructive" });
        setIsLoading(false);
      });
      return unsubscribeLimits; // Return unsubscribe function for cleanup

    } catch (error) {
      console.error("Error fetching initial data: ", error);
      toast({ title: "Error", description: "Could not load page data.", variant: "destructive" });
      setIsLoading(false);
    }
    return () => {}; // Return empty unsubscribe if initial try fails
  };

  useEffect(() => {
    let unsubscribe = () => {};
    fetchCategoriesAndLimits().then(unsub => {
        if (unsub) unsubscribe = unsub;
    });
    return () => unsubscribe(); // Cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddLimit = () => {
    setEditingLimit(null);
    setIsFormOpen(true);
  };

  const handleEditLimit = (limit: TimeSlotCategoryLimit) => {
    setEditingLimit(limit);
    setIsFormOpen(true);
  };

  const handleDeleteLimit = async (limitId: string) => {
    if (!limitId) {
        toast({ title: "Error", description: "Limit ID is missing.", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "timeSlotCategoryLimits", limitId));
      toast({ title: "Success", description: "Time slot limit deleted successfully." });
      // Real-time updates from onSnapshot will refresh the list
    } catch (error) {
      console.error("Error deleting limit: ", error);
      toast({ title: "Error", description: "Could not delete limit.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async () => {
    // Form submission is now handled within TimeSlotCategoryLimitForm
    // It calls onSubmitProp which triggers a Firestore update/add.
    // onSnapshot will then update the 'limits' state automatically.
    setIsFormOpen(false);
    setEditingLimit(null);
    // No explicit fetchLimits needed here due to onSnapshot
  };

  if (isLoading && categories.length === 0) { // Show loader if categories are not yet fetched
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading time slot configurations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><ListChecks className="mr-2 h-6 w-6 text-primary" />Time Slot Category Limits</CardTitle>
            <CardDescription>
              Manage how many bookings can be made for a specific category within the same time slot.
            </CardDescription>
          </div>
          <Button onClick={handleAddLimit} disabled={isSubmitting || categories.length === 0} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Limit
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
             <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading limits...</p>
            </div>
          ) : categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No categories found. Please add categories first to set time slot limits.
            </p>
          ) : limits.length === 0 ? (
             <p className="text-muted-foreground text-center py-6">
              No time slot limits configured yet. Click "Add New Limit" to start.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category Name</TableHead>
                  <TableHead className="text-center">Max Concurrent Bookings per Slot</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limits.map((limit) => (
                  <TableRow key={limit.id}>
                    <TableCell className="font-medium">{limit.categoryName}</TableCell>
                    <TableCell className="text-center">{limit.maxConcurrentBookings}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                        <Button variant="outline" size="icon" onClick={() => handleEditLimit(limit)} disabled={isSubmitting}>
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
                                This will remove the concurrent booking limit for "{limit.categoryName}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteLimit(limit.id)}
                                disabled={isSubmitting}
                                className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete Limit
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingLimit(null); } }}>
        <DialogContent className="w-full max-w-xs sm:max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>{editingLimit ? 'Edit Time Slot Limit' : 'Add New Time Slot Limit'}</DialogTitle>
            <DialogDescription>
              {editingLimit ? 'Update the limit for this category.' : 'Select a category and set its concurrent booking limit per time slot.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            {categories.length === 0 ? (
                <div className="flex flex-col items-center text-center p-4">
                    <XCircle className="h-10 w-10 text-destructive mb-3"/>
                    <p className="text-lg font-semibold">No Categories Available</p>
                    <p className="text-sm text-muted-foreground">You must add categories before you can set time slot limits for them.</p>
                </div>
            ) : (
                <TimeSlotCategoryLimitForm
                    onSubmitSuccess={handleFormSubmit}
                    initialData={editingLimit}
                    categories={categories}
                    existingLimitCategoryIds={limits.map(l => l.categoryId)}
                    onCancel={() => {
                    setIsFormOpen(false);
                    setEditingLimit(null);
                    }}
                />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
