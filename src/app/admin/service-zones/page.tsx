"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, Globe2, PackageSearch, CheckCircle, XCircle } from "lucide-react";
import type { ServiceZone } from '@/types/firestore';
import ServiceZoneForm, { type ServiceZoneFormData } from '@/components/admin/ServiceZoneForm';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { nanoid } from 'nanoid';

const COLLECTION_NAME = "serviceZones";

export default function AdminServiceZonesPage() {
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ServiceZone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchZones = useCallback(() => {
    setIsLoading(true);
    const zonesCollectionRef = collection(db, COLLECTION_NAME);
    const q = query(zonesCollectionRef, orderBy("name", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedZones = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as ServiceZone));
      setZones(fetchedZones);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching service zones: ", error);
      toast({ title: "Error", description: "Could not fetch service zones.", variant: "destructive" });
      setIsLoading(false);
    });

    return unsubscribe;
  }, [toast]);

  useEffect(() => {
    const unsubscribe = fetchZones();
    return () => unsubscribe();
  }, [fetchZones]);

  const handleAddZone = () => {
    setEditingZone(null);
    setIsFormOpen(true);
  };

  const handleEditZone = (zone: ServiceZone) => {
    setEditingZone(zone);
    setIsFormOpen(true);
  };

  const handleDeleteZone = async (zoneId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, zoneId));
      toast({ title: "Success", description: "Service zone deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete service zone.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: ServiceZoneFormData) => {
    setIsSubmitting(true);
    const payload: Omit<ServiceZone, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      center: {
        latitude: data.center.lat,
        longitude: data.center.lng,
      },
      radiusKm: data.radiusKm,
      isActive: data.isActive,
    };

    try {
      if (editingZone) {
        const zoneDoc = doc(db, COLLECTION_NAME, editingZone.id);
        await updateDoc(zoneDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Service zone updated." });
      } else {
        await addDoc(collection(db, COLLECTION_NAME), { ...payload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "New service zone created." });
      }
      setIsFormOpen(false);
      setEditingZone(null);
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not save service zone.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><Globe2 className="mr-2 h-6 w-6 text-primary" />Manage Service Zones</CardTitle>
            <CardDescription>Define geographic areas where your services are available.</CardDescription>
          </div>
          <Button onClick={handleAddZone} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Zone
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading zones...</p>
            </div>
          ) : zones.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No service zones defined yet. Add one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone Name</TableHead>
                  <TableHead>Center (Lat, Lng)</TableHead>
                  <TableHead className="text-center">Radius (km)</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="font-medium">{zone.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{zone.center.latitude.toFixed(4)}, {zone.center.longitude.toFixed(4)}</TableCell>
                    <TableCell className="text-center">{zone.radiusKm}</TableCell>
                    <TableCell className="text-center">
                      {zone.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => handleEditZone(zone)} disabled={isSubmitting}>
                          <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the zone "{zone.name}".</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteZone(zone.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
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

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingZone(null); } }}>
        <DialogContent className="w-full max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle>{editingZone ? 'Edit Service Zone' : 'Add New Service Zone'}</DialogTitle>
            <DialogDescription>Use the map to select the center and define the radius of the service area.</DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto">
            <ServiceZoneForm
              onSubmit={handleFormSubmit}
              initialData={editingZone}
              onCancel={() => { setIsFormOpen(false); setEditingZone(null); }}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
