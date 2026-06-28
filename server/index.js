require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { VersionManager } = require('./versionManager');
const { GoEngine, BLACK, WHITE } = require('./goEngine');
const { callDoubao } = require('./aiService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const games = new Map();

function getOrCreateGame(gameId = 'default') {
  if (!games.has(gameId)) {
    games.set(gameId, {
      versionManager: new VersionManager(),
      aiRequestId: 0,
      clients: new Set(),
      pendingAI: null
    });
  }
  return games.get(gameId);
}

app.post('/api/games/:gameId/move', async (req, res) => {
  const { gameId = 'default' } = req.params;
  const { x, y, aiScreenshot } = req.body;

  const game = getOrCreateGame(gameId);
  const vm = game.versionManager;

  const engine = vm.getCurrentEngine();
  const result = engine.placeStone(x, y);

  if (!result.success) {
    return res.json({ success: false, reason: result.reason });
  }

  const state = engine.getState();
  const commit = vm.commit({ x, y, player: result.player, moveNumber: result.moveNumber }, state);

  const currentRequestId = ++game.aiRequestId;
  const commitHash = commit.hash;

  io.to(gameId).emit('game_state', vm.getCurrentState());

  const imageData = aiScreenshot
    ? aiScreenshot.replace(/^data:image\/png;base64,/, '')
    : null;

  setTimeout(async () => {
    if (currentRequestId !== game.aiRequestId) {
      console.log(`[AI] 请求 ${currentRequestId} 已过期，忽略`);
      return;
    }

    io.to(gameId).emit('ai_loading', { hash: commitHash });

    try {
      console.log(`[AI] 开始分析 #${result.moveNumber} 手 (hash: ${commitHash.substring(0, 8)})`);
      const analysis = await callDoubao(state, imageData);

      if (currentRequestId !== game.aiRequestId) {
        console.log(`[AI] 请求 ${currentRequestId} 已过期，结果归档`);
        vm.setAIAnalysis(commitHash, analysis);
        return;
      }

      vm.setAIAnalysis(commitHash, analysis);
      io.to(gameId).emit('ai_response', { hash: commitHash, analysis });
      console.log(`[AI] 分析完成 #${result.moveNumber} 手`);
    } catch (error) {
      console.error('[AI] 分析失败:', error.message);
      if (currentRequestId === game.aiRequestId) {
        io.to(gameId).emit('ai_error', { hash: commitHash, error: error.message || 'AI分析失败' });
      }
    }
  }, 100);

  res.json({
    success: true,
    hash: commit.hash,
    state: vm.getCurrentState()
  });
});

app.get('/api/games/:gameId/export', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  const data = game.versionManager.exportGame();
  res.json(data);
});

app.post('/api/games/:gameId/import', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  const result = game.versionManager.importGame(req.body);
  game.aiRequestId++;

  if (result.success) {
    io.to(gameId).emit('game_state', game.versionManager.getCurrentState());
  }

  res.json(result);
});

app.post('/api/games/:gameId/new', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  game.versionManager.newGame();
  game.aiRequestId = 0;
  game.pendingAI = null;

  io.to(gameId).emit('game_state', game.versionManager.getCurrentState());
  res.json({ success: true, state: game.versionManager.getCurrentState() });
});

app.post('/api/games/:gameId/cleanup', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  const deleted = game.versionManager.cleanupDetachedBranches();
  game.aiRequestId++;

  io.to(gameId).emit('game_state', game.versionManager.getCurrentState());
  res.json({ success: true, deleted });
});

app.post('/api/games/:gameId/undo', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  const vm = game.versionManager;

  const success = vm.undo();
  game.aiRequestId++;

  if (success) {
    io.to(gameId).emit('game_state', vm.getCurrentState());
  }

  res.json({ success, state: vm.getCurrentState() });
});

app.post('/api/games/:gameId/checkout', (req, res) => {
  const { gameId = 'default' } = req.params;
  const { hash } = req.body;
  const game = getOrCreateGame(gameId);
  const vm = game.versionManager;

  const result = vm.checkout(hash);
  game.aiRequestId++;

  if (result.success) {
    io.to(gameId).emit('game_state', vm.getCurrentState());
  }

  res.json({ ...result, state: vm.getCurrentState() });
});

