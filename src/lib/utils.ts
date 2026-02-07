import { format, formatDistanceToNow, differenceInSeconds } from "date-fns";
import { fr } from "date-fns/locale";

export function formatDate(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy", { locale: fr });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy HH:mm", { locale: fr });
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), "HH:mm", { locale: fr });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function formatCurrency(euros: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(euros);
}

export function formatPhone(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\s/g, "");
  if (cleaned.startsWith("+33") && cleaned.length === 12) {
    return cleaned.replace(/(\+33)(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5 $6");
  }
  return phone;
}

export function getDurationBetween(start: string, end: string): number {
  return differenceInSeconds(new Date(end), new Date(start));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
