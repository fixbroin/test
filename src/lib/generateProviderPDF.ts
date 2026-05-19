"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import type { ProviderApplication, KycDocument, BankDetails, CompanyDetailsForPdf } from '@/types/firestore';
import { Timestamp } from 'firebase/firestore';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const formatTimestampToReadable = (timestamp?: Timestamp | Date | string): string => {
  if (!timestamp) return "N/A";
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    try {
      date = new Date(timestamp);
      if (isNaN(date.getTime())) throw new Error("Invalid date string");
    } catch (e) {
      return String(timestamp); // Fallback
    }
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const addSectionTitle = (doc: jsPDF, title: string, yPos: number): number => {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, yPos);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return yPos + 7;
};

const addDetail = (doc: jsPDF, label: string, value: string | string[] | undefined | null, yPos: number): number => {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    value = "N/A";
  }
  const text = `${label}: ${Array.isArray(value) ? value.join(', ') : value}`;
  const splitText = doc.splitTextToSize(text, 180);
  doc.text(splitText, 14, yPos);
  return yPos + (splitText.length * 5);
};

async function getImageDataUri(url: string): Promise<{ dataUri: string; format: string } | null> {
  if (!url || !url.startsWith('http')) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch image from ${url}: ${response.statusText}`);
      return null;
    }
    const blob = await response.blob();
    const format = blob.type.split('/')[1]?.toUpperCase() || 'JPEG'; // e.g., JPEG, PNG
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ dataUri: reader.result as string, format });
      reader.onerror = (error) => {
        console.error(`FileReader error for ${url}:`, error);
        reject(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error fetching or converting image ${url}:`, error);
    return null;
  }
}

const checkAndAddPage = (doc: jsPDF, currentY: number, neededHeight: number): number => {
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 20;
  if (currentY + neededHeight > pageHeight - bottomMargin) {
    doc.addPage();
    return 20; // New page yStart
  }
  return currentY;
};

const addImageToPdf = async (
  doc: jsPDF,
  imageUrl: string | undefined | null,
  label: string,
  currentY: number,
  imageWidthMm = 50, 
  imageMaxHeightMm = 35
): Promise<number> => {
  let newY = currentY;
  if (imageUrl) {
    newY = checkAndAddPage(doc, newY, imageMaxHeightMm + 10); 
    doc.setFontSize(9);
    doc.text(label, 14, newY);
    newY += 4;
    const imageData = await getImageDataUri(imageUrl);
    if (imageData) {
      try {
        const imgProps = doc.getImageProperties(imageData.dataUri);
        const aspectRatio = imgProps.width / imgProps.height;
        let pdfImgWidth = imageWidthMm;
        let pdfImgHeight = imageWidthMm / aspectRatio;

        if (pdfImgHeight > imageMaxHeightMm) {
          pdfImgHeight = imageMaxHeightMm;
          pdfImgWidth = imageMaxHeightMm * aspectRatio;
        }
        newY = checkAndAddPage(doc, newY, pdfImgHeight + 2); 
        doc.addImage(imageData.dataUri, imageData.format, 14, newY, pdfImgWidth, pdfImgHeight);
        newY += pdfImgHeight + 5; 
      } catch (e) {
        console.error(`Error adding image ${label} to PDF:`, e);
        doc.text(`(Image for ${label} could not be loaded)`, 14, newY);
        newY += 5;
      }
    } else {
      doc.text(`(Image for ${label} not available or failed to load)`, 14, newY);
      newY += 5;
    }
  } else {
    newY = checkAndAddPage(doc, newY, 10);
    doc.setFontSize(9);
    doc.text(`${label}: Not provided`, 14, newY);
    newY += 5;
  }
  return newY;
};