app.post('/api/games/:gameId/reset', (req, res) => {
  const { gameId = 'default' } = req.params;
  const { hash, hard = true } = req.body;
  const game = getOrCreateGame(gameId);
  const vm = game.versionManager;

  const result = vm.reset(hash, hard);
  game.aiRequestId++;

  if (result.success) {
    io.to(gameId).emit('game_state', vm.getCurrentState());
  }

  res.json({ ...result, state: vm.getCurrentState() });
});

app.get('/api/games/:gameId/state', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  res.json(game.versionManager.getCurrentState());
});

app.get('/api/games/:gameId/log', (req, res) => {
  const { gameId = 'default' } = req.params;
  const { limit = 50 } = req.query;
  const game = getOrCreateGame(gameId);
  res.json(game.versionManager.getLog(parseInt(limit)));
});

app.get('/api/games/:gameId/history', (req, res) => {
  const { gameId = 'default' } = req.params;
  const game = getOrCreateGame(gameId);
  res.json(game.versionManager.getFullHistory());
});

app.get('/api/games/:gameId/ai/:hash', (req, res) => {
  const { gameId = 'default', hash } = req.params;
  const game = getOrCreateGame(gameId);
  const analysis = game.versionManager.getAIAnalysis(hash);
  res.json({ hash, analysis });
});

app.post('/api/games/:gameId/ai', async (req, res) => {
  const { gameId = 'default' } = req.params;
  const { imageBase64 } = req.body;
  const game = getOrCreateGame(gameId);
  const vm = game.versionManager;
  const state = vm.getCurrentState();

  const currentRequestId = ++game.aiRequestId;
  const commitHash = state.hash;

  io.to(gameId).emit('ai_loading', { hash: commitHash });

  try {
    const imageData = imageBase64
      ? imageBase64.replace(/^data:image\/png;base64,/, '')
      : null;
    const analysis = await callDoubao(state, imageData);

    if (currentRequestId !== game.aiRequestId) {
      vm.setAIAnalysis(commitHash, analysis);
      return res.json({ success: true, hash: commitHash, analysis, stale: true });
    }

    vm.setAIAnalysis(commitHash, analysis);
    io.to(gameId).emit('ai_response', { hash: commitHash, analysis });
    res.json({ success: true, hash: commitHash, analysis });
  } catch (error) {
    console.error('AI分析失败:', error.message);
    io.to(gameId).emit('ai_error', { hash: commitHash, error: error.message || 'AI分析失败' });
    res.json({ success: false, error: error.message || 'AI分析失败' });
  }
});

