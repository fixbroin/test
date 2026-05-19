
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import Logo from '@/components/shared/Logo';
import { Mail, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext'; // Correct import for ADMIN_EMAIL
import type { LogInData } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, logIn, isLoading } = useAuth();
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "", // Changed from ADMIN_EMAIL to empty string
      password: "",
    },
  });

  useEffect(() => {
    if (user) {
      if (user.email === ADMIN_EMAIL) {
        router.push('/admin'); 
      } else {
        toast({ title: "Access Denied", description: "You are not authorized to access the admin login.", variant: "destructive"});
        router.push('/');
      }
    }
  }, [user, router, toast]);

  const onSubmit = async (data: LoginFormValues) => {
    if (data.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        form.setError("email", { type: "manual", message: "This login is for admin use only."});
        toast({ title: "Access Denied", description: "Invalid email for admin login.", variant: "destructive" });
        return;
    }
    try {
      await logIn(data as LogInData);
      // router.push('/admin'); // Redirection is handled within logIn or useEffect
    } catch (error) {
      console.error("Admin login page error:", error);
      // Error is handled by toast in AuthContext
    }
  };

  if (user && user.email === ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
         <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
   if (user && user.email !== ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4 text-center">
        <p>Redirecting...</p>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Logo className="mx-auto mb-4" size="large" />
          <CardTitle className="text-2xl font-headline">Admin Panel Login</CardTitle>
          <CardDescription>Restricted access for administrators.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email" className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground" />Admin Email</FormLabel>
                    <FormControl>
                      {/* Removed readOnly and disabled, default value is now empty */}
                      <Input id="email" type="email" placeholder="Enter admin email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="password" className="flex items-center"><KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />Password</FormLabel>
                    <FormControl>
                      <Input id="password" type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Login to Admin Panel
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
