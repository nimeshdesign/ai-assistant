/**
 * Domain enums shared by the server (Mongoose validation) and the client (UI + forms).
 * Declared as readonly tuples so we get both runtime arrays and literal union types.
 */

export const EXPERIENCE_LEVELS = ['fresher', 'junior', 'mid', 'senior', 'lead'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const CATEGORY_GROUPS = ['frontend', 'backend', 'programming', 'other'] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const QUESTION_TYPES = ['conceptual', 'coding', 'behavioral', 'system_design', 'scenario'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Where a question entered the system. */
export const QUESTION_SOURCES = ['seed', 'ai_generated', 'user', 'screen', 'voice'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const SESSION_TYPES = ['practice', 'assistant', 'voice', 'mock'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_STATUSES = ['active', 'paused', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const MOCK_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;
export type MockStatus = (typeof MOCK_STATUSES)[number];

export const INPUT_MODES = ['text', 'voice', 'screen'] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const ANSWER_LENGTHS = ['short', 'normal', 'detailed'] as const;
export type AnswerLength = (typeof ANSWER_LENGTHS)[number];

export const ANSWER_STYLES = ['conversational', 'technical', 'concise'] as const;
export type AnswerStyle = (typeof ANSWER_STYLES)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Evaluation dimensions for mock interviews (0–100 each). */
export const EVALUATION_CRITERIA = [
  'technicalAccuracy',
  'communication',
  'structure',
  'practicalKnowledge',
  'confidence',
] as const;
export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

export const PASSWORD_MIN_LENGTH = 8;
export const API_PREFIX = '/api/v1';
