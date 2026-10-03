import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatEta(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}
