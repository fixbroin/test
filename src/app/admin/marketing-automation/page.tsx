
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, Save, Send, Mail, Users, ShoppingCart, Repeat, Megaphone, Layers } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import type { MarketingAutomationSettings, AutomationDelay as AutomationDelayType, FirestoreService, FirestoreCategory } from '@/types/firestore';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { sendMarketingEmail } from '@/ai/flows/sendMarketingEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SendManualEmailForm from '@/components/admin/marketing/SendManualEmailForm';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { getBaseUrl } from '@/lib/config';
import PermissionGuard from '@/components/admin/PermissionGuard';

const MARKETING_AUTOMATION_COLLECTION = "webSettings";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation";

const automationDelaySchema = z.object({
  days: z.coerce.number().min(0, "Must be non-negative.").default(0),
  hours: z.coerce.number().min(0, "Must be non-negative.").max(23, "Max 23 hours.").default(0),
  minutes: z.coerce.number().min(0, "Must be non-negative.").max(59, "Max 59 minutes.").default(0),
}).refine(data => (data.days + data.hours + data.minutes) > 0, {
  message: "At least one delay value must be set.",
  path: ["days"], 
});

const marketingAutomationSchema = z.object({
  noBookingReminderEnabled: z.boolean().default(false),
  noBookingReminderDelay: automationDelaySchema.optional(),
  noBookingReminderTemplate: z.string().max(2000).optional(),
  noBookingReminderCategoryId: z.string().optional(),
  
  abandonedCartEnabled: z.boolean().default(false),
  abandonedCartDelay: automationDelaySchema.optional(),
  abandonedCartTemplate: z.string().max(2000).optional(),
  abandonedCartCategoryId: z.string().optional(),
  
  recurringEngagementEnabled: z.boolean().default(false),
  recurringEngagementDelay: automationDelaySchema.optional(),
  recurringEngagementTemplate: z.string().max(2000).optional(),
  recurringEngagementCategoryId: z.string().optional(),
});

type MarketingAutomationFormData = z.infer<typeof marketingAutomationSchema>;

const defaultMarketingAutomationSettings: Omit<MarketingAutomationSettings, 'updatedAt'> = {
    noBookingReminderEnabled: false,
    noBookingReminderDelay: { days: 1, hours: 0, minutes: 0 },
    noBookingReminderTemplate: "Hi {{name}},\n\nWe noticed you haven't booked a service yet. Is there anything we can help you find?\n\nExplore our popular services: {{popular_services}}\n\nThanks,\nThe FixBro Team",
    noBookingReminderCategoryId: "none",

    abandonedCartEnabled: false,
    abandonedCartDelay: { days: 0, hours: 6, minutes: 0 },
    abandonedCartTemplate: "Hi {{name}},\n\nYou left something in your cart! Complete your booking now before the time slot gets taken.\n\nItem: {{cart_item_name}}\n\nComplete Booking: {{cart_link}}",
    abandonedCartCategoryId: "none",

    recurringEngagementEnabled: false,
    recurringEngagementDelay: { days: 15, hours: 0, minutes: 0 },
    recurringEngagementTemplate: "Hi {{name}},\n\nJust a friendly check-in from FixBro! We're always here for your home service needs. Check out our popular services in {{city}}:\n\n{{popular_services}}\n\nHave a great week!",
    recurringEngagementCategoryId: "none",
};

