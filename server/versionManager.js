const crypto = require('crypto');
const { GoEngine, BLACK, WHITE } = require('./goEngine');

class Commit {
  constructor(hash, parentHash, move, engineState, aiAnalysis = null) {
    this.hash = hash;
    this.parentHash = parentHash;
    this.move = move;
    this.engineState = engineState;
    this.aiAnalysis = aiAnalysis;
    this.timestamp = Date.now();
    this.children = [];
  }
}

class VersionManager {
  constructor() {
    this.commits = new Map();
    this.currentHash = null;
    this.headHash = null;
    this.detachedHead = false;
    this._initInitialCommit();
  }

  _initInitialCommit() {
    const engine = new GoEngine();
    const initialState = engine.getState();
    const hash = this._generateHash(null, null, initialState);
    const initialCommit = new Commit(hash, null, null, initialState, null);
    this.commits.set(hash, initialCommit);
    this.currentHash = hash;
    this.headHash = hash;
  }

  _generateHash(parentHash, move, engineState) {
    const data = JSON.stringify({
      parent: parentHash,
      move,
      board: engineState.board,
      currentPlayer: engineState.currentPlayer,
      moveCount: engineState.moveHistory.length
    });
    return crypto.createHash('sha1').update(data).digest('hex').substring(0, 12);
  }

  _getEngineFromState(state) {
    const engine = new GoEngine(state.size);
    engine.board = state.board.map(row => [...row]);
    engine.currentPlayer = state.currentPlayer;
    engine.moveHistory = [...state.moveHistory];
    engine.capturedBlack = state.capturedBlack;
    engine.capturedWhite = state.capturedWhite;
    engine.koPoint = state.koPoint ? { ...state.koPoint } : null;
    return engine;
  }

  getCurrentState() {
    const commit = this.commits.get(this.currentHash);
    if (!commit) return null;
    return {
      ...commit.engineState,
      hash: commit.hash,
      parentHash: commit.parentHash,
      aiAnalysis: commit.aiAnalysis,
      isHead: this.currentHash === this.headHash,
      detachedHead: this.detachedHead
    };
  }

  getCurrentEngine() {
    const commit = this.commits.get(this.currentHash);
    if (!commit) return null;
    return this._getEngineFromState(commit.engineState);
  }

  commit(move, engineState) {
    const hash = this._generateHash(this.currentHash, move, engineState);
    
    if (this.commits.has(hash)) {
      this.currentHash = hash;
      if (!this.detachedHead) {
        this.headHash = hash;
      }
      return this.commits.get(hash);
    }

    const commit = new Commit(hash, this.currentHash, move, engineState, null);
    this.commits.set(hash, commit);

    const parentCommit = this.commits.get(this.currentHash);
    if (parentCommit) {
      if (!parentCommit.children.includes(hash)) {
        parentCommit.children.push(hash);
      }
    }

    this.currentHash = hash;
    if (!this.detachedHead) {
      this.headHash = hash;
    }

    return commit;
  }

  setAIAnalysis(hash, analysis) {
    const commit = this.commits.get(hash);
    if (commit) {
      commit.aiAnalysis = analysis;
      return true;
    }
    return false;
  }

  getAIAnalysis(hash) {
    const commit = this.commits.get(hash);
    return commit ? commit.aiAnalysis : null;
  }

  undo() {
    if (!this.currentHash) return false;
    const currentCommit = this.commits.get(this.currentHash);
    if (!currentCommit || !currentCommit.parentHash) return false;

    this.currentHash = currentCommit.parentHash;
    if (!this.detachedHead) {
      this.headHash = this.currentHash;
    }
    return true;
  }

  checkout(hash) {
    if (!this.commits.has(hash)) {
      return { success: false, reason: 'commit not found' };
    }
    this.currentHash = hash;
    this.detachedHead = (hash !== this.headHash);
    return { success: true, hash };
  }

  reset(hash, hard = false) {
    if (!this.commits.has(hash)) {
      return { success: false, reason: 'commit not found' };
    }

    if (hard) {
      const toDelete = new Set();
      const queue = [this.headHash];
      const reachable = new Set();
      
      while (queue.length > 0) {
        const h = queue.shift();
        if (reachable.has(h)) continue;
        reachable.add(h);
        const commit = this.commits.get(h);
        if (commit) {
          for (const child of commit.children) {
            queue.push(child);
          }
        }
      }

      const newReachable = new Set();
      const newQueue = [hash];
      while (newQueue.length > 0) {
        const h = newQueue.shift();
        if (newReachable.has(h)) continue;
        newReachable.add(h);
        const commit = this.commits.get(h);
        if (commit) {
          for (const child of commit.children) {
            newQueue.push(child);
          }
        }
      }

      for (const h of reachable) {
        if (!newReachable.has(h)) {
          this.commits.delete(h);
        }
      }
    }

    this.currentHash = hash;
    this.headHash = hash;
    this.detachedHead = false;
    return { success: true, hash };
  }

