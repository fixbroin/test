
"use client";

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, SendHorizonal, Trash2, PlusCircle, AlertTriangle } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const testSenderFormSchema = z.object({
  templateName: z.string({ required_error: "Please select a template."}),
  phoneNumber: z.string().min(12, "Phone number must be at least 12 digits including country code.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format."),
  params: z.array(z.object({ value: z.string().min(1, "Parameter cannot be empty.") })),
});

type TestSenderFormData = z.infer<typeof testSenderFormSchema>;

const approvedTemplates = [
  { name: 'user_welcome', params: 2, button: true, header: true },
  { name: 'booking_confirmed', params: 3, button: true, header: true },
  { name: 'booking_completed', params: 1, button: true, header: true },
  { name: 'booking_cancelled_1', params: 1, button: true, header: true },
  { name: 'payment_successful_1', params: 1, button: true, header: true },
];

export default function WhatsAppTestSenderForm() {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  const form = useForm<TestSenderFormData>({
    resolver: zodResolver(testSenderFormSchema),
    defaultValues: { templateName: undefined, phoneNumber: "", params: [] },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "params",
  });

  const watchedTemplateName = form.watch("templateName");

  useEffect(() => {
    const template = approvedTemplates.find(t => t.name === watchedTemplateName);
    if (template) {
      let sampleParams: {value: string}[] = [];
      switch (template.name) {
        case 'user_welcome':
          sampleParams = [{ value: 'Srikanth Achari' }, { value: 'FixBro' }];
          break;
        case 'booking_confirmed':
          sampleParams = [{ value: 'FIXBRO-TEST-123' }, { value: 'Bed Assembly with Storage' }, { value: '25-07-2025' }];
          break;
        case 'booking_completed':
        case 'booking_cancelled_1':
        case 'payment_successful_1':
          sampleParams = [{ value: 'FIXBRO-TEST-123' }];
          break;
        default:
          sampleParams = Array(template.params).fill({ value: 'Sample Param' });
      }
      replace(sampleParams);
    } else {
      replace([]);
    }
  }, [watchedTemplateName, replace]);

  const onSubmit = async (data: TestSenderFormData) => {
    setIsSending(true);
    toast({ title: "Sending Test Message..." });
    
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: data.phoneNumber,
          templateName: data.templateName,
          parameters: data.params.map(p => p.value),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      toast({ title: "Success!", description: "Test message sent successfully.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error: any) {
      console.error("Error sending test WhatsApp message:", error);
      toast({
        title: "Failed to Send Message",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
        duration: 7000,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Alert variant="default" className="bg-blue-50 border-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600"/>
            <AlertTitle className="text-blue-800 font-bold">Integration Check</AlertTitle>
            <AlertDescription className="text-blue-700 text-xs">
                Ensure your WhatsApp credentials (Token and Phone ID) are configured in <strong>Marketing Settings</strong> or your environment file. 
                The <strong>Global WhatsApp Toggle</strong> must also be enabled.
            </AlertDescription>
        </Alert>

        <FormField
          control={form.control}
          name="templateName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Select Template</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSending}>
                <FormControl><SelectTrigger><SelectValue placeholder="Choose a template to test" /></SelectTrigger></FormControl>
                <SelectContent>
                  {approvedTemplates.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {fields.map((field, index) => (
          <FormField
            key={field.id}
            control={form.control}
            name={`params.${index}.value`}
            render={({ field: itemField }) => (
              <FormItem>
                <FormLabel>Parameter {"{{"}{index + 1}{"}}"}</FormLabel>
                <FormControl>
                  <Input placeholder={`Value for parameter {{${index + 1}}}`} {...itemField} disabled={isSending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test Phone Number</FormLabel>
              <FormControl><Input placeholder="+91..." {...field} disabled={isSending} /></FormControl>
              <FormDescription>Include country code (e.g., +91).</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSending}>
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
          Send Test Message
        </Button>
      </form>
    </Form>
  );
}
