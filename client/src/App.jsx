import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import GoBoard from './components/GoBoard';
import { generateAIBoardImage } from './components/GoBoard';
import { simulateMove } from './goEngine';
import AISidebar from './components/AISidebar';
import WorkTree from './components/WorkTree';
import Terminal from './components/Terminal';

const SERVER_URL = window.location.origin;
const GAME_ID = 'default';

function App() {
  const [gameState, setGameState] = useState(null);
  const [aiAnalysis, setAIAnalysis] = useState(null);
  const [aiLoading, setAILoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [showNewGameDialog, setShowNewGameDialog] = useState(false);
  const fileInputRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${GAME_ID}/log?limit=30`);
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      console.error('获取日志失败:', e);
    }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${GAME_ID}/state`);
      const data = await res.json();
      setGameState(data);
      setAIAnalysis(data.aiAnalysis);
      return data;
    } catch (e) {
      console.error('获取状态失败:', e);
      setError('无法连接到服务器');
    }
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, { path: '/socket.io' });

    socket.on('connect', () => {
      console.log('已连接到服务器');
      setConnected(true);
      setError(null);
      socket.emit('join_game', GAME_ID);
    });

    socket.on('disconnect', () => {
      console.log('与服务器断开连接');
      setConnected(false);
    });

    socket.on('game_state', (state) => {
      setGameState(state);
      setAIAnalysis(state.aiAnalysis);
      setAILoading(false);
      fetchLogs();
    });

    socket.on('ai_loading', () => {
      setAILoading(true);
    });

    socket.on('ai_response', ({ hash, analysis }) => {
      setAIAnalysis(analysis);
      setAILoading(false);
      fetchLogs();
    });

    socket.on('ai_error', ({ error }) => {
      setAILoading(false);
      if (error) {
        setError('AI错误: ' + error);
        setTimeout(() => setError(null), 5000);
      }
    });

    fetchState();
    fetchLogs();

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (gameState && gameState.hash) {
      setAIAnalysis(gameState.aiAnalysis);
      setAILoading(false);
    }
  }, [gameState?.hash]);

  const placeStone = useCallback(async (x, y) => {
    if (!gameState) return;

    setAILoading(true);
    setError(null);

    try {
      let aiScreenshot = null;
      try {
        const tempState = simulateMove(gameState, x, y);
        if (tempState) {
          aiScreenshot = generateAIBoardImage(tempState);
          if (aiScreenshot) {
            aiScreenshot = aiScreenshot.replace(/^data:image\/png;base64,/, '');
          }
        }
      } catch (e) {
        console.warn('生成AI截图失败，使用文本模式:', e);
      }

      const res = await fetch(`/api/games/${GAME_ID}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, aiScreenshot })
      });
      const data = await res.json();
      if (!data.success) {
        setAILoading(false);
        if (data.reason === 'suicide') {
          setError('禁止自杀落子');
        } else if (data.reason === 'invalid') {
          setError('无效位置（已有棋子或违反劫规则）');
        }
        setTimeout(() => setError(null), 2000);
      }
    } catch (e) {
      console.error('落子失败:', e);
      setAILoading(false);
      setError('落子失败，请检查网络连接');
    }
  }, [gameState]);

  const handleUndo = useCallback(async () => {
    try {
      await fetch(`/api/games/${GAME_ID}/undo`, { method: 'POST' });
      setAILoading(false);
    } catch (e) {
      console.error('悔棋失败:', e);
    }
  }, []);

  const handleContextMenu = useCallback(() => {
    handleUndo();
  }, [handleUndo]);

  const handleCheckout = useCallback(async (hash) => {
    try {
      await fetch(`/api/games/${GAME_ID}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash })
      });
    } catch (e) {
      console.error('checkout失败:', e);
    }
  }, []);

  const handleCommand = useCallback(async (command) => {
    try {
      const res = await fetch(`/api/games/${GAME_ID}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      const data = await res.json();
      setAILoading(false);
      fetchLogs();
      return data;
    } catch (e) {
      return { success: false, message: '命令执行失败: ' + e.message };
    }
  }, [fetchLogs]);

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${GAME_ID}/export`);
      const data = await res.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      const moves = data.commits ? data.commits.length - 1 : 0;
      a.download = `go-game-${date}-${moves}moves.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setError('对局已导出');
      setTimeout(() => setError(null), 2000);
    } catch (e) {
      console.error('导出失败:', e);
      setError('导出失败');
      setTimeout(() => setError(null), 2000);
    }
  }, []);

  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const res = await fetch(`/api/games/${GAME_ID}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      
      if (result.success) {
        setError('对局导入成功');
      } else {
        setError('导入失败: ' + (result.reason || '未知错误'));
      }
      setTimeout(() => setError(null), 2000);
    } catch (e) {
      console.error('导入失败:', e);
      setError('导入失败: 文件格式不正确');
      setTimeout(() => setError(null), 2000);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleNewGame = useCallback(() => {
    const hasMoves = gameState && gameState.moveHistory && gameState.moveHistory.length > 0;
    if (hasMoves) {
      setShowNewGameDialog(true);
    } else {
      doNewGame();
    }
  }, [gameState]);

  const doNewGame = useCallback(async () => {
    try {
      await fetch(`/api/games/${GAME_ID}/new`, { method: 'POST' });
      setShowNewGameDialog(false);
      setAIAnalysis(null);
      setAILoading(false);
    } catch (e) {
      console.error('新对局失败:', e);
      setError('创建新对局失败');
      setTimeout(() => setError(null), 2000);
    }
  }, []);

  const goToHead = useCallback(async () => {
    await handleCommand('checkout .');
  }, [handleCommand]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      background: '#0d1117'
    }}>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <h1 style={{
            fontSize: '24px',
            color: '#e6edf3',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: 0
          }}>
            <span style={{ fontSize: '28px' }}>⚫⚪</span>
            AI围棋教练
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleNewGame}
              title="开始新对局"
              style={{
                background: '#238636',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500'
              }}
            >
              🆕 新对局
            </button>
            <button
              onClick={handleExport}
              title="导出对局为JSON文件"
              style={{
                background: '#21262d',
                color: '#e6edf3',
                border: '1px solid #30363d',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              📤 导出
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="导入对局JSON文件"
              style={{
                background: '#21262d',
                color: '#e6edf3',
                border: '1px solid #30363d',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              📥 导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div style={{
          position: 'absolute',
          top: '16px',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? '#3fb950' : '#f85149',
            display: 'inline-block'
          }} />
          <span style={{ color: connected ? '#3fb950' : '#f85149' }}>
            {connected ? '已连接' : '未连接'}
          </span>
        </div>

        {error && (
          <div style={{
            position: 'absolute',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(248, 81, 73, 0.9)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            zIndex: 100,
            animation: 'pulse 0.5s ease-in-out'
          }}>
            {error}
          </div>
        )}

        {gameState && (
          <GoBoard
            gameState={gameState}
            onPlaceStone={placeStone}
            onContextMenu={handleContextMenu}
            aiSuggestions={aiAnalysis}
          />
        )}

        {!gameState && (
          <div style={{ color: '#8b949e', fontSize: '18px' }}>
            加载中...
          </div>
        )}
      </div>

      <AISidebar
        analysis={aiAnalysis}
        loading={aiLoading}
        currentHash={gameState?.hash}
      />

      <WorkTree
        logs={logs}
        currentHash={gameState?.hash}
        isDetached={gameState?.detachedHead}
        onCheckout={handleCheckout}
        onUndo={handleUndo}
        onOpenTerminal={() => setShowTerminal(true)}
        onGoToHead={goToHead}
      />

      {showTerminal && (
        <Terminal
          onCommand={handleCommand}
          currentHash={gameState?.hash}
          onClose={() => setShowTerminal(false)}
        />
      )}

      {gameState?.detachedHead && (
        <div style={{
          position: 'fixed',
          top: '50px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(189, 147, 50, 0.95)',
          color: '#000',
          padding: '8px 20px',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '500',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>🌿 临时分支模式 - 在此下棋不会影响主线，回到HEAD将被清理</span>
          <button
            onClick={goToHead}
            style={{
              background: '#000',
              color: '#d29922',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >回到主线</button>
        </div>
      )}

      {showNewGameDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            padding: '24px',
            width: '400px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ color: '#e6edf3', margin: '0 0 12px 0', fontSize: '18px' }}>
              ⚠️ 开始新对局
            </h3>
            <p style={{ color: '#8b949e', margin: '0 0 20px 0', lineHeight: '1.6', fontSize: '14px' }}>
              当前对局有 {gameState?.moveHistory?.length || 0} 手棋。
              如果不保存就开始新对局，<strong style={{ color: '#f0883e' }}>当前所有历史和AI分析都将丢失</strong>。
            </p>
            <p style={{ color: '#8b949e', margin: '0 0 20px 0', fontSize: '13px' }}>
              💡 建议先点击"导出"保存当前对局。
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewGameDialog(false)}
                style={{
                  background: '#21262d',
                  color: '#e6edf3',
                  border: '1px solid #30363d',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >取消</button>
              <button
                onClick={() => {
                  setShowNewGameDialog(false);
                  handleExport();
                }}
                style={{
                  background: '#1f6feb',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >先导出再新开局</button>
              <button
                onClick={doNewGame}
                style={{
                  background: '#da3633',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >不保存，新开局</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
