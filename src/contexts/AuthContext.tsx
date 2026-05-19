"use client";

import type { PropsWithChildren } from 'react';
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  type User,
  type AuthError,
  type UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  type ConfirmationResult,
  updateEmail, 
  sendEmailVerification, 
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { initializeFCM, onForegroundMessage } from '@/lib/fcmUtils';
import { doc, setDoc, Timestamp, getDoc, onSnapshot, collection, query, where, getDocs, limit, runTransaction, writeBatch, or } from "firebase/firestore";
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { FirestoreUser, MarketingAutomationSettings, ReferralSettings, Referral, FirestoreNotification } from '@/types/firestore';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId, clearGuestId } from '@/lib/guestIdManager';
import { sendWelcomeEmail, type WelcomeEmailInput } from '@/ai/flows/sendWelcomeEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { nanoid } from 'nanoid';
import { syncCartOnLogin } from '@/lib/cartManager';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { incrementSystemStats } from '@/lib/systemStatsUtils';
// Define and export ADMIN_EMAIL here
export const ADMIN_EMAIL = "fixbro.in@gmail.com";

export interface SignUpData {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
}

export interface LogInData {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  firestoreUser: FirestoreUser | null;
  isLoading: boolean;
  authActionRedirectPath: string | null;
  triggerAuthRedirect: (intendedPath: string) => void;
  signUp: (data: SignUpData) => Promise<void>;
  logIn: (data: LogInData) => Promise<void>;
  logOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  handleSuccessfulAuth: (userCredential: UserCredential) => Promise<void>;
  isCompletingProfile: boolean;
  userCredentialForProfileCompletion: UserCredential | null;
  completeProfileSetup: (details: { fullName: string; email?: string; mobileNumber?: string; referralCode?: string }) => Promise<void>;
  cancelProfileCompletion: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const generateReferralCode = (length: number) => {
  return nanoid(length).toUpperCase();
};

const getSimpleDeviceId = (): string => {
    if (typeof window === 'undefined') return 'server';
    const { userAgent, hardwareConcurrency, language } = window.navigator;
    const { width, height, colorDepth, pixelDepth } = window.screen;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let webglVendor = 'unknown';
    if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            webglVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
    }
    const dataString = `${userAgent}|${width}x${height}|${colorDepth}|${pixelDepth}|${hardwareConcurrency}|${language}|${webglVendor}`;
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
};


