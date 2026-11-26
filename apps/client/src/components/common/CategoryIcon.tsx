import {
  Anchor,
  Atom,
  Boxes,
  Braces,
  Database,
  DatabaseZap,
  FileCode,
  FileType,
  GitBranch,
  GitFork,
  Hexagon,
  KeyRound,
  Leaf,
  Network,
  Palette,
  Puzzle,
  RefreshCcw,
  Route,
  SquareCode,
  Tag,
  Triangle,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

// Explicit map (instead of importing every icon) keeps the bundle small.
const ICONS: Record<string, LucideIcon> = {
  Anchor,
  Atom,
  Boxes,
  Braces,
  Database,
  DatabaseZap,
  FileCode,
  FileType,
  GitBranch,
  GitFork,
  Hexagon,
  KeyRound,
  Leaf,
  Network,
  Palette,
  Puzzle,
  RefreshCcw,
  Route,
  SquareCode,
  Triangle,
  Users,
  Workflow,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Tag;
  return <Icon className={className} aria-hidden />;
}
