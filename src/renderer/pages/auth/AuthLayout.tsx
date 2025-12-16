import ThemeToggle from "@/renderer/ui/theme-toggle";

export interface AuthLayoutProps {
  children: React.ReactNode;
}
       

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <section className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 relative">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Browzer
          </h1>
        </div>


        {children}

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </section>
  );
}
