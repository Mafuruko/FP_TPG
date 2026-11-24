export function tileToWorld({ x, y }, size) {
  return { x: (x + 0.5) * size, y: (y + 0.5) * size };
}

export function worldToTile({ x, y }, size) {
  return { x: Math.floor(x / size), y: Math.floor(y / size) };
}

export function screenToWorld({ x, y }, camera) {
  return { x: (x - camera.x) / camera.zoom, y: (y - camera.y) / camera.zoom };
}

export function worldToScreen({ x, y }, camera) {
  return { x: x * camera.zoom + camera.x, y: y * camera.zoom + camera.y };
}

export const neighbors = [
  { x: 1, y: 0, facing: 'right' }, { x: -1, y: 0, facing: 'left' },
  { x: 0, y: 1, facing: 'front' }, { x: 0, y: -1, facing: 'back' },
];

export function walkable(grid, { x, y }) {
  return Number.isInteger(x) && Number.isInteger(y) && grid[y]?.[x] === 0;
}

export function sameTile(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function findRoute(grid, start, destinations) {
  if (!walkable(grid, start)) return null;
  const key = ({ x, y }) => y * grid[0].length + x;
  const goals = new Map(destinations.filter(tile => walkable(grid, tile)).map(tile => [key(tile), tile]));
  if (!goals.size) return null;
  const queue = [start];
  const previous = new Map([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i];
    const target = goals.get(key(tile));
    if (target) {
      const path = [];
      for (let step = tile; previous.get(key(step)); step = previous.get(key(step))) path.push(step);
      return { path: path.reverse(), target };
    }
    for (const offset of neighbors) {
      const next = { x: tile.x + offset.x, y: tile.y + offset.y };
      if (walkable(grid, next) && !previous.has(key(next))) {
        previous.set(key(next), tile);
        queue.push(next);
      }
    }
  }
  return null;
}

export function zoomAt(camera, screen, zoom) {
  const world = screenToWorld(screen, camera);
  Object.assign(camera, { zoom, x: Math.round(screen.x - world.x * zoom), y: Math.round(screen.y - world.y * zoom) });
}