export const generateProviderApplicationPdf = async (
  application: ProviderApplication,
  companyDetails?: CompanyDetailsForPdf
): Promise<string> => {
  const doc = new jsPDF();
  let y = 22;

  const defaultCompanyDetails: CompanyDetailsForPdf = {
    name: companyDetails?.name || "FixBro.in",
    address: companyDetails?.address || "Company Address Placeholder",
    contactEmail: companyDetails?.contactEmail || 'support@example.com',
    contactMobile: companyDetails?.contactMobile || '+91-XXXXXXXXXX',
    logoUrl: companyDetails?.logoUrl,
  };

  // Company Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(defaultCompanyDetails.name, 14, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  y += 6;
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 80);
  doc.text(addressLines, 14, y);
  y += (addressLines.length * 4) + 2;
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, y);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Provider Application Details", 196, y - 10, { align: "right" });
  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  doc.setFontSize(11);
  doc.text(`Application ID: ${application.id || 'N/A'}`, 196, y, { align: "right" });
  y += 5;
  doc.text(`Status: ${application.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`, 196, y, { align: "right" });
  y += 10;

  // Personal Information
  y = checkAndAddPage(doc, y, 40);
  y = addSectionTitle(doc, "Personal Information", y);
  if (application.profilePhotoUrl) {
    y = await addImageToPdf(doc, application.profilePhotoUrl, "Profile Photo", y, 30, 30);
  }
  y = addDetail(doc, "Full Name", application.fullName, y);
  y = addDetail(doc, "Email", application.email, y);
  y = addDetail(doc, "Mobile Number", application.mobileNumber, y);
  y = addDetail(doc, "Alternate Mobile", application.alternateMobile, y);
  y = addDetail(doc, "Address", application.address, y);
  y = addDetail(doc, "Age", application.age?.toString(), y);
  y = addDetail(doc, "Qualification", application.qualificationLabel, y);
  y = addDetail(doc, "Languages Spoken", application.languagesSpokenLabels, y);
  y += 5;

  // Work Information
  y = checkAndAddPage(doc, y, 30);
  y = addSectionTitle(doc, "Work Information", y);
  y = addDetail(doc, "Primary Work Category", application.workCategoryName, y);
  y = addDetail(doc, "Experience Level", application.experienceLevelLabel, y);
  y = addDetail(doc, "Skill Level", application.skillLevelLabel, y);
  if (application.bio) {
    y = checkAndAddPage(doc, y, 15);
    doc.text("Bio:", 14, y);
    y += 5;
    const bioLines = doc.splitTextToSize(application.bio, 180);
    doc.text(bioLines, 14, y);
    y += (bioLines.length * 5) + 5;
  }
  y += 5;

  // KYC Documents
  y = checkAndAddPage(doc, y, 20);
  y = addSectionTitle(doc, "KYC Documents", y);
  
  y = addDetail(doc, "Aadhaar Number", application.aadhaar?.docNumber, y);
  y = await addImageToPdf(doc, application.aadhaar?.frontImageUrl, "Aadhaar - Front", y);
  y = await addImageToPdf(doc, application.aadhaar?.backImageUrl, "Aadhaar - Back", y);
  y = addDetail(doc, "Aadhaar Status", application.aadhaar?.verified ? "Verified" : "Pending", y);
  y += 3;

  y = addDetail(doc, "PAN Number", application.pan?.docNumber, y);
  y = await addImageToPdf(doc, application.pan?.frontImageUrl, "PAN Card - Front", y);
  y = addDetail(doc, "PAN Status", application.pan?.verified ? "Verified" : "Pending", y);
  y += 5;

  if (application.additionalDocuments && application.additionalDocuments.length > 0) {
    y = checkAndAddPage(doc, y, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Additional Documents:", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const optDoc of application.additionalDocuments) {
      y = checkAndAddPage(doc, y, 10);
      y = addDetail(doc, optDoc.docLabel || optDoc.docType || "Document", optDoc.docNumber, y);
      y = await addImageToPdf(doc, optDoc.frontImageUrl, `${optDoc.docLabel || optDoc.docType || "Optional Doc"} - Front`, y);
      y = await addImageToPdf(doc, optDoc.backImageUrl, `${optDoc.docLabel || optDoc.docType || "Optional Doc"} - Back`, y);
      y = addDetail(doc, `${optDoc.docLabel || optDoc.docType || "Optional Doc"} Status`, optDoc.verified ? "Verified" : "Pending", y);
      y += 3;
    }
  }
  y += 5;

  // Work Location & Bank Details
  y = checkAndAddPage(doc, y, 20);
  y = addSectionTitle(doc, "Work Location & Bank Details", y);
  y = addDetail(doc, "Work Area Center", application.workAreaCenter ? `${application.workAreaCenter.latitude.toFixed(4)}, ${application.workAreaCenter.longitude.toFixed(4)}` : "N/A", y);
  y = addDetail(doc, "Service Radius", application.workAreaRadiusKm ? `${application.workAreaRadiusKm} km` : "N/A", y);
  y += 3; 

  if (application.bankDetails) {
    const bank = application.bankDetails;
    y = addDetail(doc, "Bank Name", bank.bankName, y);
    y = addDetail(doc, "Account Holder", bank.accountHolderName, y);
    y = addDetail(doc, "Account Number", bank.accountNumber, y);
    y = addDetail(doc, "IFSC Code", bank.ifscCode, y);
    y = await addImageToPdf(doc, bank.cancelledChequeUrl, "Cancelled Cheque", y);
    y = addDetail(doc, "Bank Details Status", bank.verified ? "Verified" : "Pending", y);
  } else {
    y = addDetail(doc, "Bank Details", "Not Provided", y);
  }
  y += 5;

  // Digital Consent & Signature
  y = checkAndAddPage(doc, y, 65);
  y = addSectionTitle(doc, "Digital Consent & Agreement", y);
  
  doc.setFontSize(9);
  doc.setTextColor(80);
  const consentText = `I, ${application.fullName || 'the applicant'}, hereby declare that I have read, understood, and agreed to the Terms and Conditions of FixBro. I confirm that all information provided in this application is true and accurate to the best of my knowledge. I understand that any false information may lead to the rejection of my application or termination of my partnership. I provide my digital consent below as a formal agreement.`;
  const splitConsent = doc.splitTextToSize(consentText, 180);
  doc.text(splitConsent, 14, y);
  y += (splitConsent.length * 5) + 5;

  doc.setTextColor(0);
  if (application.termsConfirmedAt) {
    y = addDetail(doc, "Agreed On", formatTimestampToReadable(application.termsConfirmedAt), y);
  }

  y = await addImageToPdf(doc, application.signatureUrl, "Digital Signature", y, 60, 25);
  y += 5;


  if (application.adminReviewNotes) {
    y = checkAndAddPage(doc, y, 15);
    y = addSectionTitle(doc, "Admin Review Notes", y);
    const notesLines = doc.splitTextToSize(application.adminReviewNotes, 180);
    doc.text(notesLines, 14, y);
    y += (notesLines.length * 5) + 5;
  }

  // Footer Metadata
  doc.setFontSize(8);
  doc.setTextColor(150);
  y = checkAndAddPage(doc, y, 10);
  if (application.createdAt) {
    doc.text(`Application Created: ${formatTimestampToReadable(application.createdAt)}`, 14, y);
    y += 4;
  }
  if (application.updatedAt) {
    y = checkAndAddPage(doc, y, 5);
    doc.text(`Last Updated: ${formatTimestampToReadable(application.updatedAt)}`, 14, y);
  }

  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 10);
  }

  return doc.output('datauristring');
};