export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authActionRedirectPath, setAuthActionRedirectPath] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [userCredentialForProfileCompletion, setUserCredentialForProfileCompletion] = useState<UserCredential | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // If we are in the middle of profile completion, do NOT set the user
      // so the app continues to see 'null' and stays on the login page/shows dialog
      if (isCompletingProfile) {
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [isCompletingProfile]);

  useEffect(() => {
    if (user?.uid) {
        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setFirestoreUser({ id: docSnap.id, ...docSnap.data() } as FirestoreUser);
            } else {
                setFirestoreUser(null);
            }
        }, (error) => {
            console.error("AuthContext: Error fetching Firestore user data:", error);
            setFirestoreUser(null);
        });
        return () => unsubscribe();
    } else {
        setFirestoreUser(null);
    }
  }, [user]);


  const internalTriggerAuthRedirect = useCallback((intendedPath: string) => {
    setAuthActionRedirectPath(intendedPath);
    router.push(`/auth/login?redirect=${encodeURIComponent(intendedPath)}`);
  }, [router, setAuthActionRedirectPath]);

  const handleSuccessfulAuth = useCallback(async (userCredential: UserCredential) => {
    setIsLoading(true);
    const guestIdBeforeAuth = getGuestId();
    const { user } = userCredential;

    try {
      const userDocRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userDocRef);

      const userData = docSnap.data();

if (
  !docSnap.exists() ||
  !userData?.displayName ||
  !userData?.mobileNumber ||
  !userData?.email
) {
  // NEW USER OR INCOMPLETE PROFILE FLOW
  setUserCredentialForProfileCompletion(userCredential);
  setIsCompletingProfile(true);
  setIsLoading(false);
  return;
}

      // EXISTING USER FLOW
      await setDoc(userDocRef, { lastLoginAt: Timestamp.now() }, { merge: true });
      logUserActivity('userLogin', {
        email: user.email || undefined,
        mobileNumber: userData?.mobileNumber || user.phoneNumber || undefined,
        loginMethod: user.providerData[0]?.providerId || 'password',
        sourceGuestId: guestIdBeforeAuth
      }, user.uid, null);
      
      clearGuestId();
      await syncCartOnLogin(user.uid);

      toast({ title: "Success", description: "Logged in successfully!" });
      
      setUser(user);

      const redirectPathFromQuery = searchParams.get('redirect');
      let finalRedirectPath = '/';
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin';
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      } else if (authActionRedirectPath && !authActionRedirectPath.startsWith('/auth/')) {
        finalRedirectPath = authActionRedirectPath;
      }
      router.push(finalRedirectPath);
      if (authActionRedirectPath) setAuthActionRedirectPath(null);

    } catch (error) {
      const authError = error as AuthError;
      console.error("Post-authentication error:", authError);
      toast({ title: "Authentication Error", description: authError.message || "An error occurred after signing in.", variant: "destructive" });
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, searchParams, authActionRedirectPath, setAuthActionRedirectPath]);

  const cancelProfileCompletion = useCallback(async () => {
    setIsCompletingProfile(false);
    setUserCredentialForProfileCompletion(null);
    await signOut(auth);
    setUser(null);
  }, []);

  const completeProfileSetup = useCallback(async (details: { fullName: string; email?: string; mobileNumber?: string; referralCode?: string }) => {
    if (!userCredentialForProfileCompletion) return;
    setIsLoading(true);
    const { user } = userCredentialForProfileCompletion;
  
    try {
      await updateProfile(user, { displayName: details.fullName });
  
      if (details.email && user.providerData[0]?.providerId === 'phone') {
  const actionCodeSettings = { url: `${window.location.origin}/`, handleCodeInApp: true };

  try {
    await verifyBeforeUpdateEmail(user, details.email, actionCodeSettings);

    toast({
      title: "Verification Email Sent",
      description: `A verification link has been sent to ${details.email}. Please check your inbox to link it to your account.`,
      duration: 3000,
    });

  } catch (error: any) {

    if (error.code === "auth/requires-recent-login") {

      toast({
        title: "Please login again",
        description: "For security reasons please login again before linking your email.",
        variant: "destructive",
      });

      await signOut(auth);
      router.push("/auth/login");
      return;
    }

    throw error;
  }
}
  
      await runTransaction(db, async (transaction) => {
        const referralCodeParam = localStorage.getItem("referralCode") || details.referralCode;
        const referralSettingsDocRef = doc(db, "appConfiguration", "referral");
        const referralSettingsSnap = await transaction.get(referralSettingsDocRef);
        const referralSettings = referralSettingsSnap.exists() ? referralSettingsSnap.data() as ReferralSettings : null;
        let initialWalletBalance = 0;
        let referrerId: string | null = null;
        let deviceId: string | null = null;
        let ipAddress: string | null = null;
        
        const newUsersEmail = details.email || user.email;

        try {
            const ipResponse = await fetch('/api/auth/get-client-ip');
            if (ipResponse.ok) {
                const ipData = await ipResponse.json();
                ipAddress = ipData.ip || null;
            }
        } catch (e) { console.warn("Could not fetch IP address via server API."); }
        if (typeof window !== 'undefined') deviceId = getSimpleDeviceId();

        const newUserDocRef = doc(db, "users", user.uid);
        const authProvider = user.providerData[0]?.providerId; // e.g. 'google.com', 'phone', 'password'
  
        if (referralCodeParam && referralSettings?.isReferralSystemEnabled && (authProvider === 'google.com' || authProvider === 'phone')) {
          const orConditions = [];
          if (newUsersEmail) orConditions.push(where("referredUserEmail", "==", newUsersEmail));
          if (ipAddress && ipAddress !== 'unknown') orConditions.push(where("ipAddress", "==", ipAddress));
          if (deviceId) orConditions.push(where("deviceId", "==", deviceId));

          let existingReferralSnap = { empty: true };
          if (orConditions.length > 0) {
            const existingReferralQuery = query(collection(db, "referrals"), or(...orConditions), limit(1));
            existingReferralSnap = await getDocs(existingReferralQuery);
          }
          
          if (existingReferralSnap.empty) {
            const referrerQuery = query(collection(db, "users"), where("referralCode", "==", referralCodeParam), limit(1));
            const referrerSnapshot = await getDocs(referrerQuery);
    
            if (!referrerSnapshot.empty) {
              const referrerDoc = referrerSnapshot.docs[0];
              referrerId = referrerDoc.id;

              // Fraud Prevention: A user cannot refer themselves
              if (referrerId === user.uid) {
                console.warn("Self-referral attempt blocked.");
                toast({ title: "Referral Notice", description: "Self-referrals are not eligible for bonuses.", variant: "warning" });
              } else {
                const referredBonus = referralSettings.referredUserBonus || 0;
                if (referredBonus > 0) {
                    initialWalletBalance = referredBonus;
                }
        
                const referralDocRef = doc(collection(db, "referrals"));
                const newReferral: Omit<Referral, 'id'> = {
                    referrerId: referrerId,
                    referredUserId: user.uid,
                    referredUserEmail: newUsersEmail || "N/A",
                    status: 'pending',
                    referrerBonus: referralSettings.referrerBonus || 0,
                    referredBonus: referredBonus,
                    createdAt: Timestamp.now(),
                    ipAddress: ipAddress,
                    deviceId: deviceId,
                };
                transaction.set(referralDocRef, newReferral);
        
                const referrerNotification: Omit<FirestoreNotification, 'id'> = {
                    userId: referrerId,
                    title: "New Referral Signup!",
                    message: `${details.fullName} has signed up using your link. You'll get your bonus when they complete their first booking.`,
                    type: 'success',
                    href: '/referral',
                    read: false,
                    createdAt: Timestamp.now(),
                };
                transaction.set(doc(collection(db, "userNotifications")), referrerNotification);
              }
            }
          } else {
            console.warn("This device or network has already used a referral link.");
            toast({ title: "Referral Notice", description: "This device or network has already used a referral link. Account created without bonus.", variant: "warning" });
          }
        }
  
        const newUserFirestoreData: FirestoreUser = {
          id: user.uid,
          uid: user.uid,
          email: details.email || user.email || null,
          displayName: details.fullName,
          mobileNumber: user.phoneNumber || details.mobileNumber || null,
          photoURL: user.photoURL || null,
          isActive: true,
          createdAt: Timestamp.now(),
          lastLoginAt: Timestamp.now(),
          walletBalance: initialWalletBalance,
          referralCode: generateReferralCode(referralSettings?.referralCodeLength || 6),
          ...(referrerId && { referredBy: referrerId }),
        };
        transaction.set(newUserDocRef, newUserFirestoreData);
        // Track stats for new user
        incrementSystemStats({ totalUsers: 1, newSignups30d: 1 }).catch(e => console.error("Stats increment error:", e));
      });
  
      const guestIdBeforeAuth = getGuestId();
      logUserActivity('newUser', {
        email: user.email || undefined,
        fullName: details.fullName,
        mobileNumber: user.phoneNumber || details.mobileNumber,
        loginMethod: user.providerData[0]?.providerId || 'unknown',
        sourceGuestId: guestIdBeforeAuth,
        usedReferral: !!localStorage.getItem('referralCode'),
      }, user.uid, null);
      clearGuestId();
      localStorage.removeItem('referralCode');
      
      await syncCartOnLogin(user.uid);
  
      if (appConfig.smtpHost && details.email) {
          sendWelcomeEmail({
              userName: details.fullName,
              userEmail: details.email,
              smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort,
              smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
          }).catch(err => console.error("Failed to send welcome email:", err));
      }

      const marketingConfigDoc = await getDoc(doc(db, "webSettings", "marketingAutomation"));
      if (marketingConfigDoc.exists()) {
          const marketingConfig = marketingConfigDoc.data() as MarketingAutomationSettings;
          if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnSignup?.enabled && marketingConfig.whatsAppOnSignup.templateName && (user.phoneNumber || details.mobileNumber)) {
              try {
                  await fetch('/api/whatsapp/send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          to: user.phoneNumber || details.mobileNumber,
                          templateName: marketingConfig.whatsAppOnSignup.templateName,
                          parameters: [details.fullName, "FixBro"],
                      }),
                  });
              } catch (waError) {
                  console.error("Failed to trigger welcome WhatsApp message:", waError);
              }
          }
      }
      
      setUser(user);
      setIsCompletingProfile(false);
      setUserCredentialForProfileCompletion(null);

      // --- SEND SIGNUP NOTIFICATIONS (Push + In-App) ---
      try {
        // 1. Notify User
        const userNotification: Omit<FirestoreNotification, 'id'> = {
          userId: user.uid,
          title: "Welcome to FixBro!",
          message: `Hi ${details.fullName}, thank you for joining us! We're excited to help you with your home services.`,
          type: 'success',
          href: '/profile',
          read: false,
          createdAt: Timestamp.now(),
        };
        await setDoc(doc(collection(db, "userNotifications")), userNotification);
        triggerPushNotification({
          userId: user.uid,
          title: userNotification.title,
          body: userNotification.message,
          href: userNotification.href
        }).catch(err => console.error("Error sending user signup push:", err));

        // 2. Notify Admin
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminId = adminSnapshot.docs[0].id;
          const adminNotification: Omit<FirestoreNotification, 'id'> = {
            userId: adminId,
            title: "New User Registered!",
            message: `${details.fullName} has just signed up on FixBro.`,
            type: 'info',
            href: `/admin/users`, // Assuming there's a users management page
            read: false,
            createdAt: Timestamp.now(),
          };
          await setDoc(doc(collection(db, "userNotifications")), adminNotification);
          triggerPushNotification({
            userId: adminId,
            title: adminNotification.title,
            body: adminNotification.message,
            href: adminNotification.href
          }).catch(err => console.error("Error sending admin signup push:", err));
        }
      } catch (notifyError) {
        console.error("Error sending signup notifications:", notifyError);
      }
      // --- END SIGNUP NOTIFICATIONS ---
  
      toast({ title: "Account Created!", description: "Welcome to FixBro!" });
  
      const redirectPathFromQuery = searchParams.get('redirect');
      let finalRedirectPath = '/';
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin';
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      } else if (authActionRedirectPath && !authActionRedirectPath.startsWith('/auth/')) {
        finalRedirectPath = authActionRedirectPath;
      }
      router.push(finalRedirectPath);
      if (authActionRedirectPath) setAuthActionRedirectPath(null);
  
    } catch (error) {
      const authError = error as AuthError;
      console.error("Error completing profile setup:", authError);
      toast({ title: "Error", description: authError.message || "Could not save profile details.", variant: "destructive" });
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [userCredentialForProfileCompletion, toast, router, searchParams, authActionRedirectPath, appConfig]);
  
  const signUp = useCallback(async (data: SignUpData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      setUserCredentialForProfileCompletion(userCredential);
      await completeProfileSetup({
          fullName: data.fullName,
          email: data.email,
          mobileNumber: data.mobileNumber,
      });
    } catch (error) {
      const authError = error as AuthError;
      console.error("Signup error:", authError);
      toast({ title: "Signup Failed", description: authError.message, variant: "destructive" });
      setIsLoading(false);
      throw authError;
    }
  }, [toast, completeProfileSetup]);

  const logIn = useCallback(async (data: LogInData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await handleSuccessfulAuth(userCredential);
    } catch (error) {
      const authError = error as AuthError;
      console.error("Login error:", authError);
      toast({ title: "Login Failed", description: authError.message, variant: "destructive" });
      setIsLoading(false);
      throw authError;
    }
  }, [toast, handleSuccessfulAuth]);
  
  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleSuccessfulAuth(result);
    } catch (error) {
      const authError = error as AuthError;
      if (authError.code !== 'auth/popup-closed-by-user') {
        console.error("Google Sign-in error:", authError);
        toast({ title: "Google Sign-in Failed", description: authError.message || "Could not sign in with Google.", variant: "destructive" });
      }
      setIsLoading(false); 
      if (authError.code !== 'auth/popup-closed-by-user') {
        throw authError;
      }
    }
  }, [toast, handleSuccessfulAuth]);


  const logOut = useCallback(async () => {
    setIsLoading(true);
    const userIdForLog = user?.uid;
    const userEmailForLog = user?.email;
    try {
      if (userIdForLog) {
        logUserActivity('userLogout', { logoutMethod: 'manual', email: userEmailForLog ?? undefined }, userIdForLog, null);
      }
      await signOut(auth);
      setUser(null);
      setAuthActionRedirectPath(null);
      toast({ title: "Logged Out", description: "You have been logged out." });
      router.push('/auth/login');
    } catch (error) {
      const authError = error as AuthError;
      console.error("Logout error:", authError);
      toast({ title: "Logout Failed", description: authError.message || "Could not log out.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, user]);

  useEffect(() => {
    if (user?.uid) { 
      const setupFCM = async () => {
        try {
          await initializeFCM(user.uid);
          onForegroundMessage();
        } catch (error) {
          console.error("AuthContext: Error setting up FCM:", error);
        }
      };
      setupFCM();
    }
  }, [user]);

  const contextValue: AuthContextType = useMemo(() => {
    return {
      user,
      firestoreUser,
      isLoading,
      authActionRedirectPath,
      triggerAuthRedirect: internalTriggerAuthRedirect,
      signUp,
      logIn,
      logOut,
      signInWithGoogle,
      handleSuccessfulAuth,
      isCompletingProfile,
      userCredentialForProfileCompletion,
      completeProfileSetup,
      cancelProfileCompletion,
      setUser,
    };
  }, [user, firestoreUser, isLoading, authActionRedirectPath, internalTriggerAuthRedirect, signUp, logIn, logOut, signInWithGoogle, handleSuccessfulAuth, isCompletingProfile, userCredentialForProfileCompletion, completeProfileSetup, cancelProfileCompletion, setUser]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default AuthContext;
