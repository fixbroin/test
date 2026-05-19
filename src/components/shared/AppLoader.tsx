import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import AppImage from "@/components/ui/AppImage";

interface AppLoaderProps {
  text?: string;
}

export default function AppLoader({ text }: AppLoaderProps) {
  const { settings: globalSettings, isLoading } = useGlobalSettings();

  const appName =
    globalSettings?.websiteName ||
    process.env.NEXT_PUBLIC_WEBSITE_NAME ||
    "FixBro";
  
  // Use the loaderType from settings, or a default if settings are not loaded yet
  const loaderType = isLoading ? "logo-pulse" : (globalSettings?.loaderType || "logo-pulse");

  return (
    <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-background/90 backdrop-blur-md transition-all duration-300">
      {/* ---------- ALL LOADER TYPES ---------- */}

      {(loaderType === "pulse" || loaderType === "logo-pulse") && (
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <div className="pulse-ring absolute"></div>
            <div className="pulse-ring-outer absolute"></div>
            {loaderType === "logo-pulse" && (
                <div className="relative z-10 w-20 h-20 bg-background rounded-full p-2 border-2 border-primary/20 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-500">
                    <AppImage src="/default-image.png" alt="Loading..." width={80} height={80} className="object-contain" />
                </div>
            )}
          </div>
          <span className="mt-8 text-xl font-bold tracking-tight text-foreground animate-pulse">{appName}</span>
          {text && <p className="mt-2 text-sm font-medium text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "typing" && (
        <div className="flex flex-col items-center">
          <span className="typing">{appName}</span>
          {text && <p className="mt-4 text-lg text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "bars" && (
        <div className="flex flex-col items-center">
          <div className="bars-loader">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}></span>
            ))}
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "gradient" && (
        <div className="flex flex-col items-center">
          <div className="gradient-spinner"></div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "orbit" && (
        <div className="flex flex-col items-center">
          <div className="orbit">
            <div className="planet"></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "dots" && (
        <div className="flex flex-col items-center">
          <div className="dots-loader">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "progress" && (
        <div className="flex flex-col items-center w-64">
          <div className="progress-bar">
            <div className="progress"></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "cube" && (
        <div className="flex flex-col items-center">
          <div className="cube-loader">
            <div className="cube"></div>
          </div>
          <span className="mt-6 text-2xl font-semibold">{appName}</span>
          {text && <p className="mt-2 text-muted-foreground">{text}</p>}
        </div>
      )}

      {loaderType === "shine" && (
        <div className="flex flex-col items-center">
          <div className="shine-loader">
            <span>{appName}</span>
          </div>
          {text && <p className="mt-4 text-lg text-muted-foreground">{text}</p>}
        </div>
      )}

      {/* ---------- STYLES ---------- */}
      <style jsx>{`
        .pulse-ring {
          width: 90px;
          height: 90px;
          border: 3px solid hsl(var(--primary));
          border-radius: 50%;
          animation: pulse 1.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        .pulse-ring-outer {
          width: 110px;
          height: 110px;
          border: 2px solid hsl(var(--primary) / 0.3);
          border-radius: 50%;
          animation: pulse 1.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
          animation-delay: 0.3s;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.8);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        .typing {
          font-size: 2rem;
          font-weight: 600;
          color: hsl(var(--primary));
          border-right: 3px solid hsl(var(--primary));
          white-space: nowrap;
          overflow: hidden;
          width: 0;
          animation: typing 2s steps(20, end) infinite alternate,
            blink 0.6s step-end infinite;
        }
        @keyframes typing {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }
        @keyframes blink {
          50% {
            border-color: transparent;
          }
        }

        .bars-loader {
          display: flex;
          gap: 6px;
          align-items: flex-end;
          height: 40px;
        }
        .bars-loader span {
          width: 6px;
          height: 100%;
          background-color: hsl(var(--primary));
          border-radius: 4px;
          animation: wave 1.2s ease-in-out infinite;
        }
        .bars-loader span:nth-child(2) {
          animation-delay: 0.1s;
        }
        .bars-loader span:nth-child(3) {
          animation-delay: 0.2s;
        }
        @keyframes wave {
          0%,
          100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1);
          }
        }

        .gradient-spinner {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: 4px solid transparent;
          background: conic-gradient(
            from 0deg,
            hsl(var(--primary)) 0deg,
            hsl(var(--primary) / 0.2) 120deg,
            hsl(var(--primary)) 240deg,
            hsl(var(--primary) / 0.2) 360deg
          );
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% {
            transform: rotate(360deg);
          }
        }

        .orbit {
          position: relative;
          width: 60px;
          height: 60px;
          border: 2px dashed hsl(var(--primary));
          border-radius: 50%;
          animation: rotate 2s linear infinite;
        }
        .planet {
          position: absolute;
          top: 0;
          left: 50%;
          width: 10px;
          height: 10px;
          background-color: hsl(var(--primary));
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }
        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }

        .dots-loader {
          display: flex;
          gap: 8px;
        }
        .dots-loader span {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: hsl(var(--primary));
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .dots-loader span:nth-child(1) {
          animation-delay: -0.32s;
        }
        .dots-loader span:nth-child(2) {
          animation-delay: -0.16s;
        }
        @keyframes bounce {
          0%,
          80%,
          100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          border-radius: 4px;
          background-color: hsl(var(--muted-foreground) / 0.2);
          overflow: hidden;
        }
        .progress {
          width: 50%;
          height: 100%;
          background-color: hsl(var(--primary));
          animation: load 1.5s linear infinite;
        }
        @keyframes load {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }

        .cube-loader {
            perspective: 120px;
        }
        .cube {
          width: 40px;
          height: 40px;
          background-color: hsl(var(--primary));
          animation: cube-rotate 1.2s infinite ease-in-out;
        }
        @keyframes cube-rotate {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(180deg);
          }
          100% {
            transform: rotateY(360deg);
          }
        }

        .shine-loader span {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(
            to right,
            hsl(var(--primary)) 20%,
            hsl(var(--primary) / 0.2) 40%,
            hsl(var(--primary)) 60%
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shine 2s linear infinite;
          background-size: 200% auto;
        }
        @keyframes shine {
          0% {
            background-position: 200% center;
          }
          100% {
            background-position: -200% center;
          }
        }
      `}</style>
    </div>
  );
}
