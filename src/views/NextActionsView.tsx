import { useMemo } from 'react';
import { TaskGroup } from '@/components/TaskGroup';
import { SubtasksProvider } from '@/components/TaskRow';
import { useData } from '@/hooks/useData';
import { useT } from '@/hooks/useT';
import { displayTaskContent } from '@/domain/types';
import { selectGtdNextActions, type GtdReviewReason } from '@/domain/gtd';

const reasonKey: Record<GtdReviewReason, 'gtd.held' | 'gtd.outcome' | 'gtd.subtasks'> = {
  held: 'gtd.held',
  outcome: 'gtd.outcome',
  subtasks: 'gtd.subtasks',
};

/**
 * A safe, read-only GTD layer over Todoist's existing task data.
 * Selecting/completing a task uses the app's existing task detail and actions,
 * but the GTD classification itself never writes or auto-promotes anything.
 */
export function NextActionsView({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useT();
  const { snapshot, items, childrenOf } = useData();
  const { ready, needsReview } = useMemo(
    () => selectGtdNextActions(items, snapshot.projects),
    [items, snapshot.projects],
  );

  return (
    <SubtasksProvider value={false}>
      <div className="page">
        <div className="phead">
          <div className="phead-text">
            <h1 className="ptitle">{t('nav.next')}</h1>
            <p className="psub">{t('gtd.intro', { ready: ready.length, review: needsReview.length })}</p>
          </div>
        </div>

        <div className="mode">
          <TaskGroup
            title={t('gtd.ready')}
            items={ready}
            childrenOf={childrenOf}
            onOpen={onOpen}
            showSection
            draggable={false}
          />
          {ready.length === 0 && <p className="empty">{t('gtd.empty')}</p>}

          {needsReview.length > 0 && (
            <section className="group" aria-label={t('gtd.review')}>
              <div className="gheadblock">
                <div className="ghead">
                  <h2 className="gname">{t('gtd.review')}</h2>
                  <span className="gcount">{needsReview.length}</span>
                </div>
              </div>
              <p className="psub">{t('gtd.reviewHint')}</p>
              {needsReview.map(({ item, reason }) => (
                <button
                  key={item.id}
                  className="navitem"
                  type="button"
                  onClick={() => onOpen(item.id)}
                  aria-label={displayTaskContent(item) + ' — ' + t(reasonKey[reason])}
                >
                  <span className="label">{displayTaskContent(item)}</span>
                  <small>{t(reasonKey[reason])}</small>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </SubtasksProvider>
  );
}