app.post('/api/games/:gameId/command', (req, res) => {
  const { gameId = 'default' } = req.params;
  const { command } = req.body;
  const game = getOrCreateGame(gameId);
  const vm = game.versionManager;

  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  let result = { success: false, message: '' };

  try {
    switch (cmd) {
      case 'undo':
        const undoSuccess = vm.undo();
        game.aiRequestId++;
        result = { success: undoSuccess, message: undoSuccess ? '撤回成功' : '无法撤回' };
        if (undoSuccess) io.to(gameId).emit('game_state', vm.getCurrentState());
        break;

      case 'log': {
        const limit = args[0] ? parseInt(args[0]) : 20;
        const logs = vm.getLog(limit);
        result = { success: true, logs };
        break;
      }

      case 'checkout': {
        if (!args[0] || args[0] === '.') {
          const headHash = vm.getHeadHash();
          const checkoutResult = vm.checkout(headHash);
          vm.cleanupDetachedBranches();
          game.aiRequestId++;
          result = { success: checkoutResult.success, message: '已回到HEAD，临时分支已清理' };
          if (checkoutResult.success) io.to(gameId).emit('game_state', vm.getCurrentState());
          break;
        }
        const checkoutResult = vm.checkout(args[0]);
        game.aiRequestId++;
        result = { success: checkoutResult.success, message: checkoutResult.success ? `切换到 ${args[0]}（临时分支模式，可下棋，回到HEAD将清理）` : checkoutResult.reason };
        if (checkoutResult.success) io.to(gameId).emit('game_state', vm.getCurrentState());
        break;
      }

      case 'reset': {
        let hash = args[0];
        let hard = true;
        if (args[0] === '--hard' && args[1]) {
          hard = true;
          hash = args[1];
        } else if (args[0] === '--soft') {
          hard = false;
          hash = args[1];
        }
        if (!hash) {
          result = { success: false, message: '请提供commit hash' };
          break;
        }
        const resetResult = vm.reset(hash, hard);
        if (hard) vm.cleanupDetachedBranches();
        game.aiRequestId++;
        result = { success: resetResult.success, message: resetResult.success ? `${hard ? '硬重置' : '软重置'}到 ${hash}` : resetResult.reason };
        if (resetResult.success) io.to(gameId).emit('game_state', vm.getCurrentState());
        break;
      }

      case 'new':
        vm.newGame();
        game.aiRequestId = 0;
        result = { success: true, message: '已开始新对局' };
        io.to(gameId).emit('game_state', vm.getCurrentState());
        break;

      case 'cleanup': {
        const deleted = vm.cleanupDetachedBranches();
        game.aiRequestId++;
        result = { success: true, message: `已清理 ${deleted} 个临时分支节点` };
        io.to(gameId).emit('game_state', vm.getCurrentState());
        break;
      }

      case 'status': {
        const state = vm.getCurrentState();
        result = {
          success: true,
          status: {
            currentHash: state.hash,
            headHash: vm.getHeadHash(),
            detachedHead: state.detachedHead,
            moveCount: state.moveHistory.length,
            currentPlayer: state.currentPlayer === BLACK ? '黑方' : '白方',
            capturedBlack: state.capturedBlack,
            capturedWhite: state.capturedWhite
          }
        };
        break;
      }

      case 'help':
        result = {
          success: true,
          help: [
            'undo - 撤回一步棋',
            'log [n] - 查看最近n步历史',
            'checkout <hash> - 切换到某个版本（形成临时分支，可继续下棋）',
            'checkout . - 回到HEAD（清理所有临时分支）',
            'reset [--hard|--soft] <hash> - 重置到某个版本',
            'new - 开始新对局',
            'cleanup - 清理所有不在主线上的临时分支',
            'status - 查看当前状态',
            'count [贴目] - 数子（中国规则），默认贴7.5目',
            'help - 显示帮助'
          ]
        };
        break;

      case 'count':
      case 'score': {
        const komi = args[0] ? parseFloat(args[0]) : 7.5;
        if (isNaN(komi) || komi < 0) {
          result = { success: false, message: '贴目参数无效，请输入数字（默认7.5）' };
          break;
        }
        const engine = vm.getCurrentEngine();
        const score = engine.countScore(komi);

        let lines = [];
        lines.push(`数子结果（中国规则，贴目${komi}目）:`);
        lines.push(`  黑方: ${score.blackStones}子 + ${score.blackTerritory}目 = ${score.blackTotal}`);
        lines.push(`  白方: ${score.whiteStones}子 + ${score.whiteTerritory}目 + ${komi}贴目 = ${score.whiteTotal}`);
        lines.push(`  单官(公气): ${score.dame}`);
        if (score.winner === 'black') {
          lines.push(`  >>> 黑方胜 ${score.margin}目`);
        } else if (score.winner === 'white') {
          lines.push(`  >>> 白方胜 ${score.margin}目`);
        } else {
          lines.push(`  >>> 和棋`);
        }

        result = { success: true, score, lines };
        break;
      }

      default:
        result = { success: false, message: `未知命令: ${cmd}，输入help查看帮助` };
    }
  } catch (e) {
    result = { success: false, message: e.message };
  }

  res.json(result);
});

io.on('connection', (socket) => {
  console.log('客户端连接:', socket.id);

  socket.on('join_game', (gameId = 'default') => {
    socket.join(gameId);
    const game = getOrCreateGame(gameId);
    game.clients.add(socket.id);
    socket.emit('game_state', game.versionManager.getCurrentState());
    console.log(`客户端 ${socket.id} 加入房间 ${gameId}`);
  });

  socket.on('disconnect', () => {
    console.log('客户端断开:', socket.id);
    for (const [gameId, game] of games.entries()) {
      game.clients.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;

const CLIENT_DIST = path.join(__dirname, '../client/dist');
app.use(express.static(CLIENT_DIST));
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return res.status(404).end();
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`围棋服务器运行在 http://localhost:${PORT}`);
  console.log(`API地址: http://localhost:${PORT}/api`);
});
