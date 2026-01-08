import { Rect, SimplifiedNode } from './types';

class RectImpl {
  constructor(
    public readonly x1: number,
    public readonly y1: number,
    public readonly x2: number,
    public readonly y2: number
  ) {}

  area(): number {
    return (this.x2 - this.x1) * (this.y2 - this.y1);
  }

  intersects(other: RectImpl): boolean {
    return !(
      this.x2 <= other.x1 ||
      other.x2 <= this.x1 ||
      this.y2 <= other.y1 ||
      other.y2 <= this.y1
    );
  }

  contains(other: RectImpl): boolean {
    return (
      this.x1 <= other.x1 &&
      this.y1 <= other.y1 &&
      this.x2 >= other.x2 &&
      this.y2 >= other.y2
    );
  }

  toRect(): Rect {
    return { x1: this.x1, y1: this.y1, x2: this.x2, y2: this.y2 };
  }
}

class RectUnion {
  private rects: RectImpl[] = [];
  private splitDiff(a: RectImpl, b: RectImpl): RectImpl[] {
    const parts: RectImpl[] = [];

    if (a.y1 < b.y1) {
      parts.push(new RectImpl(a.x1, a.y1, a.x2, b.y1));
    }

    if (b.y2 < a.y2) {
      parts.push(new RectImpl(a.x1, b.y2, a.x2, a.y2));
    }

    const yLo = Math.max(a.y1, b.y1);
    const yHi = Math.min(a.y2, b.y2);

    if (a.x1 < b.x1) {
      parts.push(new RectImpl(a.x1, yLo, b.x1, yHi));
    }

    if (b.x2 < a.x2) {
      parts.push(new RectImpl(b.x2, yLo, a.x2, yHi));
    }

    return parts;
  }

  contains(r: RectImpl): boolean {
    if (this.rects.length === 0) {
      return false;
    }

    let stack: RectImpl[] = [r];

    for (const s of this.rects) {
      const newStack: RectImpl[] = [];

      for (const piece of stack) {
        if (s.contains(piece)) {
          continue;
        }

        if (piece.intersects(s)) {
          newStack.push(...this.splitDiff(piece, s));
        } else {
          newStack.push(piece);
        }
      }

      if (newStack.length === 0) {
        return true;
      }

      stack = newStack;
    }

    return false;
  }

  add(r: RectImpl): boolean {
    if (this.contains(r)) {
      return false;
    }

    let pending: RectImpl[] = [r];

    for (const s of this.rects) {
      const newPending: RectImpl[] = [];

      for (const piece of pending) {
        if (piece.intersects(s)) {
          newPending.push(...this.splitDiff(piece, s));
        } else {
          newPending.push(piece);
        }
      }

      pending = newPending;
    }

    this.rects.push(...pending);
    return true;
  }

  size(): number {
    return this.rects.length;
  }
}

export class PaintOrderFilter {
  constructor(private root: SimplifiedNode) {}

  calculate(): void {
    const nodesWithPaintOrder: SimplifiedNode[] = [];

    const collect = (node: SimplifiedNode): void => {
      if (
        node.originalNode.snapshotNode &&
        node.originalNode.snapshotNode.paintOrder !== null &&
        node.originalNode.snapshotNode.bounds !== null
      ) {
        nodesWithPaintOrder.push(node);
      }

      for (const child of node.children) {
        collect(child);
      }
    };

    collect(this.root);

    const grouped: Map<number, SimplifiedNode[]> = new Map();
    for (const node of nodesWithPaintOrder) {
      const paintOrder = node.originalNode.snapshotNode!.paintOrder!;
      if (!grouped.has(paintOrder)) {
        grouped.set(paintOrder, []);
      }
      grouped.get(paintOrder)!.push(node);
    }

    const sortedOrders = Array.from(grouped.keys()).sort((a, b) => b - a);

    const rectUnion = new RectUnion();

    for (const paintOrder of sortedOrders) {
      const nodes = grouped.get(paintOrder)!;
      const rectsToAdd: RectImpl[] = [];

      for (const node of nodes) {
        const bounds = node.originalNode.snapshotNode!.bounds!;
        const rect = new RectImpl(
          bounds.x,
          bounds.y,
          bounds.x + bounds.width,
          bounds.y + bounds.height
        );

        if (rectUnion.contains(rect)) {
          node.ignoredByPaintOrder = true;
        }

        const styles = node.originalNode.snapshotNode!.computedStyles;
        if (styles) {
          const bgColor = styles['background-color'] || 'rgba(0, 0, 0, 0)';
          const opacity = parseFloat(styles['opacity'] || '1');

          if (bgColor === 'rgba(0, 0, 0, 0)' || opacity < 0.8) {
            continue;
          }
        } else {
          continue;
        }

        rectsToAdd.push(rect);
      }

      for (const rect of rectsToAdd) {
        rectUnion.add(rect);
      }
    }
  }
}

export function boundsToRect(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Rect {
  return {
    x1: bounds.x,
    y1: bounds.y,
    x2: bounds.x + bounds.width,
    y2: bounds.y + bounds.height,
  };
}
