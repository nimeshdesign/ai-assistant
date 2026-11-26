import type { Difficulty, QuestionType } from '../constants.js';

export interface SeedQuestion {
  category: string; // category slug
  question: string;
  difficulty: Difficulty;
  type: QuestionType;
  tags: string[];
}

type Row = [category: string, question: string, difficulty: Difficulty, type: QuestionType, tags: string[]];

/**
 * Starter question bank (Module 5), about 6 questions per category.
 * Seeded into `interview_questions` by `npm run seed` and automatically on first start.
 * Exposed only via the `@aia/shared/seed` entry point so it never ships in the web bundle.
 */
const ROWS: Row[] = [
  // ---------------- Frontend ----------------
  ['html', 'What is semantic HTML and why does it matter?', 'easy', 'conceptual', ['semantics', 'a11y']],
  ['html', 'How do you make a form accessible?', 'medium', 'conceptual', ['forms', 'a11y']],
  ['html', 'What is the difference between block and inline elements?', 'easy', 'conceptual', ['layout']],
  ['html', 'What are data attributes and when would you use them?', 'easy', 'conceptual', ['attributes']],
  ['html', 'What is the difference between localStorage, sessionStorage and cookies?', 'medium', 'conceptual', ['storage', 'browser']],
  ['html', 'How do the async and defer attributes change how scripts load?', 'medium', 'conceptual', ['performance', 'scripts']],

  ['css', 'Explain the CSS box model.', 'easy', 'conceptual', ['box-model']],
  ['css', 'When would you use CSS Grid instead of Flexbox?', 'medium', 'conceptual', ['grid', 'flexbox']],
  ['css', 'How does CSS specificity work?', 'medium', 'conceptual', ['specificity']],
  ['css', 'What is the difference between position relative, absolute, fixed and sticky?', 'easy', 'conceptual', ['positioning']],
  ['css', 'How would you build a responsive layout without media queries?', 'hard', 'scenario', ['responsive', 'grid']],
  ['css', 'What are CSS custom properties and how are they different from Sass variables?', 'medium', 'conceptual', ['variables']],

  ['javascript', 'What is a closure in JavaScript?', 'easy', 'conceptual', ['closures', 'scope']],
  ['javascript', 'Explain the difference between == and ===.', 'easy', 'conceptual', ['equality']],
  ['javascript', 'How does the JavaScript event loop work?', 'medium', 'conceptual', ['event-loop', 'async']],
  ['javascript', 'What is the difference between var, let and const?', 'easy', 'conceptual', ['scope']],
  ['javascript', 'Explain prototypal inheritance.', 'hard', 'conceptual', ['prototypes']],
  ['javascript', 'How does the value of this work in JavaScript?', 'medium', 'conceptual', ['this', 'functions']],
  ['javascript', 'What is the difference between promises and async/await?', 'medium', 'conceptual', ['async', 'promises']],

  ['react', 'What is the virtual DOM and how does React use it?', 'easy', 'conceptual', ['rendering']],
  ['react', 'Why do lists in React need keys?', 'easy', 'conceptual', ['lists', 'reconciliation']],
  ['react', 'How would you improve the performance of a slow React app?', 'hard', 'scenario', ['performance']],
  ['react', 'What is the difference between controlled and uncontrolled components?', 'medium', 'conceptual', ['forms']],
  ['react', 'What is prop drilling and how can you avoid it?', 'medium', 'conceptual', ['state', 'context']],
  ['react', 'What are error boundaries?', 'medium', 'conceptual', ['errors']],

  ['react-hooks', 'When should you use useMemo vs useCallback?', 'medium', 'conceptual', ['memoization']],
  ['react-hooks', 'Explain the useEffect dependency array.', 'medium', 'conceptual', ['effects']],
  ['react-hooks', 'How do you write a custom hook?', 'medium', 'coding', ['custom-hooks']],
  ['react-hooks', 'What are the rules of hooks and why do they exist?', 'easy', 'conceptual', ['rules']],
  ['react-hooks', 'When would you use useReducer instead of useState?', 'medium', 'conceptual', ['state']],
  ['react-hooks', 'What is the difference between useRef and useState?', 'easy', 'conceptual', ['refs']],

  ['nextjs', 'What is the difference between SSR, SSG and ISR in Next.js?', 'medium', 'conceptual', ['rendering']],
  ['nextjs', 'What are React Server Components and how does Next.js use them?', 'hard', 'conceptual', ['rsc']],
  ['nextjs', 'How does routing work in the Next.js App Router?', 'easy', 'conceptual', ['routing']],
  ['nextjs', 'How do you fetch data in a Next.js page?', 'medium', 'conceptual', ['data-fetching']],
  ['nextjs', 'What is middleware in Next.js used for?', 'medium', 'conceptual', ['middleware']],
  ['nextjs', 'How do you optimise images in Next.js?', 'easy', 'conceptual', ['performance', 'images']],

  ['typescript', 'What is the difference between an interface and a type alias?', 'easy', 'conceptual', ['types']],
  ['typescript', 'Explain generics with an example.', 'medium', 'conceptual', ['generics']],
  ['typescript', 'What is the difference between unknown and any?', 'easy', 'conceptual', ['types', 'safety']],
  ['typescript', 'What are union types and how do you narrow them?', 'medium', 'conceptual', ['narrowing']],
  ['typescript', 'How do utility types like Partial, Pick and Omit work?', 'medium', 'conceptual', ['utility-types']],
  ['typescript', 'What is a discriminated union?', 'hard', 'conceptual', ['unions']],

  ['redux', 'Explain the Redux data flow.', 'easy', 'conceptual', ['store', 'reducers']],
  ['redux', 'Why does Redux Toolkit let you "mutate" state in reducers?', 'medium', 'conceptual', ['immer', 'rtk']],
  ['redux', 'When should you use Redux instead of React context?', 'medium', 'conceptual', ['state', 'context']],
  ['redux', 'What is middleware in Redux?', 'medium', 'conceptual', ['middleware']],
  ['redux', 'How does RTK Query handle caching?', 'hard', 'conceptual', ['rtk-query', 'caching']],
  ['redux', 'Why must reducers be pure functions?', 'easy', 'conceptual', ['reducers']],

  // ---------------- Backend ----------------
  ['nodejs', 'Explain the Node.js event loop phases.', 'hard', 'conceptual', ['event-loop']],
  ['nodejs', 'What are streams in Node.js and when would you use them?', 'medium', 'conceptual', ['streams']],
  ['nodejs', 'What is the difference between CommonJS and ES modules?', 'easy', 'conceptual', ['modules']],
  ['nodejs', 'How would you handle a CPU-heavy task in Node.js?', 'hard', 'scenario', ['worker-threads', 'performance']],
  ['nodejs', 'What is the difference between process.nextTick and setImmediate?', 'medium', 'conceptual', ['event-loop']],
  ['nodejs', 'How do you manage environment variables and secrets in Node.js?', 'easy', 'conceptual', ['config', 'security']],

  ['express', 'What is middleware in Express?', 'easy', 'conceptual', ['middleware']],
  ['express', 'How do you handle errors in an Express app?', 'medium', 'conceptual', ['errors']],
  ['express', 'How would you structure a large Express application?', 'medium', 'scenario', ['architecture']],
  ['express', 'How do you validate request input in Express?', 'easy', 'conceptual', ['validation']],
  ['express', 'What is the difference between app.use and app.get?', 'easy', 'conceptual', ['routing']],
  ['express', 'How would you add rate limiting to an Express API?', 'medium', 'scenario', ['security']],

  ['rest-apis', 'What makes an API RESTful?', 'easy', 'conceptual', ['rest']],
  ['rest-apis', 'What is idempotency and which HTTP methods are idempotent?', 'medium', 'conceptual', ['http']],
  ['rest-apis', 'Which HTTP status codes would you use for common API responses?', 'easy', 'conceptual', ['http', 'status-codes']],
  ['rest-apis', 'How would you version a REST API?', 'medium', 'conceptual', ['versioning']],
  ['rest-apis', 'How do you design pagination for a large collection?', 'medium', 'scenario', ['pagination']],
  ['rest-apis', 'What is the difference between PUT and PATCH?', 'easy', 'conceptual', ['http']],

  ['authentication', 'How does JWT authentication work?', 'medium', 'conceptual', ['jwt']],
  ['authentication', 'Where should you store tokens in a browser app?', 'hard', 'scenario', ['security']],
  ['authentication', 'What is the difference between authentication and authorization?', 'easy', 'conceptual', ['basics']],
  ['authentication', 'How should passwords be stored?', 'medium', 'conceptual', ['hashing', 'security']],
  ['authentication', 'How does OAuth 2.0 work at a high level?', 'medium', 'conceptual', ['oauth']],
  ['authentication', 'What is CSRF and how do you prevent it?', 'hard', 'conceptual', ['csrf', 'security']],

  ['mongodb', 'When would you embed vs reference documents in MongoDB?', 'medium', 'conceptual', ['modelling']],
  ['mongodb', 'How do indexes improve query performance?', 'medium', 'conceptual', ['indexes']],
  ['mongodb', 'What is the aggregation pipeline?', 'medium', 'conceptual', ['aggregation']],
  ['mongodb', 'What is the difference between MongoDB and a relational database?', 'easy', 'conceptual', ['nosql']],
  ['mongodb', 'How do transactions work in MongoDB?', 'hard', 'conceptual', ['transactions']],
  ['mongodb', 'What is a TTL index and when would you use it?', 'easy', 'conceptual', ['indexes']],

  ['mysql', 'Explain the different types of SQL joins.', 'easy', 'conceptual', ['joins']],
  ['mysql', 'What is database normalization?', 'medium', 'conceptual', ['normalization']],
  ['mysql', 'What is the difference between WHERE and HAVING?', 'easy', 'conceptual', ['queries']],
  ['mysql', 'How would you find and fix a slow query?', 'hard', 'scenario', ['performance', 'explain']],
  ['mysql', 'What is the difference between a primary key and a unique key?', 'easy', 'conceptual', ['keys']],
  ['mysql', 'Write a query to find the second-highest salary.', 'medium', 'coding', ['queries']],

  ['postgresql', 'What are transactions and isolation levels?', 'hard', 'conceptual', ['transactions']],
  ['postgresql', 'When would you use a JSONB column?', 'medium', 'conceptual', ['jsonb']],
  ['postgresql', 'What is MVCC?', 'hard', 'conceptual', ['mvcc']],
  ['postgresql', 'How do you use EXPLAIN ANALYZE?', 'medium', 'conceptual', ['performance']],
  ['postgresql', 'What are window functions?', 'medium', 'conceptual', ['queries']],
  ['postgresql', 'What is the difference between a view and a materialized view?', 'medium', 'conceptual', ['views']],

  // ---------------- Programming ----------------
  ['dsa', 'What is the time complexity of searching a balanced binary search tree?', 'easy', 'conceptual', ['bst', 'complexity']],
  ['dsa', 'How would you detect a cycle in a linked list?', 'medium', 'coding', ['linked-list']],
  ['dsa', 'What is the difference between a stack and a queue?', 'easy', 'conceptual', ['stack', 'queue']],
  ['dsa', 'How does a hash map work?', 'medium', 'conceptual', ['hashing']],
  ['dsa', 'Explain BFS vs DFS and when to use each.', 'medium', 'conceptual', ['graphs']],
  ['dsa', 'What is dynamic programming? Give an example.', 'hard', 'conceptual', ['dp']],

  ['problem-solving', 'How do you approach a problem you have never seen before?', 'medium', 'behavioral', ['approach']],
  ['problem-solving', 'How do you debug an issue you cannot reproduce?', 'hard', 'scenario', ['debugging']],
  ['problem-solving', 'How do you decide between two technical solutions?', 'medium', 'scenario', ['trade-offs']],
  ['problem-solving', 'How do you break down a large feature into tasks?', 'easy', 'behavioral', ['planning']],
  ['problem-solving', 'What edge cases would you test for a login form?', 'easy', 'scenario', ['testing']],
  ['problem-solving', 'Tell me about a difficult bug you fixed.', 'medium', 'behavioral', ['debugging']],

  ['js-coding', 'Implement a debounce function.', 'medium', 'coding', ['debounce']],
  ['js-coding', 'Flatten a deeply nested array without using flat().', 'medium', 'coding', ['recursion']],
  ['js-coding', 'Implement Promise.all from scratch.', 'hard', 'coding', ['promises']],
  ['js-coding', 'Write a function to deep clone an object.', 'medium', 'coding', ['objects']],
  ['js-coding', 'Reverse the words in a string.', 'easy', 'coding', ['strings']],
  ['js-coding', 'Check whether two strings are anagrams.', 'easy', 'coding', ['strings']],

  // ---------------- Other ----------------
  ['system-design', 'How would you design a URL shortener?', 'hard', 'system_design', ['scalability']],
  ['system-design', 'What is caching and where would you add it?', 'medium', 'system_design', ['caching']],
  ['system-design', 'What is the difference between horizontal and vertical scaling?', 'easy', 'system_design', ['scaling']],
  ['system-design', 'When would you use a message queue?', 'medium', 'system_design', ['queues']],
  ['system-design', 'How would you design a real-time chat application?', 'hard', 'system_design', ['websockets']],
  ['system-design', 'What is a load balancer and how does it work?', 'easy', 'system_design', ['load-balancing']],

  ['git', 'What is the difference between git merge and git rebase?', 'medium', 'conceptual', ['branching']],
  ['git', 'How do you resolve a merge conflict?', 'easy', 'conceptual', ['conflicts']],
  ['git', 'What is the difference between git fetch and git pull?', 'easy', 'conceptual', ['remotes']],
  ['git', 'How would you undo a commit that was already pushed?', 'medium', 'scenario', ['revert']],
  ['git', 'Describe a good branching strategy for a team.', 'medium', 'conceptual', ['workflow']],
  ['git', 'What makes a good pull request?', 'easy', 'behavioral', ['code-review']],

  ['sdlc', 'What does a good CI/CD pipeline look like?', 'medium', 'conceptual', ['ci-cd']],
  ['sdlc', 'What is the difference between Agile and Waterfall?', 'easy', 'conceptual', ['agile']],
  ['sdlc', 'What is the testing pyramid?', 'medium', 'conceptual', ['testing']],
  ['sdlc', 'What happens in a sprint retrospective?', 'easy', 'conceptual', ['scrum']],
  ['sdlc', 'How do you make sure code is ready for production?', 'medium', 'scenario', ['quality']],
  ['sdlc', 'What is technical debt and how do you manage it?', 'medium', 'conceptual', ['maintenance']],

  ['hr', 'Tell me about yourself.', 'easy', 'behavioral', ['intro']],
  ['hr', 'Describe a time you disagreed with a teammate.', 'medium', 'behavioral', ['conflict']],
  ['hr', 'Why do you want to work here?', 'easy', 'behavioral', ['motivation']],
  ['hr', 'What is your biggest weakness?', 'medium', 'behavioral', ['self-awareness']],
  ['hr', 'Where do you see yourself in five years?', 'easy', 'behavioral', ['goals']],
  ['hr', 'Tell me about a time you missed a deadline.', 'medium', 'behavioral', ['accountability']],
];

export const QUESTION_BANK: readonly SeedQuestion[] = ROWS.map(([category, question, difficulty, type, tags]) => ({
  category,
  question,
  difficulty,
  type,
  tags,
}));
