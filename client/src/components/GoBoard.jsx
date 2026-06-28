import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

const BOARD_SIZE = 19;
const CELL_SIZE = 32;
const PADDING = 40;
const STONE_RADIUS = 14;
const CANVAS_SIZE = CELL_SIZE * (BOARD_SIZE - 1) + PADDING * 2;

const AI_CELL_SIZE = 40;
const AI_PADDING = 50;
const AI_STONE_RADIUS = 17;
const AI_CANVAS_SIZE = AI_CELL_SIZE * (BOARD_SIZE - 1) + AI_PADDING * 2;

const COL_LABELS = 'ABCDEFGHJKLMNOPQRST';

const STAR_POINTS = [
  { x: 3, y: 3 }, { x: 9, y: 3 }, { x: 15, y: 3 },
  { x: 3, y: 9 }, { x: 9, y: 9 }, { x: 15, y: 9 },
  { x: 3, y: 15 }, { x: 9, y: 15 }, { x: 15, y: 15 }
];

function coordToPosition(x, y) {
  return {
    px: PADDING + x * CELL_SIZE,
    py: PADDING + y * CELL_SIZE
  };
}

function positionToCoord(px, py) {
  const x = Math.round((px - PADDING) / CELL_SIZE);
  const y = Math.round((py - PADDING) / CELL_SIZE);
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  return { x, y };
}

const GoBoard = forwardRef(function GoBoard({ gameState, onPlaceStone, onContextMenu, aiSuggestions }, ref) {
  const canvasRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getScreenshot: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    },
    getAIScreenshot: () => {
      if (!gameState) return null;
      return generateAIBoardImage(gameState);
    }
  }));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;

    const ctx = canvas.getContext('2d');
    const { board, moveHistory, currentPlayer } = gameState;

    ctx.fillStyle = '#DEB887';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1;
    for (let i = 0; i < BOARD_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(PADDING, PADDING + i * CELL_SIZE);
      ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, PADDING + i * CELL_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(PADDING + i * CELL_SIZE, PADDING);
      ctx.lineTo(PADDING + i * CELL_SIZE, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
      ctx.stroke();
    }

    ctx.fillStyle = '#8B4513';
    for (const point of STAR_POINTS) {
      const { px, py } = coordToPosition(point.x, point.y);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#5C4033';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < BOARD_SIZE; i++) {
      const colLabel = COL_LABELS[i];
      const { px } = coordToPosition(i, 0);
      ctx.fillText(colLabel, px, PADDING / 2);
      ctx.fillText(colLabel, px, CANVAS_SIZE - PADDING / 2);

      const rowNum = (BOARD_SIZE - i).toString();
      const { py } = coordToPosition(0, i);
      ctx.fillText(rowNum, PADDING / 2, py);
      ctx.fillText(rowNum, CANVAS_SIZE - PADDING / 2, py);
    }

    const last10Moves = moveHistory.slice(-10);
    const lastMoveMap = new Map();
    last10Moves.forEach((move, idx) => {
      lastMoveMap.set(`${move.x},${move.y}`, last10Moves.length - idx);
    });

    if (aiSuggestions && aiSuggestions.recommendations) {
      for (const rec of aiSuggestions.recommendations) {
        const pos = parsePosition(rec.position);
        if (pos && board[pos.y][pos.x] === 0) {
          const { px, py } = coordToPosition(pos.x, pos.y);
          ctx.strokeStyle = 'rgba(0, 200, 0, 0.6)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(px, py, STONE_RADIUS + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const stone = board[y][x];
        if (stone === 0) continue;

        const { px, py } = coordToPosition(x, y);
        const moveNum = lastMoveMap.get(`${x},${y}`);

        ctx.beginPath();
        ctx.arc(px, py, STONE_RADIUS, 0, Math.PI * 2);

        const gradient = ctx.createRadialGradient(px - 4, py - 4, 0, px, py, STONE_RADIUS);
        if (stone === 1) {
          gradient.addColorStop(0, '#444');
          gradient.addColorStop(1, '#000');
        } else {
          gradient.addColorStop(0, '#fff');
          gradient.addColorStop(1, '#ccc');
        }
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = stone === 1 ? '#000' : '#999';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (moveNum !== undefined) {
          ctx.fillStyle = stone === 1 ? '#fff' : '#000';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(moveNum.toString(), px, py);
        }
      }
    }
  }, [gameState, aiSuggestions]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const coord = positionToCoord(px, py);
    if (coord) {
      onPlaceStone(coord.x, coord.y);
    }
  }, [onPlaceStone]);

  const handleRightClick = useCallback((e) => {
    e.preventDefault();
    if (onContextMenu) {
      onContextMenu();
    }
  }, [onContextMenu]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        style={{
          cursor: 'crosshair',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          borderRadius: '4px',
          display: 'block'
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '4px 12px',
        borderRadius: '4px',
        fontSize: '14px',
        pointerEvents: 'none'
      }}>
        当前: {gameState?.currentPlayer === 1 ? '⚫ 黑方' : '⚪ 白方'} | 
        提子 - 黑:{gameState?.capturedBlack || 0} 白:{gameState?.capturedWhite || 0} | 
        手数: {gameState?.moveHistory?.length || 0}
        {gameState?.detachedHead && ' | 🔍 浏览历史模式'}
      </div>
    </div>
  );
});

