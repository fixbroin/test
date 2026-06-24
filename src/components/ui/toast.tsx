"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

// ✅ 1 or 2 seconds duration — choose your preference
const TOAST_REMOVE_DELAY = 3000; // 2000 = 2 seconds, 1000 = 1 second

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 left-1/2 -translate-x-1/2 z-[100] flex max-h-screen w-full flex-col p-4 md:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-xl border p-4 pr-6 shadow-2xl backdrop-blur-md transition-all duration-300 data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-top-full data-[state=open]:slide-in-from-top-full",
  {
    variants: {
      variant: {
        default: "border-border/40 bg-background/90 dark:bg-zinc-950/90 text-foreground shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
        destructive:
          "destructive group border-red-500/30 bg-red-600/90 dark:bg-red-950/80 text-white shadow-[0_8px_32px_rgba(239,68,68,0.25)]",
        success:
          "success group border-emerald-500/30 bg-emerald-600/90 dark:bg-emerald-950/80 text-white shadow-[0_8px_32px_rgba(16,185,129,0.25)]",
        warning:
          "warning group border-amber-500/30 bg-amber-500/90 dark:bg-amber-950/80 text-white shadow-[0_8px_32px_rgba(245,158,11,0.20)]",
        info:
          "info group border-sky-500/30 bg-sky-600/90 dark:bg-sky-950/80 text-white shadow-[0_8px_32px_rgba(14,165,233,0.25)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  const [progress, setProgress] = React.useState(100);

  React.useEffect(() => {
  if (props.open) {
    setProgress(100);
    const duration = props.duration || TOAST_REMOVE_DELAY;
    const start = performance.now();

    let animationFrame: number;

    const animate = (time: number) => {
      const elapsed = time - start;
      const percentage = Math.max(100 - (elapsed / duration) * 100, 0);
      setProgress(percentage);

      if (elapsed < duration) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        props.onOpenChange?.(false);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }
}, [props.open, props.duration]);

  let progressBarColor = "bg-green-500";
  if (variant === "destructive" || variant === "success" || variant === "info" || variant === "warning") {
    progressBarColor = "bg-white";
  }

  return (
    <ToastPrimitives.Root
      ref={ref}
      duration={TOAST_REMOVE_DELAY} // ✅ Sync duration
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      {props.children}

      {/* Progress bar with dynamic color matching variant */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent overflow-hidden">
        <div 
          className={cn("h-full w-full transition-all duration-300 ease-out", progressBarColor)}
          style={{ transform: `translateX(-${100 - progress}%)` }}
        />
      </div>
    </ToastPrimitives.Root>
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-70 transition-opacity hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring group-[.destructive]:text-white/80 group-[.destructive]:hover:text-white group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600 group-[.success]:text-white/80 group-[.success]:hover:text-white group-[.info]:text-white/80 group-[.info]:hover:text-white group-[.warning]:text-white/80 group-[.warning]:hover:text-white",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
