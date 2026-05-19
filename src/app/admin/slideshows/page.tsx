
"use client";

import { useState, useEffect } from 'react';
import AppImage from '@/components/ui/AppImage';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, PlaySquare, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { FirestoreSlide, SlideButtonLinkType, FirestoreCategory, FirestoreSubCategory, FirestoreService } from '@/types/firestore';
import SlideshowForm from '@/components/admin/SlideshowForm';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { triggerRefresh } from '@/lib/revalidateUtils';



const isFirebaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.includes("firebasestorage.googleapis.com");
};

export default function AdminSlideshowsPage() {
  const [slides, setSlides] = useState<FirestoreSlide[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [services, setServices] = useState<FirestoreService[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<FirestoreSlide | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const slidesCollectionRef = collection(db, "adminSlideshows");

  const fetchDataForForm = async () => {
    try {
      const catPromise = getDocs(query(collection(db, "adminCategories"), orderBy("name")));
      const subCatPromise = getDocs(query(collection(db, "adminSubCategories"), orderBy("name")));
      const servPromise = getDocs(query(collection(db, "adminServices"), orderBy("name")));

      const [catSnap, subCatSnap, servSnap] = await Promise.all([catPromise, subCatPromise, servPromise]);
      
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreCategory)));
      setSubCategories(subCatSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreSubCategory)));
      setServices(servSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreService)));
    } catch (error) {
      console.error("Error fetching data for slideshow form: ", error);
      toast({ title: "Error", description: "Could not load data needed for the slideshow form.", variant: "destructive" });
    }
  };

  const fetchSlides = async () => {
    setIsLoading(true);
    try {
      const q = query(slidesCollectionRef, orderBy("order", "asc"));
      const data = await getDocs(q);
      const fetchedSlides = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreSlide));
      setSlides(fetchedSlides);
    } catch (error) {
      console.error("Error fetching slides: ", error);
      toast({ title: "Error", description: "Could not fetch slides.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    setIsMounted(true);
    fetchSlides();
    fetchDataForForm(); // Fetch data needed for the form dropdowns
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSlide = () => {
    setEditingSlide(null);
    setIsFormOpen(true);
  };

  const handleEditSlide = (slide: FirestoreSlide) => {
    setEditingSlide(slide);
    setIsFormOpen(true);
  };

  const handleDeleteSlide = async (slideId: string) => {
    setIsSubmitting(true);
    try {
      const slideDocRef = doc(db, "adminSlideshows", slideId);
      const slideSnap = await getDoc(slideDocRef);
      const slideData = slideSnap.data() as FirestoreSlide | undefined;

      if (slideData?.imageUrl && isFirebaseStorageUrl(slideData.imageUrl)) {
        try {
          const imageToDeleteRef = storageRef(storage, slideData.imageUrl);
          await deleteObject(imageToDeleteRef);
        } catch (imgError: any) {
          console.warn("Error deleting image from Firebase Storage during slide delete:", imgError);
          // Non-fatal, proceed with doc deletion
        }
      }
      await deleteDoc(slideDocRef);
      setSlides(slides.filter(s => s.id !== slideId));
      toast({ title: "Success", description: "Slide deleted successfully." });
      await triggerRefresh('slideshows');
      await triggerRefresh('sitemap');
      // Removed global-cache trigger to save reads
    } catch (error) {
      console.error("Error deleting slide: ", error);
      toast({ title: "Error", description: "Could not delete slide.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreSlide, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    
    const finalImageUrl = data.imageUrl || ""; // This should be set by the form's image handling logic

    const payloadForFirestore: Omit<FirestoreSlide, 'id' | 'createdAt' | 'updatedAt'> = {
      title: data.title || "",
      description: data.description || "",
      imageUrl: finalImageUrl,
      imageHint: data.imageHint || "",
      order: Number(data.order),
      buttonText: data.buttonText || "",
      buttonLinkType: (data.buttonText?.trim() || (data.buttonLinkType && data.buttonLinkValue?.trim())) ? data.buttonLinkType : null,
      buttonLinkValue: (data.buttonText?.trim() || (data.buttonLinkType && data.buttonLinkValue?.trim())) ? data.buttonLinkValue : null,
      isActive: data.isActive === undefined ? true : data.isActive,
    };
    
    try {
      if (editingSlide && data.id) { 
        const slideDoc = doc(db, "adminSlideshows", data.id);
        await updateDoc(slideDoc, { ...payloadForFirestore, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Slide updated successfully." });
      } else { 
        await addDoc(slidesCollectionRef, { ...payloadForFirestore, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "Slide added successfully." });
      }
      await triggerRefresh('slideshows');
      await triggerRefresh('sitemap');
      // Removed global-cache trigger to save reads
      setIsFormOpen(false);
      setEditingSlide(null);
      await fetchSlides(); 
    } catch (error) {
      console.error("Error saving slide: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save slide.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getButtonLinkDisplay = (slide: FirestoreSlide): string => {
    const linkType = slide.buttonLinkType;
    const linkValue = slide.buttonLinkValue;
    const hasButtonText = slide.buttonText && slide.buttonText.trim() !== "";

    if (!linkType || !linkValue?.trim()) {
      return hasButtonText ? "Button Link Not Set" : "No Link";
    }

    const prefix = hasButtonText ? "Button Link: " : "Image Link: ";

    if (linkType === 'url') return `${prefix}${linkValue}`;
    if (linkType === 'category') {
      const cat = categories.find(c => c.slug === linkValue || c.id === linkValue);
      return `${prefix}Category: ${cat ? cat.name : linkValue}`;
    }
    if (linkType === 'subcategory') {
      const subCat = subCategories.find(sc => sc.slug === linkValue || sc.id === linkValue);
      return `${prefix}Sub-Category: ${subCat ? subCat.name : linkValue}`;
    }
    if (linkType === 'service') {
      const serv = services.find(s => s.slug === linkValue || s.id === linkValue);
      return `${prefix}Service: ${serv ? serv.name : linkValue}`;
    }
    return `${prefix}${linkValue}`;
  };


  if (!isMounted) {
     return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center"><PlaySquare className="mr-2 h-6 w-6 text-primary" /> Manage Slideshow</CardTitle>
              <CardDescription>Loading slideshow settings...</CardDescription>
            </div>
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
            <CardTitle className="text-2xl flex items-center"><PlaySquare className="mr-2 h-6 w-6 text-primary" /> Manage Slideshow</CardTitle>
            <CardDescription>Add, edit, or delete slides for the homepage hero carousel.</CardDescription>
          </div>
          <Button onClick={handleAddSlide} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Slide
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading slides...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Image</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Order</TableHead>
                  <TableHead className="hidden lg:table-cell">Button Text</TableHead>
                  <TableHead className="max-w-[100px] sm:max-w-[150px] md:max-w-[200px] truncate">Link Target</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[80px] sm:min-w-[100px] md:min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slides.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No slides found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  slides.map((slide) => (
                    <TableRow key={slide.id}>
                      <TableCell>
                        {slide.imageUrl ? (
                          <div className="w-16 h-10 relative rounded-md overflow-hidden">
                            <AppImage 
                              src={slide.imageUrl} 
                              alt={slide.title || "Slide Image"} 
                              fill 
                              sizes="64px"
                              className="object-cover"
                              aiHint={slide.imageHint || "slideshow"}
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-10 bg-muted rounded-md flex items-center justify-center">
                             <PlaySquare className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{slide.title || "N/A"}</TableCell>
                      <TableCell className="text-center hidden md:table-cell">{slide.order}</TableCell>
                      <TableCell className="hidden lg:table-cell">{slide.buttonText || "N/A"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[100px] sm:max-w-[150px] md:max-w-[200px] truncate" title={getButtonLinkDisplay(slide)}>
                        {getButtonLinkDisplay(slide)}
                      </TableCell>
                      <TableCell className="text-center">
                        {slide.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <Button variant="outline" size="icon" onClick={() => handleEditSlide(slide)} disabled={isSubmitting}>
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
                                  This will permanently delete the slide "{slide.title || 'Untitled Slide'}"
                                  {slide.imageUrl && isFirebaseStorageUrl(slide.imageUrl) ? " and its image." : "."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteSlide(slide.id)}
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

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingSlide(null); } }}>
        <DialogContent className="w-[90vw] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingSlide ? 'Edit Slide' : 'Add New Slide'}</DialogTitle>
            <DialogDescription>
              {editingSlide ? 'Update the details for this slide.' : 'Fill in the details for a new slide.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto">
            <SlideshowForm
                onSubmit={handleFormSubmit}
                initialData={editingSlide}
                categories={categories}
                subCategories={subCategories}
                services={services}
                onCancel={() => { setIsFormOpen(false); setEditingSlide(null); }}
                isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
    
    
