import { describe, expect, it } from 'vitest';
import { groupItems, pullQuick, sortItems, surfaceItems } from './selectors';
import { emptySnapshot, type Project, type Section, type Snapshot } from '@/domain/types';
import { due, item } from '@/test/items';

const project = (id: string, child_order: number, extra: Partial<Project> = {}): Project => ({
  id, name: id, color: 'grey', parent_id: null, child_order,
  is_archived: false, is_deleted: false, is_favorite: false, workspace_id: null, ...extra,
});
const section = (id: string, project_id: string, section_order: number): Section => ({
  id, project_id, name: id, section_order, is_archived: false, is_deleted: false,
});

const snapshot: Snapshot = {
  ...emptySnapshot(),
  projects: {
    inbox: project('inbox', 0, { inbox_project: true }),
    home: project('home', 1),
    folder: project('folder', 2, { is_folder: true }),
    site: project('site', 1, { parent_id: 'folder' }),
    work: project('work', 3),
  },
  sections: {
    later: section('later', 'home', 2),
    first: section('first', 'home', 1),
    design: section('design', 'site', 1),
  },
};

const labels = {
  none: '', noProject: 'No project', noSection: 'No section', noEstimate: '', noLabel: '',
  priority: (p: number) => `P${p}`, day: () => '', scheduled: '', available: '',
};

/* The case reported: grouped by project and sorted by priority, the project
   holding a P1 went to the top. */
const tasks = [
  item({ id: 'w', project_id: 'work', priority: 4 }),
  item({ id: 's', project_id: 'site', section_id: 'design', priority: 1 }),
  item({ id: 'h1', project_id: 'home', section_id: 'later', priority: 2 }),
  item({ id: 'h2', project_id: 'home', section_id: 'first', priority: 3 }),
  item({ id: 'h3', project_id: 'home', priority: 1 }),
  item({ id: 'i', project_id: 'inbox', priority: 1 }),
];
const sorted = sortItems(tasks, 'priority', () => []);
const keys = (group: Parameters<typeof groupItems>[1]) =>
  groupItems(sorted, group, snapshot, labels).map((g) => g.key);

describe('groupItems', () => {
  it('lists projects in sidebar order whatever the sort', () => {
    expect(keys('project')).toEqual(['inbox', 'home', 'site', 'work']);
  });

  it('sorts the tasks inside each project', () => {
    const home = groupItems(sorted, 'project', snapshot, labels).find((g) => g.key === 'home')!;
    expect(home.items.map((task) => task.id)).toEqual(['h2', 'h1', 'h3']);
  });

  it('lists sections by project, then section order, with no section first', () => {
    expect(keys('section')).toEqual(['none', 'first', 'later', 'design']);
  });

  it('lists priorities from P1 to P4', () => {
    expect(keys('priority')).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('sortItems by priority (#98 follow-up)', () => {
  const due = (date: string) => ({ date, is_recurring: false, string: '', lang: 'en', timezone: null });

  it('breaks a tie between same-priority tasks by their date, soonest first', () => {
    const items = [
      item({ id: 'later', priority: 4, due: due('2026-10-05') }),
      item({ id: 'sooner', priority: 4, due: due('2026-10-01') }),
      item({ id: 'undated', priority: 4 }),
    ];
    expect(sortItems(items, 'priority', () => []).map((i) => i.id))
      .toEqual(['sooner', 'later', 'undated']);
  });

  it('still puts a higher priority first, whatever its date', () => {
    const items = [
      item({ id: 'p2-soon', priority: 3, due: due('2026-10-01') }),
      item({ id: 'p1-late', priority: 4, due: due('2026-10-20') }),
    ];
    expect(sortItems(items, 'priority', () => []).map((i) => i.id)).toEqual(['p1-late', 'p2-soon']);
  });
});

describe('pullQuick (#154)', () => {
  const now = new Date(2026, 9, 7, 12, 0, 0);
  const none = () => [];
  const page = [
    item({ id: 'a', labels: ['est-4'], priority: 1, child_order: 3 }),
    item({ id: 'b', labels: ['est-2'], priority: 4, child_order: 2 }),
    item({ id: 'c', labels: ['est-30'], child_order: 1 }),
    item({ id: 'later', labels: ['est-2'], due: due('2026-10-20') }),
  ];

  it('takes the quick tasks that can be done now and leaves the rest in order', () => {
    const { quick, rest } = pullQuick(page, true, 'manual', none, 'project', snapshot, now);
    expect(quick.map((task) => task.id)).toEqual(['b', 'a']);
    expect(rest.map((task) => task.id)).toEqual(['c', 'later']);
  });

  it("sorts the group the way the page's Display sort asks", () => {
    const { quick } = pullQuick(page, true, 'priority', none, 'project', snapshot, now);
    expect(quick.map((task) => task.id)).toEqual(['b', 'a']);
    const alphabetical = pullQuick(
      [item({ id: 'z', content: 'Zed', labels: ['est-2'] }), item({ id: 'y', content: 'Ay', labels: ['est-2'] })],
      true, 'alphabetical', none, 'project', snapshot, now,
    );
    expect(alphabetical.quick.map((task) => task.id)).toEqual(['y', 'z']);
  });

  it('takes nothing when the Quick group is off', () => {
    const { quick, rest } = pullQuick(page, false, 'manual', none, 'project', snapshot, now);
    expect(quick).toEqual([]);
    expect(rest).toBe(page);
  });
});


describe('surfaceItems', () => {
  it('surfaces a matching subtask when its parent does not match', () => {
    const all = [
      item({ id: 'parent' }),
      item({ id: 'child', parent_id: 'parent', labels: ['Next Actions'] }),
    ];
    expect(surfaceItems([all[1]], all).map((task) => task.id)).toEqual(['child']);
  });

  it('does not duplicate a subtask when its parent already matches', () => {
    const all = [
      item({ id: 'parent', labels: ['Next Actions'] }),
      item({ id: 'child', parent_id: 'parent', labels: ['Next Actions'] }),
    ];
    expect(surfaceItems(all, all).map((task) => task.id)).toEqual(['parent']);
  });

  it('hides a matching grandchild when any matching ancestor is already surfaced', () => {
    const all = [
      item({ id: 'grandparent', labels: ['Next Actions'] }),
      item({ id: 'parent', parent_id: 'grandparent' }),
      item({ id: 'child', parent_id: 'parent', labels: ['Next Actions'] }),
    ];
    expect(surfaceItems([all[0], all[2]], all).map((task) => task.id)).toEqual(['grandparent']);
  });
});