export default function MarketingAutomationPage() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const { settings: globalSettings } = useGlobalSettings();
  const { user: adminUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestSending, setIsTestSending] = useState(false);
  const [allCategories, setAllCategories] = useState<FirestoreCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);


  const form = useForm<MarketingAutomationFormData>({
    resolver: zodResolver(marketingAutomationSchema),
    defaultValues: defaultMarketingAutomationSettings,
  });
  
  useEffect(() => {
    const fetchSelectData = async () => {
      setIsLoadingCategories(true);
      try {
        const catQuery = query(collection(db, "adminCategories"), orderBy("name", "asc"));
        const catSnapshot = await getDocs(catQuery);
        setAllCategories(catSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory)));
      } catch (error) {
        toast({ title: "Error", description: "Could not load categories for dropdowns.", variant: "destructive" });
      } finally {
        setIsLoadingCategories(false);
      }
    };
    fetchSelectData();
  }, [toast]);


  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, MARKETING_AUTOMATION_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as MarketingAutomationSettings;
        form.reset({ 
            ...defaultMarketingAutomationSettings, 
            ...data,
        });
      } else {
        form.reset(defaultMarketingAutomationSettings);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: MarketingAutomationFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, MARKETING_AUTOMATION_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      const dataToSave: MarketingAutomationSettings = {
        ...data,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('marketing-settings');
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Marketing automation settings have been saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleTestSend = async (subjectTemplate: string, bodyTemplate: string, categoryIdForTest?: string) => {
    if (!adminUser?.email) return;
    setIsTestSending(true);
    toast({ title: "Sending Test...", description: `Sending test email to ${adminUser.email}`});
    
    try {
        const baseUrl = getBaseUrl();
        const popularServicesQuery = query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("rating", "desc"), limit(5));
        const popularServicesSnap = await getDocs(popularServicesQuery);
        const popularServicesHtml = `<ul>${popularServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
        
        const popularCategoriesQuery = query(collection(db, "adminCategories"), orderBy('order', 'asc'), limit(5));
        const popularCategoriesSnap = await getDocs(popularCategoriesQuery);
        const popularCategoriesHtml = `<ul>${popularCategoriesSnap.docs.map(doc => `<li><a href="${baseUrl}/category/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;

        const allServicesSnap = await getDocs(query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("name", "asc")));
        const allServicesHtml = `<ul>${allServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
        
        const allCategoriesSnap = await getDocs(query(collection(db, "adminCategories"), orderBy("order", "asc")));
        const allCategoriesHtml = `<ul>${allCategoriesSnap.docs.map(doc => `<li><a href="${baseUrl}/category/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
        
        const cartContentHtml = `<ul><li>Sample Service A (x1)</li><li>Sample Service B (x2)</li></ul>`;
        
        let categoryServicesHtml = 'No services for this category found (or category not selected).';
        const finalCategoryIdForTest = categoryIdForTest && categoryIdForTest !== "none" ? categoryIdForTest : (categoryIdForTest === "cart" ? allCategoriesSnap.docs[0]?.id : undefined);

        if (finalCategoryIdForTest) {
            const subCatsSnap = await getDocs(query(collection(db, "adminSubCategories"), where("parentId", "==", finalCategoryIdForTest)));
            const subCatIds = subCatsSnap.docs.map(doc => doc.id);
            if (subCatIds.length > 0) {
                const categoryServicesSnap = await getDocs(query(collection(db, "adminServices"), where("subCategoryId", "in", subCatIds), where("isActive", "==", true), orderBy("name", "asc")));
                if (!categoryServicesSnap.empty) {
                    categoryServicesHtml = `<ul>${categoryServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
                }
            }
        }
        
        const mergeData = {
          name: adminUser.displayName || 'Admin', email: adminUser.email, mobile: adminUser.phoneNumber || '',
          signupDate: adminUser.metadata.creationTime ? new Date(adminUser.metadata.creationTime).toLocaleDateString('en-IN') : '',
          websiteName: globalSettings.websiteName || 'FixBro', websiteUrl: baseUrl, supportEmail: globalSettings.contactEmail || 'support@example.com',
          companyAddress: globalSettings.address || 'Company Address', popular_services: popularServicesHtml, popular_categories: popularCategoriesHtml,
          all_services: allServicesHtml, all_categories: allCategoriesHtml, category_services: categoryServicesHtml, cart_items: cartContentHtml,
          cart_item_name: "Sample Service A", cart_link: `${baseUrl}/cart`, city: "your city",
        };
        
        let processedBody = bodyTemplate; let processedSubject = subjectTemplate;
        for (const [key, value] of Object.entries(mergeData)) {
            const tag = new RegExp(`{{${key}}}`, 'g');
            processedBody = processedBody.replace(tag, value); processedSubject = processedSubject.replace(tag, value);
        }

        const result = await sendMarketingEmail({
            toEmail: adminUser.email, subject: processedSubject, htmlBody: processedBody.replace(/\n/g, '<br>'),
            smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
        });

        if (result.success) toast({ title: "Test Email Sent", description: result.message });
        else toast({ title: "Test Email Failed", description: result.message, variant: "destructive" });
    } catch (error) { toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally { setIsTestSending(false); }
  };

  const renderDelayInputs = (baseFieldName: "noBookingReminderDelay" | "abandonedCartDelay" | "recurringEngagementDelay", label: string) => (
    <div className="space-y-2"><FormLabel className="text-sm">{label}</FormLabel>
      <div className="grid grid-cols-3 gap-2">
        <FormField control={form.control} name={`${baseFieldName}.days`} render={({ field }) => (<FormItem><FormLabel className="text-xs text-muted-foreground">Days</FormLabel><FormControl><Input type="number" placeholder="e.g., 1" {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name={`${baseFieldName}.hours`} render={({ field }) => (<FormItem><FormLabel className="text-xs text-muted-foreground">Hours</FormLabel><FormControl><Input type="number" placeholder="e.g., 24" {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name={`${baseFieldName}.minutes`} render={({ field }) => (<FormItem><FormLabel className="text-xs text-muted-foreground">Minutes</FormLabel><FormControl><Input type="number" placeholder="e.g., 30" {...field} /></FormControl><FormMessage /></FormItem>)} />
      </div>
    </div>
  );
  
  const renderAutomationCard = (id: 'noBookingReminder' | 'abandonedCart' | 'recurringEngagement', title: string, description: string, icon: React.ReactNode, subject: string, categoryIdField: keyof MarketingAutomationFormData) => (
    <Card>
      <CardHeader><CardTitle className="flex items-center">{icon}{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        <FormField control={form.control} name={`${id}Enabled`} render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel className="text-base flex items-center"><Mail className="mr-2 h-4 w-4"/>Enable "{title}"</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || isTestSending} /></FormControl></FormItem>)}/>
        {form.watch(`${id}Enabled`) && (
          <div className="pl-4 border-l-2 ml-2 space-y-4">
            {id !== 'recurringEngagement' && renderDelayInputs(`${id}Delay`, "Send After")}
            {id === 'recurringEngagement' && renderDelayInputs(`${id}Delay`, "Send Every")}
            <FormField control={form.control} name={`${id}CategoryId`} render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><Layers className="mr-2 h-4 w-4"/>Category for {"{{category_services}}"} Tag</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "cart"} disabled={isSaving || isLoadingCategories}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="cart">Automatic (from user's cart)</SelectItem>
                        <SelectItem value="none">-- None --</SelectItem>
                        {allCategories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormDescription>Select a category, or let it be determined from the user's cart (if available).</FormDescription>
                </FormItem>
            )}/>
            <FormField control={form.control} name={`${id}Template`} render={({ field }) => (<FormItem><FormLabel>Email Body</FormLabel><FormControl><Textarea placeholder="Hi {{name}}, ..." {...field} rows={5} /></FormControl><FormDescription>Use merge tags like {"{{name}}"}, {"{{popular_services}}"}, {"{{category_services}}"}, etc.</FormDescription><FormMessage /></FormItem>)}/>
            <Button type="button" variant="secondary" size="sm" onClick={() => handleTestSend(subject, form.getValues(`${id}Template`) || 'Test', form.getValues(categoryIdField as any))} disabled={isTestSending}><Send className="mr-2 h-4 w-4"/>Send Test Email</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Megaphone className="mr-2 h-6 w-6 text-primary" /> Marketing Center</CardTitle>
          <CardDescription>Configure automated marketing emails and send manual campaigns.</CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="email_automations" className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="email_automations"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Mail className="mr-2 h-4 w-4" />Email Automations
            </TabsTrigger>
            <TabsTrigger 
              value="send_email"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Send className="mr-2 h-4 w-4" />Send Manual Email
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="send_email" className="mt-0 focus-visible:outline-none">
          <PermissionGuard moduleId="marketing_automation" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to send manual marketing emails.</div>}>
            <SendManualEmailForm />
          </PermissionGuard>
        </TabsContent>
        <TabsContent value="email_automations" className="mt-0 focus-visible:outline-none">          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {renderAutomationCard('noBookingReminder', 'No Booking Reminder', "Follow-up with users who sign up but don't book a service.", <Users className="mr-2 h-5 w-5 text-primary"/>, "A friendly reminder from " + (globalSettings.websiteName || "FixBro"), "noBookingReminderCategoryId")}
              {renderAutomationCard('abandonedCart', 'Abandoned Cart Reminder', "Remind users who add items to cart but don't check out.", <ShoppingCart className="mr-2 h-5 w-5 text-primary"/>, "You left something in your cart!", "abandonedCartCategoryId")}
              {renderAutomationCard('recurringEngagement', 'Recurring Engagement', "Send regular emails to all registered users to keep them engaged.", <Repeat className="mr-2 h-5 w-5 text-primary"/>, "Here's what's new at " + (globalSettings.websiteName || "FixBro"), "recurringEngagementCategoryId")}
              <CardFooter className="flex justify-end">
                <PermissionGuard moduleId="marketing_automation" action="write">
                  <Button type="submit" disabled={isSaving || isTestSending}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Automation Settings</Button>
                </PermissionGuard>
              </CardFooter>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
