
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Save, Loader2, RefreshCw, XCircle, Sun, Moon, Sparkles, CheckCircle2, Layout, Zap, Component, Settings2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { GlobalWebSettings, ThemeColors, ThemePalette, LoaderType } from '@/types/firestore';
import { hexToHslString, hslStringToHex, DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, CORE_THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";

const loaderTypes: LoaderType[] = ["logo-pulse", "pulse", "typing", "bars", "gradient", "orbit", "dots", "progress", "cube", "shine", "bounce", "ring", "flip", "wave", "heart", "matrix"];

interface ColorGroup {
  title: string;
  keys: (keyof ThemePalette)[];
  description: string;
}

const colorGroups: ColorGroup[] = [
  { 
    title: "Brand Colors", 
    description: "Core identity colors for buttons, icons, and accents.",
    keys: ['primary', 'primary-foreground', 'accent', 'accent-foreground', 'secondary', 'secondary-foreground'] 
  },
  { 
    title: "Base UI", 
    description: "Backgrounds and text colors for the main interface.",
    keys: ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground'] 
  },
  { 
    title: "System & Borders", 
    description: "Visual elements like borders, inputs, and feedback colors.",
    keys: ['border', 'input', 'ring', 'muted', 'muted-foreground', 'destructive', 'destructive-foreground'] 
  }
];

type ThemeMode = 'light' | 'dark';

export default function ThemeSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ThemeMode>('light');
  
  const [currentColorsHex, setCurrentColorsHex] = useState<Record<ThemeMode, Partial<Record<keyof ThemePalette, string>>>>({
    light: {},
    dark: {},
  });
  const [selectedLoader, setSelectedLoader] = useState<LoaderType>('logo-pulse');

  const loadThemeSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const globalSettings = docSnap.data() as GlobalWebSettings;
        setSelectedLoader(globalSettings.loaderType || 'logo-pulse');
        const loadedLightHexColors: Record<string, string> = {};
        const loadedDarkHexColors: Record<string, string> = {};

        CORE_THEME_PALETTE_KEYS.forEach(configKey => {
          const lightHslValue = globalSettings.themeColors?.light?.[configKey];
          loadedLightHexColors[configKey] = lightHslValue ? hslStringToHex(lightHslValue) : hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL[configKey]!);
          
          const darkHslValue = globalSettings.themeColors?.dark?.[configKey];
          loadedDarkHexColors[configKey] = darkHslValue ? hslStringToHex(darkHslValue) : hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL[configKey]!);
        });
        setCurrentColorsHex({
          light: loadedLightHexColors as Partial<Record<keyof ThemePalette, string>>,
          dark: loadedDarkHexColors as Partial<Record<keyof ThemePalette, string>>,
        });
      } else {
        resetToDefaultColorsState();
        setSelectedLoader('logo-pulse');
      }
    } catch (error) {
      console.error("Error loading theme settings:", error);
      toast({ title: "Error", description: "Could not load theme settings.", variant: "destructive" });
      resetToDefaultColorsState();
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadThemeSettings();
  }, [loadThemeSettings]);

  const resetToDefaultColorsState = (mode?: ThemeMode) => {
    if (mode === 'light' || !mode) {
      const defaultLightHex: Record<string, string> = {};
      CORE_THEME_PALETTE_KEYS.forEach(configKey => {
        defaultLightHex[configKey] = hslStringToHex(DEFAULT_LIGHT_THEME_COLORS_HSL[configKey]!);
      });
      setCurrentColorsHex(prev => ({ ...prev, light: defaultLightHex as Partial<Record<keyof ThemePalette, string>> }));
    }
    if (mode === 'dark' || !mode) {
      const defaultDarkHex: Record<string, string> = {};
      CORE_THEME_PALETTE_KEYS.forEach(configKey => {
        defaultDarkHex[configKey] = hslStringToHex(DEFAULT_DARK_THEME_COLORS_HSL[configKey]!);
      });
      setCurrentColorsHex(prev => ({ ...prev, dark: defaultDarkHex as Partial<Record<keyof ThemePalette, string>> }));
    }
  };

  const handleColorChange = (mode: ThemeMode, id: keyof ThemePalette, hexValue: string) => {
    setCurrentColorsHex(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [id]: hexValue,
      },
    }));
  };

  const handleSaveTheme = async () => {
    setIsSaving(true);
    try {
      const themeColorsToSave: ThemeColors = { light: {}, dark: {} };
      (Object.keys(currentColorsHex.light) as Array<keyof ThemePalette>).forEach(key => {
        if (currentColorsHex.light[key]) themeColorsToSave.light![key] = hexToHslString(currentColorsHex.light[key]);
      });
      (Object.keys(currentColorsHex.dark) as Array<keyof ThemePalette>).forEach(key => {
        if (currentColorsHex.dark[key]) themeColorsToSave.dark![key] = hexToHslString(currentColorsHex.dark[key]);
      });

      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      await setDoc(settingsDocRef, { themeColors: themeColorsToSave, loaderType: selectedLoader, updatedAt: Timestamp.now() }, { merge: true });
      toast({ title: "Theme Updated", description: "Your brand colors and loader have been synchronized." });
    } catch (error) {
      toast({ title: "Save Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAllToDefault = async () => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      await setDoc(settingsDocRef, {
        themeColors: { light: { ...DEFAULT_LIGHT_THEME_COLORS_HSL }, dark: { ...DEFAULT_DARK_THEME_COLORS_HSL } },
        loaderType: 'logo-pulse',
        updatedAt: Timestamp.now(),
      }, { merge: true });
      resetToDefaultColorsState();
      setSelectedLoader('logo-pulse');
      toast({ title: "System Reset Complete", description: "Default theme settings restored." });
    } catch (error) {
      toast({ title: "Reset Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentColor = (mode: ThemeMode, key: keyof ThemePalette) => {
    const defaultPalette = mode === 'light' ? DEFAULT_LIGHT_THEME_COLORS_HSL : DEFAULT_DARK_THEME_COLORS_HSL;
    return currentColorsHex[mode]?.[key] || hslStringToHex(defaultPalette[key]!);
  };

  const previewPrimary = getCurrentColor(activeTab, 'primary');
  const previewAccent = getCurrentColor(activeTab, 'accent');
  const previewForeground = getCurrentColor(activeTab, 'foreground');
  const previewBackground = getCurrentColor(activeTab, 'background');

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] animate-pulse">Syncing Visual Identity...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 px-2 sm:px-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <Palette className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Appearance Studio</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">Visual Identity</h1>
          <p className="text-muted-foreground text-sm font-medium">Define your brand colors, interface aesthetics, and loading animations.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-12 sm:h-10 rounded-xl text-destructive hover:bg-destructive hover:text-white font-bold text-xs uppercase tracking-tight border border-destructive/20 transition-all duration-300">
                <RefreshCw className="mr-2 h-4 w-4" /> Factory Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl">
              <AlertDialogHeader>
                <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
                <AlertDialogTitle className="text-2xl font-black tracking-tight uppercase">System Overwrite</AlertDialogTitle>
                <AlertDialogDescription className="text-base font-medium">This will wipe all custom branding and restore the original FixBro defaults.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-8">
                <AlertDialogCancel className="rounded-xl border-none bg-muted">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAllToDefault} className="rounded-xl bg-destructive hover:bg-destructive/90 px-8">Confirm Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleSaveTheme} disabled={isSaving} className="h-14 sm:h-12 rounded-2xl px-8 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 font-black text-xs uppercase tracking-widest">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </header>

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-12">
        {/* Left: Loader & Preview (4 cols) */}
        <div className="lg:col-span-4 space-y-8">
          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden bg-card">
            <CardHeader className="p-8 pb-4">
              <div className="flex items-center space-x-3 mb-1 text-primary">
                <Zap className="h-5 w-5" />
                <CardTitle className="text-xl font-black tracking-tight uppercase">System Loader</CardTitle>
              </div>
              <CardDescription className="text-xs font-medium">Select the global transition animation.</CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8 pt-0">
              <ScrollArea className="h-[450px] pr-4">
                <div className="grid grid-cols-2 gap-3 py-2">
                  {loaderTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedLoader(type)}
                      className={cn(
                        "group flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300",
                        selectedLoader === type 
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-100" 
                          : "bg-muted/30 border-transparent hover:border-primary/20 hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-lg mb-2 flex items-center justify-center transition-transform duration-500",
                        selectedLoader === type ? "bg-white/20 scale-110" : "bg-primary/10 text-primary group-hover:scale-110"
                      )}>
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-tighter text-center line-clamp-1">{type}</span>
                      {selectedLoader === type && <CheckCircle2 className="h-3 w-3 mt-1 text-white opacity-80" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-none shadow-2xl rounded-[2rem] overflow-hidden p-0 relative group transition-all duration-500",
            activeTab === 'dark' ? "bg-[#0F172A]" : "bg-white border border-border/40"
          )} style={activeTab === 'light' ? { backgroundColor: previewBackground, color: previewForeground } : { color: 'white' }}>
             {/* Dynamic Glow Effect */}
             <div className="absolute -top-24 -right-24 w-48 h-48 blur-[100px] rounded-full transition-all duration-700" 
                  style={{ backgroundColor: `${previewPrimary}33` }} />
             
             <div className="p-8 relative z-10">
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center space-x-3">
                      <div className={cn(
                        "p-2 rounded-xl border transition-colors",
                        activeTab === 'dark' ? "bg-white/5 border-white/10" : "bg-muted border-border/40"
                      )}>
                        <Layout className="h-5 w-5" style={{ color: previewPrimary }} />
                      </div>
                      <h3 className="font-black text-lg tracking-tight uppercase" style={{ color: activeTab === 'dark' ? 'white' : previewForeground }}>Studio Preview</h3>
                   </div>
                   <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                </div>

                <div className="space-y-6">
                   {/* Mock App Header */}
                   <div className={cn(
                     "flex items-center justify-between p-3 rounded-xl border backdrop-blur-md transition-all",
                     activeTab === 'dark' ? "bg-white/5 border-white/10" : "bg-muted/50 border-border/40"
                   )}>
                      <div className="flex gap-1.5">
                         <div className="h-2 w-2 rounded-full bg-red-500/50" />
                         <div className="h-2 w-2 rounded-full bg-amber-500/50" />
                         <div className="h-2 w-2 rounded-full bg-emerald-500/50" />
                      </div>
                      <div className={cn("h-3 w-24 rounded-full", activeTab === 'dark' ? "bg-white/10" : "bg-slate-200")} />
                      <div className="h-6 w-6 rounded-full border transition-colors" 
                           style={{ backgroundColor: `${previewPrimary}33`, borderColor: `${previewPrimary}66` }} />
                   </div>

                   {/* Mock Content Card */}
                   <div className={cn(
                     "p-5 rounded-2xl border shadow-inner transition-all",
                     activeTab === 'dark' ? "bg-gradient-to-br from-white/[0.08] to-transparent border-white/10" : "bg-muted/30 border-border/40"
                   )}>
                      <div className="flex items-center gap-3 mb-4">
                         <div className={cn("h-10 w-10 rounded-full border flex items-center justify-center transition-colors", activeTab === 'dark' ? "bg-primary/20 border-primary/40" : "bg-primary/10 border-primary/20")} 
                              style={{ backgroundColor: `${previewPrimary}33`, borderColor: `${previewPrimary}66` }}>
                            <Zap className="h-5 w-5" style={{ color: previewPrimary }} />
                         </div>
                         <div className="space-y-1.5">
                            <div className={cn("h-2.5 w-24 rounded-full transition-colors")} style={{ backgroundColor: `${previewPrimary}66` }} />
                            <div className={cn("h-2 w-16 rounded-full", activeTab === 'dark' ? "bg-white/10" : "bg-slate-200")} />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <div className={cn("h-2 w-full rounded-full", activeTab === 'dark' ? "bg-white/5" : "bg-slate-100")} />
                         <div className={cn("h-2 w-[90%] rounded-full", activeTab === 'dark' ? "bg-white/5" : "bg-slate-100")} />
                         <div className={cn("h-2 w-[40%] rounded-full", activeTab === 'dark' ? "bg-white/5" : "bg-slate-100")} />
                      </div>
                   </div>

                   {/* Call to Action Section */}
                   <div className="grid grid-cols-2 gap-3">
                      <button className="h-12 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02]"
                              style={{ backgroundColor: previewPrimary, color: activeTab === 'dark' ? 'black' : 'white', boxShadow: `0 10px 15px -3px ${previewPrimary}4D` }}>
                         Primary Action
                      </button>
                      <button className={cn(
                        "h-12 rounded-xl border font-black text-[10px] uppercase tracking-widest transition-colors",
                        activeTab === 'dark' ? "bg-white/5 border-white/10 text-white hover:bg-white/10" : "bg-white border-border text-slate-600 hover:bg-slate-50"
                      )}>
                         Secondary
                      </button>
                   </div>

                   {/* Bottom Status Row */}
                   <div className="flex items-center gap-3 pt-2">
                      <div className="h-8 w-8 rounded-xl border flex items-center justify-center transition-colors"
                           style={{ backgroundColor: `${previewAccent}33`, borderColor: `${previewAccent}66` }}>
                         <CheckCircle2 className="h-4 w-4" style={{ color: previewAccent }} />
                      </div>
                      <div className={cn("flex-grow h-8 rounded-xl border flex items-center px-3", activeTab === 'dark' ? "bg-white/5 border-white/10" : "bg-slate-50 border-border/40")}>
                         <div className={cn("h-1.5 w-full rounded-full overflow-hidden", activeTab === 'dark' ? "bg-white/10" : "bg-accent/10")}>
                            <div className="h-full w-2/3 transition-all duration-1000" style={{ backgroundColor: previewAccent }} />
                         </div>
                      </div>
                   </div>
                </div>
                
                <p className={cn(
                  "text-[10px] mt-8 text-center uppercase font-black tracking-[0.3em] italic",
                  activeTab === 'dark' ? "text-white/20" : "text-slate-400"
                )}>Neon Engine v2.0 • Real-time View</p>
             </div>
          </Card>
        </div>

        {/* Right: Color Settings (8 cols) */}
        <div className="lg:col-span-8">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ThemeMode)} className="w-full">
            <div className="flex justify-center mb-8">
              <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-card/50 rounded-[1.5rem] h-14 border shadow-sm backdrop-blur-sm">
                <TabsTrigger 
                  value="light" 
                  className={cn(
                    "rounded-2xl transition-all duration-300 font-black text-xs uppercase tracking-wider",
                    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
                  )}
                >
                  <Sun className="mr-2 h-4 w-4" /> Light Palette
                </TabsTrigger>
                <TabsTrigger 
                  value="dark" 
                  className={cn(
                    "rounded-2xl transition-all duration-300 font-black text-xs uppercase tracking-wider",
                    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
                  )}
                >
                  <Moon className="mr-2 h-4 w-4" /> Dark Palette
                </TabsTrigger>
              </TabsList>
            </div>

            {['light', 'dark'].map((mode) => (
              <TabsContent key={mode} value={mode} className="focus-visible:outline-none space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {colorGroups.map((group) => (
                  <Card key={group.title} className="border-none shadow-xl rounded-[2rem] overflow-hidden bg-card">
                    <CardHeader className="p-8 pb-4">
                      <div className="flex items-center space-x-3 mb-1 text-primary">
                        <Component className="h-5 w-5" />
                        <CardTitle className="text-xl font-black tracking-tight uppercase">{group.title}</CardTitle>
                      </div>
                      <CardDescription className="text-xs font-medium">{group.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {group.keys.map((key) => {
                        const defaultPalette = mode === 'light' ? DEFAULT_LIGHT_THEME_COLORS_HSL : DEFAULT_DARK_THEME_COLORS_HSL;
                        const label = key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        const colorValue = currentColorsHex[mode as ThemeMode]?.[key] || hslStringToHex(defaultPalette[key]!);
                        
                        return (
                          <div key={`${mode}-${key}`} className="p-4 rounded-2xl bg-muted/20 border border-border/40 hover:bg-muted/40 transition-all group">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider group-hover:text-primary transition-colors">{label}</span>
                              <button
                                onClick={() => handleColorChange(mode as ThemeMode, key, hslStringToHex(defaultPalette[key]!))}
                                className={cn(
                                  "p-1 hover:bg-primary/10 rounded-md transition-all",
                                  colorValue === hslStringToHex(defaultPalette[key]!) ? "opacity-0 invisible" : "opacity-100 visible"
                                )}
                                title="Reset to default"
                              >
                                <XCircle className="h-3 w-3 text-destructive" />
                              </button>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden shadow-inner border border-white/20">
                                <input
                                  type="color"
                                  value={colorValue}
                                  onChange={(e) => handleColorChange(mode as ThemeMode, key, e.target.value)}
                                  className="absolute inset-0 h-[150%] w-[150%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                                />
                              </div>
                              <Input
                                type="text"
                                value={colorValue.toUpperCase()}
                                onChange={(e) => handleColorChange(mode as ThemeMode, key, e.target.value)}
                                className="h-10 bg-background border-none shadow-sm rounded-xl font-mono text-[11px] font-bold tracking-tighter"
                                placeholder="#HEX"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
