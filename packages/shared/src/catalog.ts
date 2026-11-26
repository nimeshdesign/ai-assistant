import type { CategoryGroup } from './constants.js';

export interface CategoryDefinition {
  slug: string;
  name: string;
  group: CategoryGroup;
  /** lucide-react icon name */
  icon: string;
  description: string;
}

/**
 * Canonical question categories (Module 5). Used by the client for the practice
 * picker and by the server seed (Phase 4) to populate `question_categories`.
 */
export const CATEGORY_CATALOG: readonly CategoryDefinition[] = [
  // Frontend
  { slug: 'html', name: 'HTML', group: 'frontend', icon: 'FileCode', description: 'Semantics, forms, accessibility, SEO' },
  { slug: 'css', name: 'CSS', group: 'frontend', icon: 'Palette', description: 'Layout, specificity, flexbox, grid' },
  { slug: 'javascript', name: 'JavaScript', group: 'frontend', icon: 'Braces', description: 'Closures, async, prototypes, event loop' },
  { slug: 'react', name: 'React.js', group: 'frontend', icon: 'Atom', description: 'Components, rendering, state, performance' },
  { slug: 'nextjs', name: 'Next.js', group: 'frontend', icon: 'Triangle', description: 'Routing, SSR/SSG, server components' },
  { slug: 'typescript', name: 'TypeScript', group: 'frontend', icon: 'FileType', description: 'Types, generics, narrowing, utility types' },
  { slug: 'redux', name: 'Redux', group: 'frontend', icon: 'Boxes', description: 'Store, reducers, middleware, RTK' },
  { slug: 'react-hooks', name: 'React Hooks', group: 'frontend', icon: 'Anchor', description: 'useState, useEffect, memoisation, custom hooks' },
  // Backend
  { slug: 'nodejs', name: 'Node.js', group: 'backend', icon: 'Hexagon', description: 'Event loop, streams, modules, clustering' },
  { slug: 'express', name: 'Express.js', group: 'backend', icon: 'Route', description: 'Middleware, routing, error handling' },
  { slug: 'rest-apis', name: 'REST APIs', group: 'backend', icon: 'Network', description: 'Design, status codes, versioning, idempotency' },
  { slug: 'authentication', name: 'Authentication', group: 'backend', icon: 'KeyRound', description: 'Sessions, JWT, OAuth, hashing' },
  { slug: 'mongodb', name: 'MongoDB', group: 'backend', icon: 'Leaf', description: 'Documents, indexes, aggregation, modelling' },
  { slug: 'mysql', name: 'MySQL', group: 'backend', icon: 'Database', description: 'Queries, joins, indexes, transactions' },
  { slug: 'postgresql', name: 'PostgreSQL', group: 'backend', icon: 'DatabaseZap', description: 'Advanced SQL, JSONB, MVCC, performance' },
  // Programming
  { slug: 'dsa', name: 'Data Structures & Algorithms', group: 'programming', icon: 'GitFork', description: 'Arrays, trees, graphs, complexity' },
  { slug: 'problem-solving', name: 'Problem Solving', group: 'programming', icon: 'Puzzle', description: 'Approach, edge cases, trade-offs' },
  { slug: 'js-coding', name: 'JavaScript Coding Challenges', group: 'programming', icon: 'SquareCode', description: 'Implement debounce, flatten, promises…' },
  // Other
  { slug: 'system-design', name: 'System Design', group: 'other', icon: 'Workflow', description: 'Scalability, caching, queues, databases' },
  { slug: 'git', name: 'Git & GitHub', group: 'other', icon: 'GitBranch', description: 'Branching, rebasing, pull requests' },
  { slug: 'sdlc', name: 'Software Development Lifecycle', group: 'other', icon: 'RefreshCcw', description: 'Agile, testing, CI/CD, releases' },
  { slug: 'hr', name: 'HR Interview Questions', group: 'other', icon: 'Users', description: 'About you, teamwork, conflict, goals' },
] as const;

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  programming: 'Programming',
  other: 'Other',
};

export const JOB_ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'React Developer',
  'Node.js Developer',
  'MERN Stack Developer',
  'Software Engineer',
] as const;

export function getCategory(slug: string): CategoryDefinition | undefined {
  return CATEGORY_CATALOG.find((c) => c.slug === slug);
}
