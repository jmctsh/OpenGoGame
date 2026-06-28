const BOARD_SIZE = 19;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

class GoEngine {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.board = this.createEmptyBoard();
    this.currentPlayer = BLACK;
    this.moveHistory = [];
    this.capturedBlack = 0;
    this.capturedWhite = 0;
    this.koPoint = null;
  }

  createEmptyBoard() {
    return Array(this.size).fill(null).map(() => Array(this.size).fill(EMPTY));
  }

  clone() {
    const newEngine = new GoEngine(this.size);
    newEngine.board = this.board.map(row => [...row]);
    newEngine.currentPlayer = this.currentPlayer;
    newEngine.moveHistory = [...this.moveHistory];
    newEngine.capturedBlack = this.capturedBlack;
    newEngine.capturedWhite = this.capturedWhite;
    newEngine.koPoint = this.koPoint ? { ...this.koPoint } : null;
    return newEngine;
  }

  getNeighbors(x, y) {
    const neighbors = [];
    if (x > 0) neighbors.push({ x: x - 1, y });
    if (x < this.size - 1) neighbors.push({ x: x + 1, y });
    if (y > 0) neighbors.push({ x, y: y - 1 });
    if (y < this.size - 1) neighbors.push({ x, y: y + 1 });
    return neighbors;
  }

  getGroup(x, y, board = this.board) {
    const color = board[y][x];
    if (color === EMPTY) return { stones: [], liberties: new Set() };

    const visited = new Set();
    const stones = [];
    const liberties = new Set();
    const stack = [{ x, y }];

    while (stack.length > 0) {
      const { x: cx, y: cy } = stack.pop();
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (board[cy][cx] === color) {
        stones.push({ x: cx, y: cy });
        for (const neighbor of this.getNeighbors(cx, cy)) {
          const nKey = `${neighbor.x},${neighbor.y}`;
          if (!visited.has(nKey)) {
            if (board[neighbor.y][neighbor.x] === EMPTY) {
              liberties.add(nKey);
            } else if (board[neighbor.y][neighbor.x] === color) {
              stack.push(neighbor);
            }
          }
        }
      }
    }

    return { stones, liberties };
  }

  isValidMove(x, y, player = this.currentPlayer) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
    if (this.board[y][x] !== EMPTY) return false;
    if (this.koPoint && this.koPoint.x === x && this.koPoint.y === y && this.koPoint.player === player) {
      return false;
    }
    return true;
  }

  wouldCapture(x, y, player) {
    const testBoard = this.board.map(row => [...row]);
    testBoard[y][x] = player;
    const opponent = player === BLACK ? WHITE : BLACK;
    let captured = [];

    for (const neighbor of this.getNeighbors(x, y)) {
      if (testBoard[neighbor.y][neighbor.x] === opponent) {
        const group = this.getGroup(neighbor.x, neighbor.y, testBoard);
        if (group.liberties.size === 0) {
          captured = captured.concat(group.stones);
        }
      }
    }

    return captured;
  }

  isSuicide(x, y, player) {
    const testBoard = this.board.map(row => [...row]);
    testBoard[y][x] = player;
    const opponent = player === BLACK ? WHITE : BLACK;

    for (const neighbor of this.getNeighbors(x, y)) {
      if (testBoard[neighbor.y][neighbor.x] === opponent) {
        const group = this.getGroup(neighbor.x, neighbor.y, testBoard);
        if (group.liberties.size === 0) {
          return false;
        }
      }
    }

    const ownGroup = this.getGroup(x, y, testBoard);
    return ownGroup.liberties.size === 0;
  }

  placeStone(x, y) {
    if (!this.isValidMove(x, y)) {
      return { success: false, reason: 'invalid' };
    }

    const player = this.currentPlayer;
    const opponent = player === BLACK ? WHITE : BLACK;

    if (this.isSuicide(x, y, player) && this.wouldCapture(x, y, player).length === 0) {
      return { success: false, reason: 'suicide' };
    }

    this.board[y][x] = player;

    let capturedStones = [];
    for (const neighbor of this.getNeighbors(x, y)) {
      if (this.board[neighbor.y][neighbor.x] === opponent) {
        const group = this.getGroup(neighbor.x, neighbor.y);
        if (group.liberties.size === 0) {
          for (const stone of group.stones) {
            this.board[stone.y][stone.x] = EMPTY;
            capturedStones.push(stone);
          }
        }
      }
    }

    if (player === BLACK) {
      this.capturedWhite += capturedStones.length;
    } else {
      this.capturedBlack += capturedStones.length;
    }

    this.koPoint = null;
    if (capturedStones.length === 1) {
      const capturedStone = capturedStones[0];
      const ownGroup = this.getGroup(x, y);
      if (ownGroup.stones.length === 1 && ownGroup.liberties.size === 1) {
        this.koPoint = {
          x: capturedStone.x,
          y: capturedStone.y,
          player: opponent
        };
      }
    }

    const moveNumber = this.moveHistory.length + 1;
    this.moveHistory.push({
      x,
      y,
      player,
      moveNumber,
      captured: capturedStones
    });

    this.currentPlayer = opponent;

    return {
      success: true,
      x,
      y,
      player,
      moveNumber,
      captured: capturedStones,
      koPoint: this.koPoint
    };
  }

  undoMove() {
    if (this.moveHistory.length === 0) return false;

    const lastMove = this.moveHistory.pop();
    this.board[lastMove.y][lastMove.x] = EMPTY;

    for (const stone of lastMove.captured) {
      const opponent = lastMove.player === BLACK ? WHITE : BLACK;
      this.board[stone.y][stone.x] = opponent;
    }

    if (lastMove.player === BLACK) {
      this.capturedWhite -= lastMove.captured.length;
    } else {
      this.capturedBlack -= lastMove.captured.length;
    }

    this.currentPlayer = lastMove.player;

    if (this.moveHistory.length > 0) {
      const prevMove = this.moveHistory[this.moveHistory.length - 1];
      this.koPoint = null;
    } else {
      this.koPoint = null;
    }

    return true;
  }

  getState() {
    return {
      board: this.board.map(row => [...row]),
      currentPlayer: this.currentPlayer,
      moveHistory: [...this.moveHistory],
      capturedBlack: this.capturedBlack,
      capturedWhite: this.capturedWhite,
      koPoint: this.koPoint,
      size: this.size
    };
  }

  getBoardString() {
    let str = '';
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const stone = this.board[y][x];
        if (stone === BLACK) str += 'B';
        else if (stone === WHITE) str += 'W';
        else str += '.';
      }
      str += '\n';
    }
    return str;
  }

  countScore(komi = 7.5) {
    const board = this.board;
    const size = this.size;
    const visited = Array(size).fill(null).map(() => Array(size).fill(false));

    let blackStones = 0;
    let whiteStones = 0;
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let dame = 0;
    const territoryMap = Array(size).fill(null).map(() => Array(size).fill(0));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (board[y][x] === BLACK) blackStones++;
        else if (board[y][x] === WHITE) whiteStones++;
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (visited[y][x] || board[y][x] !== EMPTY) continue;

        const region = [];
        const bordersBlack = new Set();
        const bordersWhite = new Set();
        const stack = [{ x, y }];

        while (stack.length > 0) {
          const { x: cx, y: cy } = stack.pop();
          if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
          if (visited[cy][cx]) continue;

          if (board[cy][cx] === BLACK) {
            bordersBlack.add(`${cx},${cy}`);
            continue;
          }
          if (board[cy][cx] === WHITE) {
            bordersWhite.add(`${cx},${cy}`);
            continue;
          }

          visited[cy][cx] = true;
          region.push({ x: cx, y: cy });

          stack.push({ x: cx - 1, y: cy });
          stack.push({ x: cx + 1, y: cy });
          stack.push({ x: cx, y: cy - 1 });
          stack.push({ x: cx, y: cy + 1 });
        }

        const hasBlack = bordersBlack.size > 0;
        const hasWhite = bordersWhite.size > 0;

        if (hasBlack && !hasWhite) {
          blackTerritory += region.length;
          for (const p of region) territoryMap[p.y][p.x] = BLACK;
        } else if (hasWhite && !hasBlack) {
          whiteTerritory += region.length;
          for (const p of region) territoryMap[p.y][p.x] = WHITE;
        } else {
          dame += region.length;
        }
      }
    }

    const blackTotal = blackStones + blackTerritory;
    const whiteTotal = whiteStones + whiteTerritory + komi;
    const totalPoints = size * size;
    const winner = blackTotal > whiteTotal ? 'black' : (whiteTotal > blackTotal ? 'white' : 'draw');
    const margin = Math.abs(blackTotal - whiteTotal);

    return {
      blackStones,
      whiteStones,
      blackTerritory,
      whiteTerritory,
      dame,
      blackTotal,
      whiteTotal,
      komi,
      winner,
      margin: winner === 'draw' ? 0 : margin,
      territoryMap,
      totalPoints
    };
  }
}

module.exports = { GoEngine, BOARD_SIZE, BLACK, WHITE, EMPTY };
