import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Gamepad2, Users, LayoutDashboard, Settings, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const navigation = [
    { name: "الرئيسية", href: "/", icon: LayoutDashboard },
    { name: "البطولات", href: "/tournaments", icon: Gamepad2 },
    { name: "التسجيلات", href: "/registrations", icon: Users },
    { name: "إعدادات البوت", href: "/bot", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row" dir="rtl">
      {/* Sidebar — right side for RTL */}
      <aside className="fixed inset-y-0 right-0 z-10 hidden w-64 flex-col border-l bg-sidebar md:flex">
        <div className="flex h-14 items-center justify-between border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Gamepad2 className="h-6 w-6 text-primary flex-shrink-0" />
            <span className="text-base leading-tight">منظم بطولات FP</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:text-primary",
                    isActive ? "bg-muted text-primary" : "text-muted-foreground"
                  )}
                  data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Theme toggle at bottom of sidebar */}
        <div className="border-t p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 justify-center"
            onClick={toggleTheme}
            data-testid="btn-toggle-theme"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-4 w-4" />
                الوضع النهاري
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                الوضع الليلي
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content — pad right for RTL sidebar */}
      <main className="flex w-full flex-col md:pr-64">
        <div className="flex-1 p-4 md:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
