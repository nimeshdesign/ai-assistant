import { toast } from 'sonner';
import type { AnswerLength, AnswerSource, InputMode } from '@aia/shared';
import { errorCode, errorMessage } from '@/store/api';
import { aiErrorCopy, useGenerateAnswerQuery, useRegenerateAnswerMutation } from '@/store/aiApi';
import type { AnswerCardProps } from '@/components/answer/AnswerCard';

/**
 * Everything an <AnswerCard> needs for one question: fetch (cached per question + length),
 * retry, and regenerate. A failed regenerate keeps the current answer and shows a toast.
 */
export function useAiAnswer(
  question: string | null | undefined,
  length: AnswerLength,
  /** Where it was asked: the server saves the answer to that part of the history (if "Save history" is on). */
  record: { source: AnswerSource; inputMode?: InputMode; questionId?: string },
): Pick<AnswerCardProps, 'answer' | 'isLoading' | 'error' | 'onRetry' | 'onRegenerate' | 'isRegenerating'> {
  const args = {
    question: question ?? '',
    length,
    source: record.source,
    ...(record.inputMode ? { inputMode: record.inputMode } : {}),
    ...(record.questionId ? { questionId: record.questionId } : {}),
  };
  const query = useGenerateAnswerQuery(args, { skip: !question });
  const [regenerate, regen] = useRegenerateAnswerMutation();

  return {
    answer: query.data,
    isLoading: query.isFetching,
    error: query.error,
    onRetry: () => void query.refetch(),
    isRegenerating: regen.isLoading,
    onRegenerate: async () => {
      try {
        await regenerate(args).unwrap();
      } catch (err) {
        const copy = aiErrorCopy(errorCode(err), errorMessage(err, 'Could not regenerate the answer.'));
        toast.error(copy.description);
      }
    },
  };
}
