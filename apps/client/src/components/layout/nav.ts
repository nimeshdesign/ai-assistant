import {
  BookOpenCheck,
  History,
  LayoutDashboard,
  Mic,
  MessagesSquare,
  ScanText,
  Settings,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Your progress at a glance' },
    ],
  },
  {
    title: 'Prepare',
    items: [
      { to: '/practice', label: 'Practice', icon: BookOpenCheck, description: 'Questions by topic and difficulty' },
      { to: '/mock-interview', label: 'Mock Interview', icon: MessagesSquare, description: 'Realistic interview with feedback' },
    ],
  },
  {
    title: 'Assist',
    items: [
      { to: '/assistant', label: 'Screen Assistant', icon: ScanText, description: 'Read questions from your screen' },
      { to: '/voice', label: 'Voice Assistant', icon: Mic, description: 'Ask by voice, hear the answer' },
      { to: '/tools', label: 'AI Tools', icon: Wand2, description: 'Ask, explain concepts, review code' },
    ],
  },
  {
    title: 'Library',
    items: [
      { to: '/history', label: 'History', icon: History, description: 'Past questions, answers and reports' },
      { to: '/settings', label: 'Settings', icon: Settings, description: 'Profile, preferences and privacy' },
    ],
  },
];
