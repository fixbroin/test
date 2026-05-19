
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, HelpCircle, CheckCircle, XCircle } from "lucide-react";
import type { FirestoreFAQ } from '@/types/firestore';
import FAQForm from '@/components/admin/FAQForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { triggerRefresh } from '@/lib/revalidateUtils';



export default function AdminFAQPage() {
  const [faqs, setFaqs] = useState<FirestoreFAQ[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<FirestoreFAQ | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const faqsCollectionRef = collection(db, "adminFAQs");

  const fetchFAQs = async () => {
    setIsLoading(true);
    try {
      const q = query(faqsCollectionRef, orderBy("order", "asc"));
      const data = await getDocs(q);
      const fetchedFAQs = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreFAQ));
      setFaqs(fetchedFAQs);
    } catch (error) {
      console.error("Error fetching FAQs: ", error);
      toast({
        title: "Error",
        description: "Could not fetch FAQs.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchFAQs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddFAQ = () => {
    setEditingFAQ(null);
    setIsFormOpen(true);
  };

  const handleEditFAQ = (faq: FirestoreFAQ) => {
    setEditingFAQ(faq);
    setIsFormOpen(true);
  };

  const handleDeleteFAQ = async (faqId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminFAQs", faqId));
      setFaqs(faqs.filter(faq => faq.id !== faqId));
      toast({ title: "Success", description: "FAQ deleted successfully." });
      await triggerRefresh('faqs');
      await triggerRefresh('sitemap');
      // Removed global-cache trigger to save reads
    } catch (error) {
      console.error("Error deleting FAQ: ", error);
      toast({ title: "Error", description: "Could not delete FAQ.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreFAQ, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    
    const payloadForFirestore: Omit<FirestoreFAQ, 'id' | 'createdAt' | 'updatedAt'> = {
      question: data.question,
      answer: data.answer,
      order: Number(data.order),
      isActive: data.isActive === undefined ? true : data.isActive,
    };

    try {
      if (editingFAQ && data.id) { 
        const faqDoc = doc(db, "adminFAQs", data.id);
        await updateDoc(faqDoc, { ...payloadForFirestore, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "FAQ updated successfully." });
      } else { 
        await addDoc(faqsCollectionRef, { ...payloadForFirestore, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "FAQ added successfully." });
      }
      await triggerRefresh('faqs');
      await triggerRefresh('sitemap');
      // Removed global-cache trigger to save reads
      setIsFormOpen(false);
      setEditingFAQ(null);
      await fetchFAQs(); 
    } catch (error) {
      console.error("Error saving FAQ: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save FAQ.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center"><HelpCircle className="mr-2 h-6 w-6 text-primary" />Manage FAQs</CardTitle>
            <CardDescription>Loading FAQs...</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
            <div className="animate-pulse h-20 bg-muted rounded w-full mt-4"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><HelpCircle className="mr-2 h-6 w-6 text-primary" />Manage FAQs</CardTitle>
            <CardDescription>Add, edit, or delete Frequently Asked Questions.</CardDescription>
          </div>
          <Button onClick={handleAddFAQ} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New FAQ
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading FAQs...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Answer (excerpt)</TableHead>
                  <TableHead className="text-center">Order</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faqs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      No FAQs found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  faqs.map((faq) => (
                    <TableRow key={faq.id}>
                      <TableCell className="font-medium max-w-xs truncate" title={faq.question}>{faq.question}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-sm truncate" title={faq.answer}>
                        {faq.answer}
                      </TableCell>
                      <TableCell className="text-center">{faq.order}</TableCell>
                      <TableCell className="text-center">
                        {faq.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <Button variant="outline" size="icon" onClick={() => handleEditFAQ(faq)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the FAQ: "{faq.question.substring(0, 50)}...".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteFAQ(faq.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Delete
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

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingFAQ(null); } }}>
        <DialogContent className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
           <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>{editingFAQ ? 'Edit FAQ' : 'Add New FAQ'}</DialogTitle>
            <DialogDescription>
              {editingFAQ ? 'Update the details for this FAQ.' : 'Fill in the details for a new FAQ.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <FAQForm
                onSubmit={handleFormSubmit}
                initialData={editingFAQ}
                onCancel={() => {
                setIsFormOpen(false);
                setEditingFAQ(null);
                }}
                isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
