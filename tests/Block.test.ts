import { Block } from '../src/components/Block';

// B-01
describe('Block constructor', () => {
  it('stores page, content, mtime', () => {
    const b = new Block('Journal/2026-04-04.md', '- [ ] Task', 1000);
    expect(b.page).toBe('Journal/2026-04-04.md');
    expect(b.content).toBe('- [ ] Task');
    expect(b.mtime).toBe(1000);
  });

  it('starts with no parent and no children', () => {
    const b = new Block('p', 'c', 0);
    expect(b.parent).toBeNull();
    expect(b.children).toHaveLength(0);
  });

  it('starts with empty attributes map', () => {
    const b = new Block('p', 'c', 0);
    expect(b.attributes.size).toBe(0);
  });
});

// B-02
describe('Block.setAttribute / getAttribute', () => {
  it('stores and retrieves a value', () => {
    const b = new Block('p', 'c', 0);
    b.setAttribute('type', 'todo');
    expect(b.getAttribute('type')).toBe('todo');
  });

  it('returns undefined for missing key', () => {
    const b = new Block('p', 'c', 0);
    expect(b.getAttribute('missing')).toBeUndefined();
  });
});

// B-03
describe('Block.isType', () => {
  it('returns true when type matches', () => {
    const b = new Block('p', 'c', 0);
    b.setAttribute('type', 'done');
    expect(b.isType('done')).toBe(true);
  });

  it('returns false for non-matching type', () => {
    const b = new Block('p', 'c', 0);
    b.setAttribute('type', 'done');
    expect(b.isType('todo')).toBe(false);
  });

  it('returns false when no type is set', () => {
    const b = new Block('p', 'c', 0);
    expect(b.isType('todo')).toBe(false);
  });
});

// B-04
describe('Block.addChild', () => {
  it('sets child.parent and adds to children array', () => {
    const parent = new Block('p', 'parent', 0);
    const child = new Block('p', 'child', 0);
    parent.addChild(child);
    expect(child.parent).toBe(parent);
    expect(parent.children).toContain(child);
  });
});

// B-05
describe('Block.addChild — no duplicates', () => {
  it('does not add the same child twice', () => {
    const parent = new Block('p', 'parent', 0);
    const child = new Block('p', 'child', 0);
    parent.addChild(child);
    parent.addChild(child);
    expect(parent.children).toHaveLength(1);
  });
});

// B-06
describe('Block.isDescendantOf', () => {
  let grandparent: Block;
  let parent: Block;
  let child: Block;

  beforeEach(() => {
    grandparent = new Block('p', 'gp', 0);
    parent = new Block('p', 'p', 0);
    child = new Block('p', 'c', 0);
    grandparent.addChild(parent);
    parent.addChild(child);
  });

  it('child is descendant of parent', () => {
    expect(child.isDescendantOf(parent)).toBe(true);
  });

  it('child is descendant of grandparent', () => {
    expect(child.isDescendantOf(grandparent)).toBe(true);
  });

  it('parent is NOT descendant of child', () => {
    expect(parent.isDescendantOf(child)).toBe(false);
  });

  it('block is not descendant of itself', () => {
    expect(child.isDescendantOf(child)).toBe(false);
  });
});

describe('Block.getLevel', () => {
  it('returns 0 when level attribute not set', () => {
    const b = new Block('p', 'c', 0);
    expect(b.getLevel()).toBe(0);
  });

  it('returns set level', () => {
    const b = new Block('p', 'c', 0);
    b.setAttribute('level', 3);
    expect(b.getLevel()).toBe(3);
  });
});

describe('Block.getAllDescendants', () => {
  it('returns all children and grandchildren', () => {
    const root = new Block('p', 'root', 0);
    const child1 = new Block('p', 'c1', 0);
    const child2 = new Block('p', 'c2', 0);
    const grandchild = new Block('p', 'gc', 0);
    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);
    const all = root.getAllDescendants();
    expect(all).toContain(child1);
    expect(all).toContain(child2);
    expect(all).toContain(grandchild);
    expect(all).toHaveLength(3);
  });

  it('returns empty array for leaf block', () => {
    const b = new Block('p', 'c', 0);
    expect(b.getAllDescendants()).toHaveLength(0);
  });
});

describe('Block.createNew', () => {
  it('is equivalent to new Block()', () => {
    const b = Block.createNew('page', 'content', 42);
    expect(b.page).toBe('page');
    expect(b.content).toBe('content');
    expect(b.mtime).toBe(42);
    expect(b.parent).toBeNull();
  });
});
