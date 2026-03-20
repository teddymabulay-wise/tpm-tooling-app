import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { useOmneaEnvironment } from "@/components/use-omnea-environment";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Outlet } from "react-router-dom";

export const AppLayout = () => {
  const { environment, label, setEnvironment } = useOmneaEnvironment();
  const [pendingEnvironment, setPendingEnvironment] = useState<"qa" | "production" | null>(null);

  const isProduction = environment === "production";

  const handleEnvironmentToggle = (checked: boolean) => {
    setPendingEnvironment(checked ? "production" : "qa");
  };

  const handleConfirm = () => {
    if (pendingEnvironment) setEnvironment(pendingEnvironment);
    setPendingEnvironment(null);
  };

  const handleCancel = () => {
    setPendingEnvironment(null);
  };

  const switchingToProduction = pendingEnvironment === "production";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className={cn(
              "border-b px-4 sticky top-0 z-10 backdrop-blur",
              isProduction
                ? "bg-amber-50 border-amber-200"
                : "bg-sky-50 border-sky-200"
            )}
          >
            <div className={cn("h-0.5 -mx-4 mb-0", isProduction ? "bg-amber-400" : "bg-sky-400")} />
            <div className="h-12 flex items-center justify-between gap-4">
              <div className="flex items-center min-w-0">
                <SidebarTrigger className="mr-3" />
                <span className="text-xs text-muted-foreground truncate">
                  TPM Tooling — Omnea API
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-medium",
                    isProduction
                      ? "border-amber-300 bg-amber-100 text-amber-900"
                      : "border-sky-300 bg-sky-100 text-sky-900"
                  )}
                >
                  {label}
                </Badge>
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn(!isProduction ? "font-semibold text-sky-900" : "text-muted-foreground")}>
                    QA
                  </span>
                  <Switch checked={isProduction} onCheckedChange={handleEnvironmentToggle} />
                  <span className={cn(isProduction ? "font-semibold text-amber-900" : "text-muted-foreground")}>
                    Production
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>

      <AlertDialog open={pendingEnvironment !== null} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {switchingToProduction ? "Switch to Production?" : "Switch to QA?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {switchingToProduction
                ? "This will use live Omnea credentials. All API requests will target the production environment and affect real data."
                : "This will switch back to non-production credentials. API requests will target the QA environment."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={switchingToProduction ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              {switchingToProduction ? "Switch to Production" : "Switch to QA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};
