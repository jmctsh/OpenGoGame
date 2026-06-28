const fetch = require('node-fetch');

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
let proxyAgentPromise = null;

async function getProxyAgent() {
  if (!proxyUrl) {
    return null;
  }

  if (!proxyAgentPromise) {
    proxyAgentPromise = import('https-proxy-agent')
      .then(({ HttpsProxyAgent }) => new HttpsProxyAgent(proxyUrl));
  }

  return proxyAgentPromise;
}

// 豆包 API 配置
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
// API Key 优先级: 环境变量 ARK_API_KEY > DOUBAO_API_KEY > .env 文件
const API_KEY = process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY || '';
// 模型 ID
const MODEL_ID = process.env.DOUBAO_MODEL_ID || 'doubao-seed-2-1-pro-260628';

// AI 输入模式: 'image' 用截图 (默认), 'text' 用纯文本描述
// 截图模式下 AI 看得更清楚，但消耗更多 token；文本模式轻量快速
const AI_INPUT_MODE = process.env.AI_INPUT_MODE || 'image';

// 思考程度: minimal / low / medium / high (默认 minimal，即不思考，响应最快)
// minimal: 不思考，快速回答，延迟最低（推荐用于实时指导）
// high: 深度思考，分析更全面，但响应慢（需要30秒以上）
const REASONING_EFFORT = process.env.REASONING_EFFORT || 'minimal';

function boardToTextDescription(engineState) {
  const { board, currentPlayer, moveHistory, size } = engineState;
  const last10Moves = moveHistory.slice(-10);
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

  let desc = `当前围棋棋盘状态（${size}路）：\n\n`;

  const colLabels = 'ABCDEFGHJKLMNOPQRST';
  desc += '    ' + colLabels.split('').map(label => label.padStart(3, ' ')).join('') + '\n';

  for (let y = 0; y < size; y++) {
    const rowNum = (size - y).toString().padStart(2, ' ');
    desc += rowNum + ' ';
    for (let x = 0; x < size; x++) {
      const stone = board[y][x];
      let ch = '.';
      if (stone === 1) ch = 'B';
      else if (stone === 2) ch = 'W';

      const lastMoveIdx = last10Moves.findIndex(m => m.x === x && m.y === y);
      if (lastMoveIdx !== -1) {
        const num = lastMoveIdx + 1;
        ch = stone === 1 ? `B${num}` : `W${num}`;
      }
      desc += ch.padStart(3, ' ');
    }
    desc += '\n';
  }

  desc += `\n当前局面: ${currentPlayer === 1 ? '现在轮到黑方(B)落子' : '现在轮到白方(W)落子'}`;
  if (lastMove) {
    const lastPos = colLabels[lastMove.x] + (size - lastMove.y);
    const lastColor = lastMove.player === 1 ? '黑方(B)' : '白方(W)';
    desc += `\n上一手: ${lastColor} 下在 ${lastPos}`;
  } else {
    desc += '\n上一手: 暂无，当前是空棋盘';
  }
  desc += `\n总手数: ${moveHistory.length}`;

  if (last10Moves.length > 0) {
    desc += '\n\n最近10步(编号按时间顺序递增，数字越大越新，最大数字代表最新一手):';
    last10Moves.forEach((m, i) => {
      const pos = colLabels[m.x] + (size - m.y);
      const color = m.player === 1 ? '黑' : '白';
      desc += `\n  ${i + 1}. ${color}${pos}`;
    });
  }

  return desc;
}

function buildPrompt(engineState) {
  const boardDesc = boardToTextDescription(engineState);

  return `你是一位经验丰富的围棋老师，正在给新手做实时对局指导。回复务必简短精炼。

${boardDesc}

请用中文回复，面向围棋新手，语言通俗易懂。每个字段尽量简短，不要长篇大论。请严格按照以下JSON格式返回（不要返回其他内容，直接返回JSON）：

{
  "situation": "1-2句话描述当前局势，简短",
  "principle": "结合当前局面讲一个棋理谚语，用1句话解释，不要太长",
  "recommendations": [
    {"position": "坐标如D4", "reason": "一句话理由"},
    {"position": "坐标", "reason": "一句话理由"}
  ],
  "antiPatterns": [
    {"position": "坐标", "reason": "一句话说明为什么不好"}
  ]
}

注意：
1. 推荐下法给1-2个即可，每个理由一句话说清
2. 反模式给1-2个即可，理由一句话
3. 坐标使用列字母(A-T跳过I)+行数字(1-19)格式，如左上角A19，右下角T1
4. B=黑，W=白；棋盘上的最近10子按时间顺序编号，数字越大越新，最大数字代表最新一手
5. “当前局面”里已经明确写了现在轮到哪一方落子；你的 recommendations 和 antiPatterns 都必须站在当前落子方视角来分析
6. 如果局面里写了“上一手”，请结合上一手与当前轮到的一方判断攻防，不要把上一手一方误认为当前行棋方
7. 棋盘空时建议先占角、守角、挂角
8. 整体回复要简短，总字数控制在200字以内，快速给出关键建议
9. 一定要用JSON格式，不要有额外说明`;
}

