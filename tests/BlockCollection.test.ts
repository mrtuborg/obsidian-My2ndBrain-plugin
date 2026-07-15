import { Block } from '../src/components/Block';
import { BlockCollection } from '../src/components/BlockCollection';

function makeBlock(page: string, type: string, content = 'c'): Block {
  const b = new Block(page, content, 0);
  b.setAttribute('type', type);
  return b;
}

// BC-01
describe('BlockCollection.findByType', () => {
  it('returns only blocks with matching type', () => {
    const col = new BlockCollection();
    const todo = makeBlock('p', 'todo');
    const done = makeBlock('p', 'done');
    const header = makeBlock('p', 'header');
    col.addBlock(todo);
    col.addBlock(done);
    col.addBlock(header);

    const todos = col.findByType('todo');
    expect(todos).toHaveLength(1);
    expect(todos[0]).toBe(todo);
  });

  it('returns empty array when no match', () => {
    const col = new BlockCollection();
    col.addBlock(makeBlock('p', 'header'));
    expect(col.findByType('todo')).toHaveLength(0);
  });
});

// BC-02
describe('BlockCollection — no duplicate blocks', () => {
  it('ignores the same block instance added twice', () => {
    const col = new BlockCollection();
    const b = makeBlock('p', 'todo');
    col.addBlock(b);
    col.addBlock(b);
    expect(col.blocks).toHaveLength(1);
  });
});

// BC-03
describe('BlockCollection.getBlocksByPage', () => {
  it('returns only blocks from the specified page', () => {
    const col = new BlockCollection();
    const b1 = makeBlock('Journal/2026-04-04.md', 'todo');
    const b2 = makeBlock('Journal/2026-04-10.md', 'todo');
    const b3 = makeBlock('Journal/2026-04-04.md', 'done');
    col.addBlock(b1);
    col.addBlock(b2);
    col.addBlock(b3);

    const results = col.getBlocksByPage('Journal/2026-04-04.md');
    expect(results).toHaveLength(2);
    expect(results).toContain(b1);
    expect(results).toContain(b3);
    expect(results).not.toContain(b2);
  });
});

// BC-04
describe('BlockCollection.getRootBlocks', () => {
  it('returns only blocks with no parent', () => {
    const col = new BlockCollection();
    const parent = makeBlock('p', 'header');
    const child = makeBlock('p', 'todo');
    const orphan = makeBlock('p', 'todo', 'orphan');

    parent.addChild(child);
    col.addBlock(parent);
    col.addBlock(child);
    col.addBlock(orphan);

    const roots = col.getRootBlocks();
    expect(roots).toContain(parent);
    expect(roots).toContain(orphan);
    expect(roots).not.toContain(child);
  });
});

describe('BlockCollection.findByAttribute', () => {
  it('finds blocks matching a given key/value pair', () => {
    const col = new BlockCollection();
    const b1 = makeBlock('p', 'header');
    b1.setAttribute('level', 5);
    const b2 = makeBlock('p', 'header');
    b2.setAttribute('level', 2);
    col.addBlock(b1);
    col.addBlock(b2);

    const fives = col.findByAttribute('level', 5);
    expect(fives).toHaveLength(1);
    expect(fives[0]).toBe(b1);
  });
});

describe('BlockCollection.getStats', () => {
  it('returns correct total, byType counts, and page count', () => {
    const col = new BlockCollection();
    col.addBlock(makeBlock('page1.md', 'todo'));
    col.addBlock(makeBlock('page1.md', 'todo'));
    col.addBlock(makeBlock('page2.md', 'done'));

    const stats = col.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType['todo']).toBe(2);
    expect(stats.byType['done']).toBe(1);
    expect(stats.pages).toBe(2);
  });
});

describe('BlockCollection.createNew', () => {
  it('returns a fresh empty collection', () => {
    const col = BlockCollection.createNew();
    expect(col.blocks).toHaveLength(0);
  });
});
