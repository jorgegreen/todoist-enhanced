import type { Item, Project } from './types';
import { displayTaskContent, isUncompletable } from './types';
import { isOpen } from './views';

/**
 * GTD pilot: Todoist stays the source of truth. We NEVER add or remove labels
 * automatically here. An action is a *manually captured* candidate:
 *  - labelled next_action / next-action / next action, OR
 *  - filed under the user's Next Actions project.
 *
 * A leaf is not automatically a next action just because it is a leaf.
 * Dates represent commitments/deadlines, not dependency information, so
 * future-dated tasks are intentionally not hidden by this selector.
 */
export type GtdReviewReason = 'held' | 'outcome' | 'subtasks';

export interface GtdReviewItem {
  item: Item;
  reason: GtdReviewReason;
}

export interface GtdActionSelection {
  ready: Item[];
  needsReview: GtdReviewItem[];
}

const normalized = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const hasAnyLabel = (item: Item, names: ReadonlySet<string>): boolean =>
  item.labels.some((label) => names.has(normalized(label)));

const NEXT_ACTION_LABELS = new Set(['nextaction', 'nextactions']);
const HELD_LABELS = new Set(['waiting', 'waitingfor', 'onhold', 'blocked', 'someday', 'somedaymaybe']);
const OUTCOME_LABELS = new Set(['project', 'outcome']);
const NEXT_ACTION_PROJECTS = new Set(['nextaction', 'nextactions']);
const HELD_PROJECTS = new Set(['waitingfor', 'waiting', 'onhold', 'someday', 'somedaymaybe']);

/** Check both the project's own name and parent projects, without trusting a cycle. */
function projectFlags(projectId: string, projects: Record<string, Project>): {
  nextActions: boolean;
  held: boolean;
} {
  const seen = new Set<string>();
  let id: string | null = projectId;
  let nextActions = false;
  let held = false;
  while (id && !seen.has(id)) {
    seen.add(id);
    const project: Project | undefined = projects[id];
    if (!project) break;
    const name = normalized(project.name);
    nextActions ||= NEXT_ACTION_PROJECTS.has(name);
    held ||= HELD_PROJECTS.has(name);
    id = project.parent_id;
  }
  return { nextActions, held };
}

/** A parent's Waiting For / On Hold flag applies to all its subtasks. */
function heldByAncestor(item: Item, byId: Map<string, Item>): boolean {
  const seen = new Set<string>([item.id]);
  let id = item.parent_id;
  while (id && !seen.has(id)) {
    seen.add(id);
    const parent = byId.get(id);
    if (!parent) break;
    if (hasAnyLabel(parent, HELD_LABELS)) return true;
    id = parent.parent_id;
  }
  return false;
}

/**
 * Returns a read-only snapshot of the user's marked Next Actions.
 *
 * Parent outcomes, blocked tasks, and tasks containing open subtasks are
 * surfaced separately as "Needs review", never silently promoted or relabelled.
 * This is a conservative pilot rather than an autonomous GTD planner.
 */
export function selectGtdNextActions(
  items: Item[],
  projects: Record<string, Project>,
): GtdActionSelection {
  const byId = new Map(items.map((item) => [item.id, item]));
  const openChildren = new Set(
    items.filter(isOpen).map((item) => item.parent_id).filter((id): id is string => Boolean(id)),
  );
  const flags = new Map<string, ReturnType<typeof projectFlags>>();
  const ready: Item[] = [];
  const needsReview: GtdReviewItem[] = [];

  for (const item of items) {
    if (!isOpen(item)) continue;
    let p = flags.get(item.project_id);
    if (!p) {
      p = projectFlags(item.project_id, projects);
      flags.set(item.project_id, p);
    }
    if (!p.nextActions && !hasAnyLabel(item, NEXT_ACTION_LABELS)) continue;

    if (p.held || hasAnyLabel(item, HELD_LABELS) || heldByAncestor(item, byId)) {
      needsReview.push({ item, reason: 'held' });
    } else if (isUncompletable(item) || hasAnyLabel(item, OUTCOME_LABELS) || !displayTaskContent(item).trim()) {
      needsReview.push({ item, reason: 'outcome' });
    } else if (openChildren.has(item.id)) {
      needsReview.push({ item, reason: 'subtasks' });
    } else {
      ready.push(item);
    }
  }
  return { ready, needsReview };
}
