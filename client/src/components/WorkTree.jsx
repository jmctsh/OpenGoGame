const COL_LABELS = 'ABCDEFGHJKLMNOPQRST';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function coordToPos(x, y) {
  return COL_LABELS[x] + (19 - y);
}

export default function WorkTree({ logs, currentHash, isDetached, onCheckout, onUndo, onOpenTerminal, onGoToHead }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      width: '280px',
      maxHeight: '140px',
      background: 'rgba(13, 17, 23, 0.95)',
      border: '1px solid #30363d',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'JetBrains Mono', 'Consolas', monospace",
      fontSize: '12px',
      zIndex: 999,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
    }}>
      <div style={{
        padding: '6px 10px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
      }}>
        <span style={{ fontSize: '14px' }}>🌿</span>
        <span style={{ color: '#58a6ff', fontWeight: 'bold' }}>worktree</span>
        <span style={{ color: '#8b949e', fontSize: '10px', marginLeft: 'auto' }}>
          {currentHash?.substring(0, 8)}
        </span>
      </div>

      <div style={{
        padding: '4px 6px',
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid #21262d'
      }}>
        <button
          onClick={onUndo}
          title="右键棋盘也可以悔棋"
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#c9d1d9',
            padding: '3px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >↩ 悔棋</button>
        {isDetached && onGoToHead && (
          <button
            onClick={onGoToHead}
            title="回到主线HEAD并清理临时分支"
            style={{
              background: 'rgba(189, 147, 50, 0.2)',
              border: '1px solid #bd9332',
              borderRadius: '4px',
              color: '#bd9332',
              padding: '3px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >⤴ 回主线</button>
        )}
        <button
          onClick={onOpenTerminal}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#c9d1d9',
            padding: '3px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginLeft: 'auto'
          }}
        >{'>'}_ 终端</button>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 6px'
      }}>
        {logs && logs.length > 0 ? (
          logs.map((log, idx) => {
            const isCurrent = log.hash === currentHash;
            const isInitial = !log.move;
            const player = log.move ? (log.move.player === 1 ? '⚫' : '⚪') : '🎯';
            const pos = log.move ? coordToPos(log.move.x, log.move.y) : '初始';
            const shortHash = log.hash.substring(0, 7);

            return (
              <div
                key={log.hash}
                onClick={() => onCheckout(log.hash)}
                title={`点击切换到此版本\n${log.hash}`}
                style={{
                  padding: '3px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isCurrent ? 'rgba(56, 139, 253, 0.2)' : 'transparent',
                  color: isCurrent ? '#58a6ff' : '#8b949e',
                  borderLeft: isCurrent ? '2px solid #58a6ff' : '2px solid transparent',
                  marginBottom: '1px',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: isCurrent ? '#58a6ff' : log.isHead ? '#3fb950' : '#30363d',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  color: '#000'
                }}>{isCurrent ? '●' : ''}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: isCurrent ? '#58a6ff' : '#6e7681' }}>
                  {shortHash}
                </span>
                <span>{player}</span>
                <span style={{ fontSize: '11px', color: isCurrent ? '#c9d1d9' : '#8b949e' }}>
                  #{log.moveNumber} {pos}
                </span>
                {log.hasAI && <span style={{ fontSize: '10px' }}>🤖</span>}
                {log.isHead && !isCurrent && (
                  <span style={{ fontSize: '9px', color: '#3fb950', marginLeft: 'auto' }}>HEAD</span>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ color: '#484f58', padding: '8px', textAlign: 'center' }}>
            暂无历史记录
          </div>
        )}
      </div>
    </div>
  );
}
