import { NavLink, Outlet } from "react-router-dom";
import { Activity, SlidersHorizontal, Store, UserPlus, Bot, Zap, LogOut, Code2 } from "lucide-react";
import TickerBar from "./TickerBar";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const navItems = [
  { to: "/marketplace", label: "Marketplace", icon: Store, end: true },
  { to: "/my-agent", label: "My Agent", icon: Bot },
  { to: "/budget", label: "Budget", icon: SlidersHorizontal },
  { to: "/activity", label: "Live Activity", icon: Activity },
  { to: "/register", label: "Register Agent", icon: UserPlus },
  { to: "/docs/agent-api", label: "Agent API", icon: Code2 },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const handleSignOut = async () => {
    await signOut();
    toast.success("Disconnected from node.");
  };
  return (
    <div className="flex min-h-screen w-full bg-background relative">
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col sticky top-0 h-screen z-10">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <NavLink to="/marketplace" className="flex items-center gap-2 group">
            <div className="relative">
              <Zap className="h-6 w-6 text-primary fill-primary/20 animate-bolt" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display text-lg leading-none text-foreground">
                GROUND<span className="text-primary text-glow-amber">TRUTH</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                Lightning · Agents · Sats
              </div>
            </div>
          </NavLink>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 px-3 py-2">
            Terminals
          </div>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm transition-all relative ${
                  isActive
                    ? "bg-sidebar-accent text-primary text-glow-amber border-l-2 border-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground border-l-2 border-transparent"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="font-medium tracking-tight">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-accent shadow-mint animate-pulse" />
            <span className="text-muted-foreground">Lightning node</span>
            <span className="text-accent ml-auto">ONLINE</span>
          </div>
          <div className="text-[10px] text-muted-foreground/70 leading-snug">
            mainnet · 03f2b...d8ac<br />
            block 873,442
          </div>
          {user && (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-2 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-alert hover:bg-alert/5 rounded-sm transition-colors border-t border-sidebar-border pt-3 mt-1"
              title={user.email ?? "Sign out"}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="truncate">Sign out</span>
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TickerBar />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
