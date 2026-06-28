const BOARD_SIZE = 19;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

export function simulateMove(state, x, y) {
  const size = state.size || BOARD_SIZE;
  const board = state.board.map(row => [...row]);
  const player = state.currentPlayer;
  const opponent = player === BLACK ? WHITE : BLACK;

  if (x < 0 || x >= size || y < 0 || y >= size) return null;
  if (board[y][x] !== EMPTY) return null;
  if (state.koPoint && state.koPoint.x === x && state.koPoint.y === y && state.koPoint.player === player) {
    return null;
  }

  const getNeighbors = (cx, cy) => {
    const n = [];
    if (cx > 0) n.push({ x: cx - 1, y: cy });
    if (cx < size - 1) n.push({ x: cx + 1, y: cy });
    if (cy > 0) n.push({ x: cx, y: cy - 1 });
    if (cy < size - 1) n.push({ x: cx, y: cy + 1 });
    return n;
  };

  const getGroup = (cx, cy, b) => {
    const color = b[cy][cx];
    if (color === EMPTY) return { stones: [], liberties: new Set() };
    const visited = new Set();
    const stones = [];
    const liberties = new Set();
    const stack = [{ x: cx, y: cy }];
    while (stack.length > 0) {
      const { x: sx, y: sy } = stack.pop();
      const key = `${sx},${sy}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (b[sy][sx] === color) {
        stones.push({ x: sx, y: sy });
        for (const neighbor of getNeighbors(sx, sy)) {
          const nKey = `${neighbor.x},${neighbor.y}`;
          if (!visited.has(nKey)) {
            if (b[neighbor.y][neighbor.x] === EMPTY) {
              liberties.add(nKey);
            } else if (b[neighbor.y][neighbor.x] === color) {
              stack.push(neighbor);
            }
          }
        }
      }
    }
    return { stones, liberties };
  };

  board[y][x] = player;

  let capturedStones = [];
  for (const neighbor of getNeighbors(x, y)) {
    if (board[neighbor.y][neighbor.x] === opponent) {
      const group = getGroup(neighbor.x, neighbor.y, board);
      if (group.liberties.size === 0) {
        for (const stone of group.stones) {
          board[stone.y][stone.x] = EMPTY;
          capturedStones.push(stone);
        }
      }
    }
  }

  const ownGroup = getGroup(x, y, board);
  if (ownGroup.liberties.size === 0 && capturedStones.length === 0) {
    return null;
  }

  let koPoint = null;
  if (capturedStones.length === 1) {
    const capturedStone = capturedStones[0];
    if (ownGroup.stones.length === 1 && ownGroup.liberties.size === 1) {
      koPoint = { x: capturedStone.x, y: capturedStone.y, player: opponent };
    }
  }

  return {
    ...state,
    board,
    currentPlayer: opponent,
    koPoint,
    capturedBlack: player === WHITE ? state.capturedBlack + capturedStones.length : state.capturedBlack,
    capturedWhite: player === BLACK ? state.capturedWhite + capturedStones.length : state.capturedWhite,
  };
}

export { BOARD_SIZE, BLACK, WHITE, EMPTY };
