import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileBarChart,
  History as HistoryIcon,
  Mic,
  RotateCcw,
  ScanText,
  Search,
  Trash2,
  Type,
} from 'lucide-react';
import { SESSION_TYPES, getCategory, type HistoryItem, type SessionType } from '@aia/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, ScoreBadge } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/form-controls';
import { ConfirmDialog, Tabs, TabsList, TabsTrigger, Tooltip } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClearHistoryMutation,
  useDeleteHistoryItemMutation,
  useGetHistoryQuery,
  useSetBookmarkMutation,
} from '@/store/historyApi';
import { errorMessage } from '@/store/api';
import { SESSION_TYPE_LABELS, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 8;
const INPUT_ICONS = { text: Type, voice: Mic, screen: ScanText } as const;

export default function HistoryPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<SessionType | 'all'>('all');
  const [page, setPage] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const term = useDeferredValue(q);

  const { data, isLoading, isFetching, isError, refetch } = useGetHistoryQuery({ q: term, type, page, limit: PAGE_SIZE });
  const [clearAll] = useClearHistoryMutation();

  const resetPage = () => setPage(1);

  return (
    <>
      <PageHeader
        title="History"
        description="Review, search and re-practise your previous questions."
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmClear(true)} disabled={!data || data.meta.total === 0}>
              <Trash2 /> Clear history
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={type}
          onValueChange={(v) => {
            setType(v as SessionType | 'all');
            resetPage();
          }}
        >
          <TabsList aria-label="Filter by session type">
            <TabsTrigger value="all">All</TabsTrigger>
            {SESSION_TYPES.map((t) => (
              <TabsTrigger key={t} value={t}>
                {SESSION_TYPE_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search history"
            placeholder="Search questions…"
            className="pl-9"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
          />
        </div>
      </div>

      <Card className={cn('gap-0 py-0 transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="space-y-2 border-b p-4 last:border-0">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title={term || type !== 'all' ? 'No matching history' : 'No history yet'}
            description={
              term || type !== 'all'
                ? 'Try a different search or filter.'
                : 'Questions you practise or ask the assistant will show up here.'
            }
            action={
              !term && type === 'all' ? (
                <Button size="sm" asChild>
                  <Link to="/practice">Start practising</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y" aria-label="History entries">
            {data.items.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>

      {data && data.meta.totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} entries
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight />
            </Button>
          </div>
        </nav>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Delete all history?"
        description="This permanently deletes every saved question and answer, and all mock interviews and reports. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        onConfirm={async () => {
          try {
            await clearAll().unwrap();
            resetPage();
            toast.success('History deleted');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteItem, { isLoading: deleting }] = useDeleteHistoryItemMutation();
  const [setBookmark] = useSetBookmarkMutation();
  const InputIcon = INPUT_ICONS[item.inputMode];
  const category = item.categorySlug ? getCategory(item.categorySlug) : undefined;
  const panelId = `history-${item.id}`;

  return (
    <li className="p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="group flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium group-hover:underline">{item.questionText}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <InputIcon className="size-3" aria-label={`${item.inputMode} input`} />
              {SESSION_TYPE_LABELS[item.sessionType]}
              {category && <Badge variant="secondary">{category.name}</Badge>}
              <span>{timeAgo(item.createdAt)}</span>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {item.score !== undefined && <ScoreBadge score={item.score} />}
          <Tooltip content={item.isBookmarked ? 'Remove bookmark' : 'Bookmark'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={item.isBookmarked}
              aria-label={item.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              onClick={() =>
                setBookmark({ id: item.id, isBookmarked: !item.isBookmarked })
                  .unwrap()
                  .catch((err) => toast.error(errorMessage(err)))
              }
            >
              {item.isBookmarked ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
            </Button>
          </Tooltip>
          <Tooltip content="Delete">
            <Button variant="ghost" size="icon-sm" aria-label="Delete entry" disabled={deleting} onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </Tooltip>
        </div>
      </div>

      {open && (
        <div id={panelId} className="mt-3 ml-6 space-y-3 text-sm">
          {item.userResponse && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Your answer</p>
              {item.userResponse}
            </div>
          )}
          {item.feedback && <p className="leading-relaxed text-muted-foreground">{item.feedback}</p>}
          {item.answer ? (
            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Interview-ready answer</p>
              <p className="leading-relaxed">{item.answer.interviewReadyAnswer}</p>
            </div>
          ) : item.improvedAnswer ? (
            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Improved answer</p>
              <p className="leading-relaxed">{item.improvedAnswer}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">No saved answer for this question.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.categorySlug && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/practice/session?categories=${item.categorySlug}&difficulty=mixed&count=5`}>
                  <RotateCcw /> Practise this topic
                </Link>
              </Button>
            )}
            {item.mockInterviewId && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/mock-interview/${item.mockInterviewId}/report`}>
                  <FileBarChart /> View report
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this entry?"
        description="The question and its saved answer will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await deleteItem(item.id).unwrap();
            toast.success('Entry deleted');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </li>
  );
}
