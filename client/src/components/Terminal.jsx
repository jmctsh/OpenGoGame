import { useState, useRef, useEffect } from 'react';

export default function Terminal({ onCommand, currentHash, onClose }) {
  const [history, setHistory] = useState([
    { type: 'system', text: '╔══════════════════════════════════════╗' },
    { type: 'system', text: '║   Go Git Terminal - 围棋版本控制终端  ║' },
    { type: 'system', text: '╚══════════════════════════════════════╝' },
    { type: 'help', text: '输入 help 查看可用命令' },
    { type: 'system', text: '' }
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const executeCommand = async (cmd) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);

    setHistory(prev => [...prev, { type: 'input', text: `go $ ${trimmed}` }]);

    if (trimmed === 'clear' || trimmed === 'cls') {
      setHistory([]);
      return;
    }

    const result = await onCommand(trimmed);
    
    if (result.success) {
      if (result.logs) {
        const logLines = result.logs.map(log => {
          const marker = log.isCurrent ? ' * ' : '   ';
          const pos = log.move ? `${log.move.x},${log.move.y}` : 'initial';
          const player = log.move ? (log.move.player === 1 ? '黑' : '白') : '';
          const ai = log.hasAI ? ' 🤖' : '';
          const head = log.isHead ? ' [HEAD]' : '';
          return {
            type: 'log',
            text: `${marker}${log.hash.substring(0, 8)} ${player}#${log.moveNumber}${head}${ai}`
          };
        });
        setHistory(prev => [...prev, ...logLines]);
      } else if (result.help) {
        setHistory(prev => [
          ...prev,
          ...result.help.map(h => ({ type: 'help', text: h }))
        ]);
      } else if (result.status) {
        setHistory(prev => [...prev,
          { type: 'output', text: `当前版本: ${result.status.currentHash?.substring(0, 8)}` },
          { type: 'output', text: `HEAD: ${result.status.headHash?.substring(0, 8)}` },
          { type: 'output', text: `模式: ${result.status.detachedHead ? 'Detached HEAD (浏览历史)' : '正常模式'}` },
          { type: 'output', text: `手数: ${result.status.moveCount}` },
          { type: 'output', text: `当前落子方: ${result.status.currentPlayer}` },
          { type: 'output', text: `提子 - 黑提白:${result.status.capturedWhite} 白提黑:${result.status.capturedBlack}` }
        ]);
      } else if (result.lines) {
        const scoreItems = result.lines.map(l => ({ type: 'output', text: l }));
        setHistory(prev => [...prev, ...scoreItems]);
      } else {
        setHistory(prev => [...prev, { type: 'success', text: result.message }]);
      }
    } else {
      setHistory(prev => [...prev, { type: 'error', text: `错误: ${result.message}` }]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      executeCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'Escape') {
      onClose?.();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '160px',
      left: '10px',
      width: '500px',
      height: '300px',
      background: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: '13px',
      zIndex: 1000,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    }}>
      <div style={{
        padding: '8px 12px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }} />
        </div>
        <span style={{ color: '#8b949e', marginLeft: '8px' }}>go-terminal</span>
        <span style={{ color: '#58a6ff', fontSize: '11px', marginLeft: 'auto' }}>
          {currentHash?.substring(0, 8) || '---'}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px'
          }}
        >×</button>
      </div>

      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          lineHeight: '1.5'
        }}
      >
        {history.map((item, idx) => (
          <div key={idx} style={{
            color: item.type === 'error' ? '#f85149' :
                   item.type === 'success' ? '#3fb950' :
                   item.type === 'input' ? '#58a6ff' :
                   item.type === 'help' ? '#d29922' :
                   item.type === 'log' ? '#8b949e' :
                   '#c9d1d9',
            whiteSpace: 'pre'
          }}>
            {item.text}
          </div>
        ))}
      </div>

      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ color: '#3fb950' }}>go $</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#c9d1d9',
            fontFamily: 'inherit',
            fontSize: 'inherit'
          }}
          placeholder="输入命令，如 help, undo, log, checkout <hash>, reset --hard <hash>"
          autoFocus
        />
      </div>
    </div>
  );
}