  getLog(limit = 50) {
    const logs = [];
    let current = this.commits.get(this.currentHash);
    let count = 0;

    while (current && count < limit) {
      logs.push({
        hash: current.hash,
        parentHash: current.parentHash,
        move: current.move,
        timestamp: current.timestamp,
        moveNumber: current.engineState.moveHistory.length,
        hasAI: current.aiAnalysis !== null,
        isHead: current.hash === this.headHash,
        isCurrent: current.hash === this.currentHash
      });
      current = current.parentHash ? this.commits.get(current.parentHash) : null;
      count++;
    }

    return logs;
  }

  getCommit(hash) {
    return this.commits.get(hash) || null;
  }

  getFullHistory() {
    const history = [];
    const visited = new Set();
    
    const walk = (hash) => {
      if (visited.has(hash)) return;
      visited.add(hash);
      const commit = this.commits.get(hash);
      if (!commit) return;
      
      history.push({
        hash: commit.hash,
        parentHash: commit.parentHash,
        children: [...commit.children],
        move: commit.move,
        timestamp: commit.timestamp,
        moveNumber: commit.engineState.moveHistory.length,
        hasAI: commit.aiAnalysis !== null
      });

      for (const child of commit.children) {
        walk(child);
      }
    };

    const initialCommit = Array.from(this.commits.values()).find(c => c.parentHash === null);
    if (initialCommit) {
      walk(initialCommit.hash);
    }

    return history;
  }

  getCurrentHash() {
    return this.currentHash;
  }

  getHeadHash() {
    return this.headHash;
  }

  exportGame() {
    const commits = [];
    for (const [hash, commit] of this.commits.entries()) {
      commits.push({
        hash: commit.hash,
        parentHash: commit.parentHash,
        move: commit.move,
        engineState: commit.engineState,
        aiAnalysis: commit.aiAnalysis,
        timestamp: commit.timestamp,
        children: [...commit.children]
      });
    }

    return {
      version: 1,
      exportedAt: Date.now(),
      headHash: this.headHash,
      currentHash: this.currentHash,
      detachedHead: this.detachedHead,
      commits
    };
  }

  importGame(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.commits)) {
      return { success: false, reason: 'invalid format' };
    }

    this.commits.clear();
    for (const commitData of data.commits) {
      const commit = new Commit(
        commitData.hash,
        commitData.parentHash,
        commitData.move,
        commitData.engineState,
        commitData.aiAnalysis
      );
      commit.timestamp = commitData.timestamp;
      commit.children = [...commitData.children];
      this.commits.set(commitData.hash, commit);
    }

    this.headHash = data.headHash;
    this.currentHash = data.currentHash || data.headHash;
    this.detachedHead = data.detachedHead || false;

    return { success: true, commitCount: this.commits.size };
  }

  newGame() {
    this.commits.clear();
    this.currentHash = null;
    this.headHash = null;
    this.detachedHead = false;
    this._initInitialCommit();
  }

  isOnMainLine(hash) {
    let current = hash;
    while (current !== null) {
      const commit = this.commits.get(current);
      if (!commit) return false;
      if (current === this.headHash) return true;
      current = commit.parentHash;
    }
    return false;
  }

  cleanupDetachedBranches() {
    const mainLine = new Set();
    let current = this.headHash;
    while (current) {
      mainLine.add(current);
      const commit = this.commits.get(current);
      if (!commit) break;
      current = commit.parentHash;
    }

    let deleted = 0;
    for (const [hash, commit] of this.commits.entries()) {
      if (!this._isReachableFromMain(hash, mainLine)) {
        this.commits.delete(hash);
        deleted++;
      }
    }

    const initialCommit = Array.from(this.commits.values()).find(c => c.parentHash === null);
    if (initialCommit) {
      this._cleanupChildrenReferences(initialCommit.hash, mainLine);
    }

    return deleted;
  }

  _isReachableFromMain(hash, mainLine) {
    if (mainLine.has(hash)) return true;
    
    const commit = this.commits.get(hash);
    if (!commit) return false;

    const queue = [...commit.children];
    const visited = new Set();
    
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      if (mainLine.has(current)) return true;
      const childCommit = this.commits.get(current);
      if (childCommit) {
        queue.push(...childCommit.children);
      }
    }
    return false;
  }

  _cleanupChildrenReferences(hash, mainLine) {
    const commit = this.commits.get(hash);
    if (!commit) return;
    
    commit.children = commit.children.filter(child => {
      return mainLine.has(child) || this._isReachableFromMain(child, mainLine);
    });
    
    for (const child of commit.children) {
      this._cleanupChildrenReferences(child, mainLine);
    }
  }
}

module.exports = { VersionManager, Commit };
