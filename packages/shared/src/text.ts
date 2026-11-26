/**
 * Normalise question text so that trivially different captures of the same
 * question (OCR noise, casing, punctuation, extra spaces) compare equal.
 * Used on the client to skip unchanged screen content and on the server
 * to compute `contentHash` for repeated-question detection.
 */
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
