'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const THEMES = {
  dark:  { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#d8d8e4', highlight: 'rgba(255,255,255,0.35)' },
};

const THEME_KEY = 'tetris-theme';

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

let theme = 'dark';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0; // records: combo actual y máximo de la partida
let startScreenOpen = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = THEMES[theme].highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = THEMES[theme].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    hideGameOverRecords();
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  hideGameOverRecords();
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (startScreenOpen) return;
  if (e.target instanceof HTMLInputElement) return; // teclear nombre no afecta al juego
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function setTheme(name) {
  theme = name === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeBtn.setAttribute('aria-pressed', String(isLight));
  themeBtn.textContent = isLight ? '🌙 Modo oscuro' : '☀️ Modo claro';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignorar */ }
  // redibujar aunque el juego esté en pausa o terminado
  if (current && next) { draw(); drawNext(); }
}

themeBtn.addEventListener('click', () => {
  setTheme(theme === 'dark' ? 'light' : 'dark');
  themeBtn.blur(); // evita que Space/Enter vuelvan a activar el botón
});

// ---- Records ----
const RECORDS_KEY = 'tetris.records';
const MAX_SCORES = 5;
const NAME_MAX = 12;
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const startRecordsEl = document.getElementById('start-records');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const goRecordsEl = document.getElementById('gameover-records');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
let pendingEntry = null; // entrada del game over aún sin guardar

function loadRecords() {
  const rec = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const d = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (d && typeof d === 'object') {
      if (Array.isArray(d.scores)) {
        rec.scores = d.scores
          .filter(s => s && Number.isFinite(s.score))
          .map(s => ({
            name: String(s.name || 'Anónimo').slice(0, NAME_MAX),
            score: s.score, lines: Number(s.lines) || 0,
            level: Number(s.level) || 1, date: Number(s.date) || 0,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_SCORES);
      }
      rec.bestCombo = Number(d.bestCombo) || 0;
      rec.maxLines = Number(d.maxLines) || 0;
    }
  } catch (e) { /* datos corruptos o sin acceso: usar vacío */ }
  return rec;
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) { /* ignorar */ }
}

function qualifiesForTop(rec, s) {
  return s > 0 && (rec.scores.length < MAX_SCORES || s > rec.scores[rec.scores.length - 1].score);
}

// highlight: entrada (por date) a resaltar
function renderRecords(container, rec, highlightDate) {
  container.textContent = '';
  if (!rec.scores.length) {
    const p = document.createElement('p');
    p.className = 'records-empty';
    p.textContent = 'Sin récords todavía';
    container.appendChild(p);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    rec.scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (highlightDate && s.date === highlightDate) tr.className = 'highlight';
      [String(i + 1), s.name, s.score.toLocaleString(), `${s.lines} L`].forEach((t, k) => {
        const td = document.createElement('td');
        td.textContent = t;
        if (k === 2) td.className = 'num';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    container.appendChild(table);
  }
  const extra = document.createElement('p');
  extra.className = 'records-extra';
  extra.textContent = `Mejor combo: ${rec.bestCombo} · Líneas máx: ${rec.maxLines}`;
  container.appendChild(extra);
}

function showStartScreen() {
  cancelAnimationFrame(animId);
  startScreenOpen = true;
  renderRecords(startRecordsEl, loadRecords(), 0);
  startScreen.classList.remove('hidden');
  startBtn.focus();
}

function hideGameOverRecords() {
  pendingEntry = null;
  newRecordEl.classList.add('hidden');
  nameForm.classList.add('hidden');
  goRecordsEl.textContent = '';
}

function showGameOverRecords() {
  const rec = loadRecords();
  if (maxCombo > rec.bestCombo) rec.bestCombo = maxCombo;
  if (lines > rec.maxLines) rec.maxLines = lines;
  saveRecords(rec);
  if (qualifiesForTop(rec, score)) {
    pendingEntry = { score, lines, level };
    newRecordEl.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
  }
  renderRecords(goRecordsEl, rec, 0);
}

function submitName() {
  if (!pendingEntry) return;
  const rec = loadRecords();
  const entry = {
    name: nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo',
    score: pendingEntry.score, lines: pendingEntry.lines,
    level: pendingEntry.level, date: Date.now(),
  };
  rec.scores.push(entry);
  rec.scores.sort((a, b) => b.score - a.score);
  rec.scores = rec.scores.slice(0, MAX_SCORES);
  saveRecords(rec);
  pendingEntry = null;
  nameForm.classList.add('hidden');
  renderRecords(goRecordsEl, loadRecords(), entry.date);
  restartBtn.focus();
}

nameForm.addEventListener('submit', e => { e.preventDefault(); submitName(); });

startBtn.addEventListener('click', () => {
  startScreenOpen = false;
  startScreen.classList.add('hidden');
  startBtn.blur();
  init();
});

resetRecordsBtn.addEventListener('click', () => {
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignorar */ }
  renderRecords(startRecordsEl, loadRecords(), 0);
});

init();
showStartScreen();

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* ignorar */ }
setTheme(savedTheme);