function parsePosition(posStr) {
  if (!posStr || typeof posStr !== 'string') return null;
  const match = posStr.match(/^([A-T])(\d{1,2})$/i);
  if (!match) return null;
  const col = COL_LABELS.indexOf(match[1].toUpperCase());
  const row = BOARD_SIZE - parseInt(match[2]);
  if (col < 0 || row < 0 || row >= BOARD_SIZE) return null;
  return { x: col, y: row };
}

function generateAIBoardImage(gameState) {
  const canvas = document.createElement('canvas');
  canvas.width = AI_CANVAS_SIZE;
  canvas.height = AI_CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  const { board, moveHistory, currentPlayer } = gameState;

  function aiCoord(x, y) {
    return {
      px: AI_PADDING + x * AI_CELL_SIZE,
      py: AI_PADDING + y * AI_CELL_SIZE
    };
  }

  ctx.fillStyle = '#F5DEB3';
  ctx.fillRect(0, 0, AI_CANVAS_SIZE, AI_CANVAS_SIZE);

  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(AI_PADDING, AI_PADDING + i * AI_CELL_SIZE);
    ctx.lineTo(AI_PADDING + (BOARD_SIZE - 1) * AI_CELL_SIZE, AI_PADDING + i * AI_CELL_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(AI_PADDING + i * AI_CELL_SIZE, AI_PADDING);
    ctx.lineTo(AI_PADDING + i * AI_CELL_SIZE, AI_PADDING + (BOARD_SIZE - 1) * AI_CELL_SIZE);
    ctx.stroke();
  }

  ctx.fillStyle = '#000';
  for (const point of STAR_POINTS) {
    const { px, py } = aiCoord(point.x, point.y);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < BOARD_SIZE; i++) {
    const colLabel = COL_LABELS[i];
    const { px } = aiCoord(i, 0);
    ctx.fillText(colLabel, px, AI_PADDING / 2);
    ctx.fillText(colLabel, px, AI_CANVAS_SIZE - AI_PADDING / 2);

    const rowNum = (BOARD_SIZE - i).toString();
    const { py } = aiCoord(0, i);
    ctx.fillText(rowNum, AI_PADDING / 2, py);
    ctx.fillText(rowNum, AI_CANVAS_SIZE - AI_PADDING / 2, py);
  }

  const last10Moves = moveHistory.slice(-10);
  const lastMoveMap = new Map();
  last10Moves.forEach((move, idx) => {
    lastMoveMap.set(`${move.x},${move.y}`, last10Moves.length - idx);
  });

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const stone = board[y][x];
      if (stone === 0) continue;

      const { px, py } = aiCoord(x, y);
      const moveNum = lastMoveMap.get(`${x},${y}`);

      ctx.beginPath();
      ctx.arc(px, py, AI_STONE_RADIUS, 0, Math.PI * 2);

      const gradient = ctx.createRadialGradient(px - 5, py - 5, 0, px, py, AI_STONE_RADIUS);
      if (stone === 1) {
        gradient.addColorStop(0, '#555');
        gradient.addColorStop(1, '#000');
      } else {
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(1, '#ddd');
      }
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = stone === 1 ? '#000' : '#888';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (moveNum !== undefined) {
        ctx.fillStyle = stone === 1 ? '#FFD700' : '#c41e3a';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(moveNum.toString(), px, py);
      }
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(0, 0, AI_CANVAS_SIZE, 30);
  ctx.fillStyle = '#333';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
  const lastPos = lastMove ? `${COL_LABELS[lastMove.x]}${BOARD_SIZE - lastMove.y}` : '无';
  const lastColor = lastMove ? (lastMove.player === 1 ? '黑' : '白') : '';
  ctx.fillText(`第${moveHistory.length}手 | 上一手: ${lastColor}${lastPos} | 当前: ${currentPlayer === 1 ? '黑方' : '白方'}`, 10, 8);

  return canvas.toDataURL('image/png', 0.9);
}

export { parsePosition, generateAIBoardImage };
export default GoBoard;
