import {
  DEFAULT_STAGE_COLUMNS,
  DEFAULT_STAGE_ROWS,
  MIN_STAGE_SIZE,
  MAX_STAGE_SIZE,
  STAGE_STORAGE_VERSION,
} from "./config.js";

// ワールド生成直後から表示用座標が使えるよう、render座標も一緒に持たせる。
function withRenderPosition(entity) {
  return {
    ...entity,
    renderX: entity.x,
    renderY: entity.y,
    jumpVisual: entity.jumpVisual ?? 0,
  };
}

export function getStageStorageKey(stageId) {
  return `magnetGO:v${STAGE_STORAGE_VERSION}:stage:${stageId}`;
}

// width/height 未指定の古いステージ定義も吸収して扱う。
export function getStageDimensions(stage) {
  return {
    width: Math.max(1, stage.width ?? stage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS),
    height: Math.max(1, stage.height ?? stage.grid.length ?? DEFAULT_STAGE_ROWS),
  };
}

// 不揃いな文字列グリッドを、中央寄せされた矩形グリッドへ正規化する。
export function normalizeGrid(grid, targetWidth = DEFAULT_STAGE_COLUMNS, targetHeight = DEFAULT_STAGE_ROWS) {
  const rows = Array.isArray(grid) ? grid.map((row) => String(row ?? "").replaceAll("=", "#")) : [];
  const sourceWidth = rows.reduce((maxWidth, row) => Math.max(maxWidth, row.length), 0);
  const width = Math.max(targetWidth, 1);
  const height = Math.max(targetHeight, 1);
  const board = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));

  if (rows.length === 0 || sourceWidth === 0) {
    return board.map((row) => row.join(""));
  }

  const normalizedRows = rows.map((row) => row.padEnd(sourceWidth, ".").slice(0, sourceWidth));
  const copyWidth = Math.min(sourceWidth, width);
  const copyHeight = Math.min(normalizedRows.length, height);
  const offsetX = Math.max(0, Math.floor((width - copyWidth) / 2));
  const offsetY = Math.max(0, Math.floor((height - copyHeight) / 2));

  for (let y = 0; y < copyHeight; y += 1) {
    for (let x = 0; x < copyWidth; x += 1) {
      board[offsetY + y][offsetX + x] = normalizedRows[y][x];
    }
  }

  return board.map((row) => row.join(""));
}

// 元ステージとの互換性確認に使う署名を作る。
export function getStageBaseSignature(stage) {
  const { width, height } = getStageDimensions(stage);
  return JSON.stringify({
    id: stage.id,
    title: stage.title,
    goal: stage.goal,
    hint: stage.hint,
    width,
    height,
    grid: normalizeGrid(stage.grid, width, height),
  });
}

// ステージ定義を編集用の安全なコピーへ変換する。
export function cloneStage(stage) {
  const { width, height } = getStageDimensions(stage);
  return {
    id: stage.id,
    title: stage.title,
    goal: stage.goal,
    hint: stage.hint,
    width,
    height,
    grid: normalizeGrid(stage.grid, width, height),
  };
}

// localStorage 上の編集データを読み込み、元定義との不一致もここで弾く。
export function loadStoredStage(stage) {
  try {
    const raw = window.localStorage.getItem(getStageStorageKey(stage.id));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.grid) || parsed.grid.length === 0) {
      return null;
    }
    if (!parsed.baseSignature || parsed.baseSignature !== getStageBaseSignature(stage)) {
      window.localStorage.removeItem(getStageStorageKey(stage.id));
      return null;
    }
    return {
      id: parsed.id ?? stage.id,
      title: parsed.title ?? stage.title,
      goal: parsed.goal ?? stage.goal,
      hint: parsed.hint ?? stage.hint,
      width: parsed.width ?? getStageDimensions(stage).width,
      height: parsed.height ?? getStageDimensions(stage).height,
      grid: normalizeGrid(
        parsed.grid,
        parsed.width ?? getStageDimensions(stage).width,
        parsed.height ?? getStageDimensions(stage).height
      ),
    };
  } catch {
    return null;
  }
}

