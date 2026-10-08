import { describe, expect, it } from 'vitest';
import { item } from '@/test/items';
import type { Project } from './types';
import { selectGtdNextActions } from './gtd';

const project = (id: string, name: string, parent_id: string | null = null): Project =>
  ({ id, name, parent_id }) as Project;

const projects: Record<string, Project> = {
  work: project('work', 'Work'),
  next: project('next', 'Next Actions'),
  waiting: project('waiting', 'Waiting For'),
  held: project('held', 'On Hold'),
  someday: project('someday', 'Someday / Maybe'),
  nested: project('nested', 'Home', 'next'),
  nestedWaiting: project('nestedWaiting', 'Pending', 'waiting'),
};

const ids = (items: { id: string }[]): string[] => items.map(({ id }) => id);

describe('selectGtdNextActions', () => {
  it('includes manually labelled actions and tasks filed in Next Actions', () => {
    const selection = selectGtdNextActions([
      item({ id: 'tagged', project_id: 'work', labels: ['Next_Action'] }),
      item({ id: 'filed', project_id: 'next' }),
      item({ id: 'nested', project_id: 'nested' }),
      item({ id: 'unmarked', project_id: 'work' }),
    ], projects);
    expect(ids(selection.ready)).toEqual(['tagged', 'filed', 'nested']);
    expect(selection.needsReview).toEqual([]);
  });

  it('surfaces a labelled subtask independently of its unmarked parent', () => {
    const selection = selectGtdNextActions([
      item({ id: 'outcome', project_id: 'work', labels: ['project'] }),
      item({ id: 'action', parent_id: 'outcome', project_id: 'work', labels: ['next-action'] }),
    ], projects);
    expect(ids(selection.ready)).toEqual(['action']);
  });

  it('never invents next actions from an unlabelled leaf', () => {
    const selection = selectGtdNextActions([item({ id: 'leaf', project_id: 'work' })], projects);
    expect(selection.ready).toEqual([]);
  });

  it('excludes completed/deleted tasks and only counts open children', () => {
    const selection = selectGtdNextActions([
      item({ id: 'done', project_id: 'next', checked: true }),
      item({ id: 'deleted', project_id: 'next', is_deleted: true }),
      item({ id: 'parent', project_id: 'next' }),
      item({ id: 'closedChild', parent_id: 'parent', project_id: 'next', checked: true }),
    ], projects);
    expect(ids(selection.ready)).toEqual(['parent']);
  });

  it('keeps future-dated actions visible (a due date is not a dependency)', () => {
    const selection = selectGtdNextActions([
      item({ id: 'future', project_id: 'next', due: { date: '2027-03-01', lang: 'en' } }),
    ], projects);
    expect(ids(selection.ready)).toEqual(['future']);
  });

  it('puts held work and descendants of held work in review, not ready', () => {
    const selection = selectGtdNextActions([
      item({ id: 'bucket', project_id: 'waiting', labels: ['next_action'] }),
      item({ id: 'childBucket', project_id: 'nestedWaiting', labels: ['next_action'] }),
      item({ id: 'own', project_id: 'next', labels: ['waiting_for'] }),
      item({ id: 'ancestor', project_id: 'work', labels: ['on_hold'] }),
      item({ id: 'child', project_id: 'work', parent_id: 'ancestor', labels: ['next_action'] }),
      item({ id: 'someday', project_id: 'someday', labels: ['next_action'] }),
    ], projects);
    expect(selection.ready).toEqual([]);
    expect(ids(selection.needsReview.map(({ item: task }) => task))).toEqual([
      'bucket', 'childBucket', 'own', 'child', 'someday',
    ]);
    expect(selection.needsReview.every(({ reason }) => reason === 'held')).toBe(true);
  });

  it('flags outcomes and parent tasks rather than treating them as actions', () => {
    const selection = selectGtdNextActions([
      item({ id: 'heading', project_id: 'next', content: '* Rebuild the fireplace' }),
      item({ id: 'project', project_id: 'next', labels: ['project'] }),
      item({ id: 'container', project_id: 'next' }),
      item({ id: 'step', project_id: 'next', parent_id: 'container' }),
    ], projects);
    expect(ids(selection.ready)).toEqual(['step']);
    expect(selection.needsReview.map(({ item: task, reason }) => [task.id, reason])).toEqual([
      ['heading', 'outcome'], ['project', 'outcome'], ['container', 'subtasks'],
    ]);
  });

  it('handles cycles in malformed project/task ancestry safely', () => {
    const cyclicProjects = {
      a: project('a', 'Next Actions', 'b'),
      b: project('b', 'Projects', 'a'),
    };
    const selection = selectGtdNextActions([
      item({ id: 'a', project_id: 'a', parent_id: 'b' }),
      item({ id: 'b', project_id: 'a', parent_id: 'a' }),
    ], cyclicProjects);
    expect(selection.ready).toEqual([]);
    expect(selection.needsReview.map(({ reason }) => reason)).toEqual(['subtasks', 'subtasks']);
  });
});
