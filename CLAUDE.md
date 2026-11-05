# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No build, no deps, no package.json, no tests, no linter. README is in Spanish; UI strings are Spanish too.

## Run

Open `index.html` directly, or serve statically: `python -m http.server 8000` → http://localhost:8000.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, `game.js` (all logic, single global script, `'use strict'`).

- `game.js` uses module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`...) reset by `init()`. Restart button just calls `init()`.
- Board: `ROWS×COLS` matrix, `0` = empty, `1–7` = color/piece index into `COLORS`/`PIECES` (index 0 is `null`). Piece shapes embed their own color index as cell values.
- Loop: `requestAnimationFrame` → `loop(ts)` accumulates `dropAccum`, drops when `>= dropInterval`, then `draw()`. Pause/game over call `cancelAnimationFrame(animId)`; resume re-calls `loop` with fresh `lastTime`.
- Piece lifecycle: `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. `spawn()` calls `endGame()` if the new piece collides immediately.
- `clearLines()` owns level/`dropInterval` recalculation (`max(100, 1000-(level-1)*90)`, level = lines/10+1) and score (`LINE_SCORES[n] * level`). Soft drop +1/row, hard drop +2/row.
- Rotation: `rotateCW` + `tryRotate` with horizontal kicks `[0,-1,1,-2,2]` (no SRS, no floor kicks).
- Board canvas size is hardcoded in `index.html` (`300×600` = `COLS*BLOCK × ROWS*BLOCK`); changing `COLS`/`ROWS`/`BLOCK` in `game.js` requires updating the `<canvas id="board">` width/height. Next-piece canvas is 120×120 with a hardcoded 4×4 cell grid at 30px (`drawNext`).