function buildImagePrompt(engineState) {
  const currentPlayerText = engineState.currentPlayer === 1 ? '黑方(B)' : '白方(W)';
  const lastMove = engineState.moveHistory.length > 0 ? engineState.moveHistory[engineState.moveHistory.length - 1] : null;
  const colLabels = 'ABCDEFGHJKLMNOPQRST';
  const lastMoveText = lastMove
    ? `${lastMove.player === 1 ? '黑方(B)' : '白方(W)'} 下在 ${colLabels[lastMove.x]}${engineState.size - lastMove.y}`
    : '暂无，当前是空棋盘';

  return `你是一位经验丰富的围棋老师，正在给新手做实时对局指导。回复务必简短精炼。

上面是当前围棋棋盘（${engineState.size}路）。
当前局面：现在轮到${currentPlayerText}落子。
上一手：${lastMoveText}。
标有数字的棋子是最近下的，数字越大越新，最大数字代表最新一手；如果不足10手，则当前最大数字就是最新一手。

请用中文回复，面向围棋新手，语言通俗易懂。每个字段尽量简短，不要长篇大论。请严格按照以下JSON格式返回（不要返回其他内容，直接返回JSON）：

{
  "situation": "1-2句话描述当前局势，简短",
  "principle": "结合当前局面讲一个棋理谚语，用1句话解释，不要太长",
  "recommendations": [
    {"position": "坐标如D4", "reason": "一句话理由"},
    {"position": "坐标", "reason": "一句话理由"}
  ],
  "antiPatterns": [
    {"position": "坐标", "reason": "一句话说明为什么不好"}
  ]
}

注意：
1. 推荐下法给1-2个即可，每个理由一句话说清
2. 反模式给1-2个即可，理由一句话
3. 坐标使用列字母(A-T跳过I)+行数字(1-19)格式，如左上角A19，右下角T1
4. 棋盘上的最近10子按时间顺序编号，数字越大越新，最大数字代表最新一手
5. recommendations 和 antiPatterns 都必须站在当前落子方视角来分析，不要把上一手一方误认为当前行棋方
6. 棋盘空时建议先占角、守角、挂角
7. 整体回复要简短，总字数控制在200字以内，快速给出关键建议
8. 一定要用JSON格式，不要有额外说明`;
}

async function callDoubao(engineState, imageBase64 = null) {
  if (!API_KEY) {
    throw new Error('未配置ARK_API_KEY，AI分析不可用。请在 server/.env 中设置 ARK_API_KEY，或设置系统环境变量。');
  }

  const useImage = AI_INPUT_MODE === 'image' && imageBase64;

  let content;
  if (useImage) {
    content = [
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${imageBase64}`
        }
      },
      {
        type: 'text',
        text: buildImagePrompt(engineState)
      }
    ];
  } else {
    content = [
      {
        type: 'text',
        text: buildPrompt(engineState)
      }
    ];
  }

  const messages = [
    {
      role: 'system',
      content: '你是一位专业的围棋老师，擅长给新手做简短精炼的实时指导。回复必须严格是JSON格式，不要输出其他内容。回答要简短有力，不要长篇大论。'
    },
    {
      role: 'user',
      content: content
    }
  ];

  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: messages,
        temperature: 0.7,
        reasoning_effort: REASONING_EFFORT
      }),
      timeout: 30000
    };

    const proxyAgent = await getProxyAgent();
    if (proxyAgent) {
      fetchOptions.agent = proxyAgent;
    }

    const response = await fetch(DOUBAO_API_URL, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI] 豆包API调用失败:', response.status, errorText.substring(0, 300));
      throw new Error(`豆包API调用失败 (HTTP ${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content_text = data.choices?.[0]?.message?.content || '';

    try {
      const jsonMatch = content_text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      console.error('[AI] 无法从响应中提取JSON:', content_text.substring(0, 200));
      throw new Error('AI返回格式错误，无法解析JSON');
    } catch (e) {
      if (e.message.startsWith('AI返回') || e.message.startsWith('豆包API')) throw e;
      console.error('[AI] 解析AI响应失败:', e);
      throw new Error('AI响应解析失败: ' + e.message);
    }
  } catch (error) {
    if (error.message.startsWith('未配置') || error.message.startsWith('豆包API') || error.message.startsWith('AI返回') || error.message.startsWith('AI响应')) {
      throw error;
    }
    console.error('[AI] 调用豆包API出错:', error);
    throw new Error('AI调用失败: ' + error.message);
  }
}

module.exports = {
  callDoubao,
  buildPrompt,
  boardToTextDescription,
  AI_INPUT_MODE,
  REASONING_EFFORT
};
