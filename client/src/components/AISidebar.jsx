export default function AISidebar({ analysis, loading, currentHash }) {
  return (
    <div style={{
      width: '340px',
      height: '100%',
      background: '#1a1a2e',
      color: '#e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid #333'
    }}>
      <div style={{
        padding: '12px 16px',
        background: '#16213e',
        borderBottom: '1px solid #333',
        fontSize: '16px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ fontSize: '20px' }}>🤖</span>
        AI 围棋教练
        {loading && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '12px',
            color: '#ffd700',
            animation: 'pulse 1s infinite'
          }}>分析中...</span>
        )}
      </div>

      <div style={{
        padding: '8px 16px',
        background: '#0f3460',
        fontSize: '11px',
        color: '#888',
        fontFamily: 'monospace',
        borderBottom: '1px solid #333'
      }}>
        当前版本: {currentHash ? currentHash.substring(0, 8) : '---'}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#888'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔮</div>
            <div>AI正在思考中...</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>
              分析棋盘局势和最佳应对
            </div>
          </div>
        )}

        {!loading && !analysis && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#666'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
            <div>下一手棋后</div>
            <div style={{ marginTop: '4px' }}>AI将为你提供指导</div>
            <div style={{ fontSize: '12px', marginTop: '16px', color: '#555', lineHeight: '1.6' }}>
              💡 提示：右键棋盘可以悔棋
            </div>
          </div>
        )}

        {!loading && analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Section title="📊 局势分析" icon="📊">
              <p style={{ margin: 0, lineHeight: '1.6', fontSize: '14px' }}>
                {analysis.situation}
              </p>
            </Section>

            <Section title="💡 棋理讲解" icon="📚" color="#ffd700">
              <p style={{ margin: 0, lineHeight: '1.7', fontSize: '14px' }}>
                {analysis.principle}
              </p>
            </Section>

            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <Section title="✅ 推荐下法" icon="🎯" color="#4caf50">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {analysis.recommendations.map((rec, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(76, 175, 80, 0.1)',
                      border: '1px solid rgba(76, 175, 80, 0.3)',
                      borderRadius: '6px',
                      padding: '10px 12px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <span style={{
                          background: '#4caf50',
                          color: 'white',
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 'bold'
                        }}>{rec.position}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5' }}>
                        {rec.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {analysis.antiPatterns && analysis.antiPatterns.length > 0 && (
              <Section title="⚠️ 避坑指南" icon="🚫" color="#f44336">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {analysis.antiPatterns.map((ap, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(244, 67, 54, 0.1)',
                      border: '1px solid rgba(244, 67, 54, 0.3)',
                      borderRadius: '6px',
                      padding: '10px 12px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <span style={{
                          background: '#f44336',
                          color: 'white',
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 'bold'
                        }}>{ap.position}</span>
                        <span style={{ fontSize: '11px', color: '#f44336' }}>俗手/恶手</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5' }}>
                        {ap.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, color }) {
  return (
    <div>
      <div style={{
        fontSize: '13px',
        fontWeight: 'bold',
        marginBottom: '8px',
        color: color || '#e0e0e0',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}
