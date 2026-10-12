import {
  CalendarDays,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Shirt,
  Sparkles,
  WashingMachine,
  Luggage,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the compact mobile bar; the rest live under "More". */
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/wardrobe", label: "My Wardrobe", icon: Shirt, primary: true },
  { href: "/studio", label: "Outfit Studio", icon: Sparkles, primary: true },
  { href: "/stylist", label: "AI Stylist", icon: MessageCircle, primary: false },
  { href: "/packing", label: "Trip Packing", icon: Luggage, primary: false },
  { href: "/calendar", label: "Outfit Calendar", icon: CalendarDays, primary: false },
  { href: "/laundry", label: "Laundry", icon: WashingMachine, primary: true },
  { href: "/settings", label: "Settings", icon: Settings, primary: false },
];
