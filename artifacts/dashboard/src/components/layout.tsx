import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Gamepad2, Users, LayoutDashboard, Settings, Sun, Moon, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = [
    { name: "الرئيسية", href: "/", icon: LayoutDashboard },
    { name: "البطولات", href: "/tournaments", icon: Gamepad2 },
    { name: "التسجيلات", href: "/registrations", icon: Users },
    { name: "إعدادات البوت", href: "/bot", icon: Settings },
  ];

  const SidebarContent = () => (
    <>
      <div className="flex h-14 items-center justify-between border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold" onClick={() => setMobileOpen(false)}>
          <Gamepad2 className="h-6 w-6 text-primary flex-shrink-0" />
          <span className="text-base leading-tight">منظم بطولات FP</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
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
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
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
    </>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row" dir="rtl">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 right-0 z-10 hidden w-64 flex-col border-l bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-30 w-64 flex-col border-l bg-sidebar flex md:hidden transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Top Bar */}
      <div className="fixed top-0 right-0 left-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Gamepad2 className="h-5 w-5 text-primary" />
          <span className="text-sm">منظم بطولات FP</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Content */}
      <main className="flex w-full flex-col md:pr-64">
        <div className="flex-1 p-4 pt-16 md:pt-4 md:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