// 保存時は元ステージの署名も一緒に持たせて、将来の定義変更を検出できるようにする。
export function saveEditorStage(editorStage, baseStage) {
  window.localStorage.setItem(
    getStageStorageKey(editorStage.id),
    JSON.stringify({
      ...editorStage,
      baseSignature: getStageBaseSignature(baseStage),
    })
  );
}

// Play 開始に必要なオブジェクトがそろっているかを検証する。
export function validateStage(stage) {
  const counts = { P: 0, U: 0, G: 0 };
  stage.grid.forEach((row) => {
    row.split("").forEach((cell) => {
      if (cell in counts) {
        counts[cell] += 1;
      }
    });
  });

  const problems = [];
  if (counts.P !== 1) {
    problems.push("Player は1個必要");
  }
  if (counts.U !== 1) {
    problems.push("USB は1個必要");
  }
  if (counts.G !== 1) {
    problems.push("Goal は1個必要");
  }
  return problems;
}

// 編集画面では保存済み内容を優先し、プレイ専用画面では元の定義だけを使う。
export function resolveEditorStage(baseStage, isPlayerView) {
  if (isPlayerView) {
    return cloneStage(baseStage);
  }
  const storedStage = loadStoredStage(baseStage);
  const baseClone = cloneStage(baseStage);
  if (!storedStage) {
    return baseClone;
  }
  if (validateStage(storedStage).length > 0 && validateStage(baseClone).length === 0) {
    window.localStorage.removeItem(getStageStorageKey(baseStage.id));
    return baseClone;
  }
  return storedStage;
}

// グリッド文字列から、プレイヤー・頭・箱などの実体を持つ world を組み立てる。
export function createWorld(stage) {
  const boxes = [];
  let player = null;
  let head = null;
  let usb = null;
  let goal = null;

  stage.grid.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "P") {
        player = withRenderPosition({
          x,
          y,
          hasHead: true,
          magneticBody: false,
          carryingUsb: false,
          facing: "left",
          jumpVisual: 0,
          lastGroundedAt: 0,
          jumpQueuedUntil: 0,
        });
      }
      if (cell === "O") {
        head = withRenderPosition({ x, y, attached: false, hasUsb: false, facing: "left" });
      }
      if (cell === "B") {
        boxes.push(withRenderPosition({ x, y, type: "light", attached: false }));
      }
      if (cell === "H") {
        boxes.push(withRenderPosition({ x, y, type: "heavy", attached: false }));
      }
      if (cell === "U") {
        usb = { x, y, collected: false };
      }
      if (cell === "G") {
        goal = { x, y };
      }
    });
  });

  if (!player) {
    player = withRenderPosition({
      x: 1,
      y: 1,
      hasHead: true,
      magneticBody: false,
      carryingUsb: false,
      facing: "left",
      jumpVisual: 0,
      lastGroundedAt: 0,
      jumpQueuedUntil: 0,
    });
  }

  const resolvedHead =
    head ?? withRenderPosition({ x: player.x, y: player.y, attached: true, hasUsb: false, facing: player.facing });

  return {
    stage,
    width: stage.width ?? stage.grid[0].length,
    height: stage.height ?? stage.grid.length,
    player,
    head: resolvedHead,
    boxes,
    usb,
    goal,
    cleared: false,
    gameOver: false,
    message: "頭を使って箱をどかそう。",
  };
}

export function clampStageSize(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(MIN_STAGE_SIZE, Math.min(MAX_STAGE_SIZE, parsed));
}

export function resizeGrid(grid, targetWidth, targetHeight) {
  const sourceWidth = targetWidth ?? grid[0]?.length ?? DEFAULT_STAGE_COLUMNS;
  const sourceHeight = targetHeight ?? grid.length ?? DEFAULT_STAGE_ROWS;
  const normalized = normalizeGrid(grid, sourceWidth, sourceHeight);
  const width = clampStageSize(targetWidth, sourceWidth);
  const height = clampStageSize(targetHeight, sourceHeight);
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => normalized[y]?.[x] ?? ".").join("")
  );
}
