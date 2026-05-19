"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, UploadCloud, Download, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, writeBatch, query, collectionGroup } from "firebase/firestore";

// Define the list of collections to be exported.
// This list should be updated if new collections are added to the app.
const COLLECTIONS_TO_EXPORT = [
  "webSettings",
  "adminCategories",
  "adminSubCategories",
  "adminServices",
  "adminFAQs",
  "adminPopups",
  "adminPromoCodes",
  "adminReviews",
  "adminSlideshows",
  "adminTaxes",
  "bookings",
  "cities",
  "areas",
  "cityCategorySeoSettings",
  "areaCategorySeoSettings",
  "contactUsSubmissions",
  "popupSubmissions",
  "providerApplications",
  "providerControlOptions",
  "timeSlotCategoryLimits",
  "users",
  "userActivities",
  "userNotifications",
  // Note: 'chats' is a collection with subcollections. Exporting its root might miss the 'messages'.
  // A more complex export would be needed for subcollections. For simplicity, we skip subcollections here.
];


export default function DatabaseToolsPage() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    toast({ title: "Starting Export", description: "Fetching data from all collections. This may take a moment..." });

    const exportData: Record<string, any[]> = {};
    try {
      for (const collectionName of COLLECTIONS_TO_EXPORT) {
        const collectionRef = collection(db, collectionName);
        const snapshot = await getDocs(query(collectionRef));
        exportData[collectionName] = snapshot.docs.map(doc => ({
          _id: doc.id, // Use _id to avoid conflict with potential 'id' field in data
          ...doc.data()
        }));
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `firestore-export-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: "Export Successful", description: `Database snapshot has been downloaded.` });
    } catch (error) {
      console.error("Error exporting database:", error);
      toast({ title: "Export Failed", description: (error as Error).message || "Could not export database.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setImportFile(event.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast({ title: "No File Selected", description: "Please select a JSON file to import.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    toast({ title: "Starting Import", description: "Please do not navigate away from this page." });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result as string;
        const importData = JSON.parse(fileContent);

        let totalOperations = 0;
        let batch = writeBatch(db);
        
        for (const collectionName in importData) {
          if (Object.prototype.hasOwnProperty.call(importData, collectionName)) {
            const documents = importData[collectionName];
            if (Array.isArray(documents)) {
              for (const docData of documents) {
                const { _id, ...data } = docData;
                const docRef = doc(db, collectionName, _id);
                batch.set(docRef, data);
                totalOperations++;

                // Firestore allows a maximum of 500 operations in a single batch.
                if (totalOperations % 499 === 0) {
                  await batch.commit();
                  batch = writeBatch(db); // Start a new batch
                }
              }
            }
          }
        }
        
        // Commit the final batch if it has any operations
        if (totalOperations % 499 !== 0 || totalOperations === 0) {
           await batch.commit();
        }

        toast({ title: "Import Successful", description: `Successfully imported ${totalOperations} documents.` });
      } catch (error) {
        console.error("Error importing database:", error);
        toast({ title: "Import Failed", description: (error as Error).message || "Invalid JSON file or Firestore error.", variant: "destructive" });
      } finally {
        setIsImporting(false);
        setImportFile(null);
        // Reset file input
        const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }
    };
    reader.onerror = () => {
        toast({ title: "File Read Error", description: "Could not read the selected file.", variant: "destructive" });
        setIsImporting(false);
    };
    reader.readAsText(importFile);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Database className="mr-2 h-6 w-6 text-primary" /> Firestore Database Tools
          </CardTitle>
          <CardDescription>
            Export your entire Firestore database to a JSON file or import a previously exported file.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Database</CardTitle>
          <CardDescription>
            Download a complete snapshot of all specified collections as a single JSON file. This is useful for backups or migrating data.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important Note on Exporting</AlertTitle>
              <AlertDescription>
                This tool exports predefined top-level collections. It does not handle nested subcollections within documents (e.g., chat messages). For complete backups, use the official Google Cloud Platform (GCP) Firestore export feature.
              </AlertDescription>
            </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {isExporting ? "Exporting..." : "Export Database to JSON"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Database</CardTitle>
          <CardDescription>
            Import data from a JSON file that was previously exported using this tool.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning: This is a Destructive Action</AlertTitle>
              <AlertDescription>
                Importing will <span className="font-bold">overwrite</span> any existing documents with the same ID in the target collections. There is no undo. It is highly recommended to perform an export first.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
                <Label htmlFor="import-file-input">Select JSON File</Label>
                <Input id="import-file-input" type="file" accept=".json" onChange={handleFileChange} disabled={isImporting} />
            </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleImport} disabled={isImporting || !importFile}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            {isImporting ? "Importing..." : "Import and Overwrite Data"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
