import {
  LayoutDashboard,
  HardHat,
  CalendarPlus,
  DollarSign,
  Users,
  Wallet,
  Globe,
  ListChecks,
  StickyNote,
  Settings,
  LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/obras", label: "Obras", icon: HardHat },
  { href: "/dias/novo", label: "Adicionar Dia", icon: CalendarPlus },
  { href: "/salarios", label: "Salarios", icon: DollarSign },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "#", label: "Equipe", icon: Users, comingSoon: true },
  { href: "#", label: "Financeiro", icon: Wallet, comingSoon: true },
  { href: "#", label: "Portfolio", icon: Globe, comingSoon: true },
  { href: "#", label: "Etapas", icon: ListChecks, comingSoon: true },
  { href: "#", label: "Notas", icon: StickyNote, comingSoon: true },
  { href: "#", label: "Configuracoes", icon: Settings, comingSoon: true },
];
