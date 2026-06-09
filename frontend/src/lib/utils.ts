import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string, fmt = 'MMM d, yyyy') {
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt) : dateStr;
  } catch {
    return dateStr;
  }
}

export function formatTime(dateStr: string) {
  return formatDate(dateStr, 'h:mm a');
}

export function formatDateTime(dateStr: string) {
  return formatDate(dateStr, 'MMM d, yyyy h:mm a');
}

export function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

export function getPriorityColor(priority: string) {
  const map: Record<string, string> = {
    low: 'text-blue-400 bg-blue-400/10',
    medium: 'text-yellow-400 bg-yellow-400/10',
    high: 'text-orange-400 bg-orange-400/10',
    urgent: 'text-red-400 bg-red-400/10',
  };
  return map[priority] || 'text-gray-400 bg-gray-400/10';
}

export function getStatusColor(status: string) {
  const map: Record<string, string> = {
    todo: 'text-gray-400 bg-gray-400/10',
    in_progress: 'text-blue-400 bg-blue-400/10',
    review: 'text-purple-400 bg-purple-400/10',
    done: 'text-green-400 bg-green-400/10',
  };
  return map[status] || 'text-gray-400 bg-gray-400/10';
}

export function getRoleColor(role: string) {
  const map: Record<string, string> = {
    user: 'text-gray-300 bg-gray-700',
    manager: 'text-blue-300 bg-blue-900/50',
    administrator: 'text-purple-300 bg-purple-900/50',
  };
  return map[role] || 'text-gray-300 bg-gray-700';
}

export function minutesToDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
