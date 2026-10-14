import { LayoutGrid, Wallet, Salad, CheckCircle2, Target, LineChart, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  accent?: "finance" | "nutrition" | "activities";
  shortcut?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, shortcut: "G O" },
  { href: "/finance", label: "Finance", icon: Wallet, accent: "finance", shortcut: "G F" },
  { href: "/nutrition", label: "Nutrition", icon: Salad, accent: "nutrition", shortcut: "G N" },
  { href: "/activities", label: "Activities", icon: CheckCircle2, accent: "activities", shortcut: "G A" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/insights", label: "Insights", icon: LineChart },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
