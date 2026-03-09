import { stageDefinitions } from "../stages/index.js";

const TILE = 64;
const MIN_TILE = 18;
const DISPLAY_TILE = 96;
const DEFAULT_STAGE_COLUMNS = 20;
const DEFAULT_STAGE_ROWS = 20;
const MIN_STAGE_SIZE = 6;
const MAX_STAGE_SIZE = 40;
const STAGE_STORAGE_VERSION = 2;
const MAGNET_INTERVAL = 500;
const GRAVITY_INTERVAL = 180;
const JUMP_BUFFER_MS = 140;
const COYOTE_TIME_MS = 120;

const assetUrls = {
  robotHeadLeft: new URL("../assets/robot-head-left.PNG", import.meta.url).href,
  robotHeadRight: new URL("../assets/robot-head-right.PNG", import.meta.url).href,
  robotBody: new URL("../assets/robot-body-left.png", import.meta.url).href,
  robotBodyMagnetic: new URL("../assets/robot-body-magnetic.svg", import.meta.url).href,
  boxLight: new URL("../assets/box-light.PNG", import.meta.url).href,
  boxLightAttached: new URL("../assets/box-light-attached.svg", import.meta.url).href,
  usb: new URL("../assets/usb.svg", import.meta.url).href,
  usbPlug: new URL("../assets/usb-plug.svg", import.meta.url).href,
  goal: new URL("../assets/Goal.PNG", import.meta.url).href,
  wallFill: new URL("../assets/wall-fill.svg", import.meta.url).href,
  wallEdgeTop: new URL("../assets/wall-edge-top.svg", import.meta.url).href,
  wallEdgeBottom: new URL("../assets/wall-edge-bottom.svg", import.meta.url).href,
  wallEdgeLeft: new URL("../assets/wall-edge-left.svg", import.meta.url).href,
  wallEdgeRight: new URL("../assets/wall-edge-right.svg", import.meta.url).href,
  wallCornerTl: new URL("../assets/wall-corner-tl.svg", import.meta.url).href,
  wallCornerTr: new URL("../assets/wall-corner-tr.svg", import.meta.url).href,
  wallCornerBr: new URL("../assets/wall-corner-br.svg", import.meta.url).href,
  wallCornerBl: new URL("../assets/wall-corner-bl.svg", import.meta.url).href,
  sceneLeft: new URL("../assets/scene-left.svg", import.meta.url).href,
  sceneRight: new URL("../assets/scene-right.svg", import.meta.url).href,
};

const assets = createAssetImages(assetUrls);

const paletteItems = [
  { key: ".", label: "Empty" },
  { key: "#", label: "Wall" },
  { key: "P", label: "Player" },
  { key: "O", label: "Head" },
  { key: "B", label: "Box" },
  { key: "H", label: "Heavy Box" },
  { key: "U", label: "USB" },
  { key: "G", label: "Goal" },
  { key: "r", label: "Red Button" },
  { key: "R", label: "Red Shutter" },
  { key: "c", label: "Cyan Button" },
  { key: "C", label: "Cyan Shutter" },
];

const singletonTiles = new Set(["P", "O", "U", "G"]);
const shutterGroups = {
  red: {
    button: "r",
    shutter: "R",
    accent: "#e07a86",
    accentDark: "#8b4151",
  },
  cyan: {
    button: "c",
    shutter: "C",
    accent: "#78d4e0",
    accentDark: "#3d7f8a",
  },
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const appLayout = document.getElementById("appLayout");
const clearOverlay = document.getElementById("clearOverlay");
const overlayNextStageButton = document.getElementById("overlayNextStageButton");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const overlayResetButton = document.getElementById("overlayResetButton");
const playSideActions = document.getElementById("playSideActions");
const playResetButton = document.getElementById("playResetButton");
const stageTitle = document.getElementById("stageTitle");
const stageGoal = document.getElementById("stageGoal");
const stageHint = document.getElementById("stageHint");
const statusCard = document.getElementById("statusCard");
const resetButton = document.getElementById("resetButton");
const stageButtons = document.getElementById("stageButtons");
const nextStageButton = document.getElementById("nextStageButton");
const editModeButton = document.getElementById("editModeButton");
const playModeButton = document.getElementById("playModeButton");
const paletteButtons = document.getElementById("paletteButtons");
const exportButton = document.getElementById("exportButton");
const exportOutput = document.getElementById("exportOutput");
const restoreButton = document.getElementById("restoreButton");
const mapWidthInput = document.getElementById("mapWidthInput");
const mapHeightInput = document.getElementById("mapHeightInput");
const applyMapSizeButton = document.getElementById("applyMapSizeButton");

const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  attract: false,
  repel: false,
};

const moveQueue = [];

let stageIndex = 0;
let mode = "edit";
let selectedPalette = "#";
let isPainting = false;
let editorStage = resolveEditorStage(stageDefinitions[stageIndex]);
let world = createWorld(editorStage);
let lastMagnetTick = 0;
let lastGravityTick = 0;
let sceneTime = 0;
let editorMessage = "Editモードです。左クリックで配置、ドラッグで連続配置。";
let renderFailure = null;

function formatErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message ?? String(error);
}

function reportRenderFailure(error) {
  const message = formatErrorMessage(error);
  renderFailure = message;
  world.message = `描画エラー: ${message}`;
  console.error(error);
}

function clearRenderFailure() {
  renderFailure = null;
}

function withRenderPosition(entity) {
  return {
    ...entity,
    renderX: entity.x,
    renderY: entity.y,
    jumpVisual: entity.jumpVisual ?? 0,
  };
}

function createAssetImages(manifest) {
  return Object.fromEntries(
    Object.entries(manifest).map(([name, url]) => {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      return [name, image];
    })
  );
}

function drawAsset(name, x, y, width, height, alpha = 1) {
  const image = assets[name];
  if (!image || !image.complete || image.naturalWidth === 0) {
    return false;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
  return true;
}

function getStageStorageKey(stageId) {
  return `magnetGO:v${STAGE_STORAGE_VERSION}:stage:${stageId}`;
}

function getStageDimensions(stage) {
  return {
    width: Math.max(1, stage.width ?? stage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS),
    height: Math.max(1, stage.height ?? stage.grid.length ?? DEFAULT_STAGE_ROWS),
  };
}

function getStageBaseSignature(stage) {
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

function loadStoredStage(stage) {
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

function saveEditorStage() {
  const baseStage = stageDefinitions[stageIndex];
  window.localStorage.setItem(
    getStageStorageKey(editorStage.id),
    JSON.stringify({
      ...editorStage,
      baseSignature: getStageBaseSignature(baseStage),
    })
  );
}

function resizeCanvasForGrid(grid) {
  const columns = grid[0]?.length ?? DEFAULT_STAGE_COLUMNS;
  const rows = grid.length ?? DEFAULT_STAGE_ROWS;
  const paddedWidth = window.innerWidth < 860 ? 72 : 112;
  const paddedHeight = window.innerWidth < 860 ? 120 : 144;
  const targetTile = Math.max(MIN_TILE, Math.min(DISPLAY_TILE, Math.floor(1152 / Math.max(columns, rows))));
  canvas.width = Math.max(720, columns * targetTile + paddedWidth * 2);
  canvas.height = Math.max(720, rows * targetTile + paddedHeight * 2);
}

function restoreBaseStage() {
  const baseStage = stageDefinitions[stageIndex];
  window.localStorage.removeItem(getStageStorageKey(baseStage.id));
  editorStage = cloneStage(baseStage);
  resizeCanvasForGrid(editorStage.grid);
  resetWorld();
  setMode("edit");
  syncMapSizeControls();
  editorMessage = "元のステージ定義に戻しました。";
  refreshExport();
}

function cloneStage(stage) {
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

function normalizeGrid(grid, targetWidth = DEFAULT_STAGE_COLUMNS, targetHeight = DEFAULT_STAGE_ROWS) {
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

function loadStage(index) {
  stageIndex = index;
  const baseStage = stageDefinitions[index];
  editorStage = resolveEditorStage(baseStage);
  resizeCanvasForGrid(editorStage.grid);
  resetWorld();
  setMode("edit");
  editorMessage = `${editorStage.title} を読み込みました。`;
  renderStageButtons();
  syncMapSizeControls();
  refreshExport();
}

function resolveEditorStage(baseStage) {
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

function createWorld(stage) {
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

  const resolvedHead = head ?? withRenderPosition({ x: player.x, y: player.y, attached: true, hasUsb: false, facing: player.facing });

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

function validateStage(stage) {
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

function resetWorld() {
  world = createWorld(editorStage);
  syncRenderPositions();
  lastMagnetTick = 0;
  lastGravityTick = 0;
  clearRenderFailure();
}

function setMode(nextMode) {
  mode = nextMode;
  appLayout.classList.toggle("is-edit", mode === "edit");
  editModeButton.classList.toggle("is-active", mode === "edit");
  playModeButton.classList.toggle("is-active", mode === "play");
  playSideActions.classList.toggle("is-visible", mode === "play");
  playSideActions.setAttribute("aria-hidden", mode === "play" ? "false" : "true");
  clearOverlay.classList.toggle("is-visible", mode === "play" && world.cleared);
  clearOverlay.setAttribute("aria-hidden", mode === "play" && world.cleared ? "false" : "true");
  gameOverOverlay.classList.toggle("is-visible", mode === "play" && world.gameOver);
  gameOverOverlay.setAttribute("aria-hidden", mode === "play" && world.gameOver ? "false" : "true");
  nextStageButton.disabled = mode !== "play" || !world.cleared || world.gameOver || stageIndex >= stageDefinitions.length - 1;
}

function renderStageButtons() {
  stageButtons.innerHTML = "";
  stageDefinitions.forEach((stage, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `stage-button${index === stageIndex ? " is-active" : ""}`;
    button.textContent = `${index + 1}. ${stage.title}`;
    button.addEventListener("click", () => loadStage(index));
    stageButtons.appendChild(button);
  });
}

function renderPaletteButtons() {
  paletteButtons.innerHTML = "";
  paletteItems.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `palette-button${item.key === selectedPalette ? " is-active" : ""}`;
    button.textContent = item.label;
    button.addEventListener("click", () => {
      selectedPalette = item.key;
      renderPaletteButtons();
    });
    paletteButtons.appendChild(button);
  });
}

function getShutterGroupByTile(tile) {
  return Object.values(shutterGroups).find((group) => group.button === tile || group.shutter === tile) ?? null;
}

function isButtonTile(tile) {
  return Object.values(shutterGroups).some((group) => group.button === tile);
}

function isShutterTile(tile) {
  return Object.values(shutterGroups).some((group) => group.shutter === tile);
}

function isShutterPressed(group) {
  return (
    world.stage.grid.some((row, y) =>
      row.split("").some((cell, x) => {
        if (cell !== group.button) {
          return false;
        }
        return (
          world.player.x === x && world.player.y === y ||
          world.boxes.some((box) => box.x === x && box.y === y) ||
          (!world.player.hasHead && world.head.x === x && world.head.y === y)
        );
      })
    )
  );
}

function isShutterOpenAt(x, y) {
  const tile = getTile(x, y);
  const group = getShutterGroupByTile(tile);
  if (!group || tile !== group.shutter || mode !== "play") {
    return false;
  }
  return isShutterPressed(group);
}

function triggerGameOver(message = "シャッターに挟まれた。") {
  world.gameOver = true;
  world.message = message;
}

function checkShutterCrush() {
  if (mode !== "play" || world.cleared || world.gameOver) {
    return;
  }

  for (let y = 0; y < world.stage.grid.length; y += 1) {
    for (let x = 0; x < world.stage.grid[y].length; x += 1) {
      const tile = world.stage.grid[y][x];
      if (!isShutterTile(tile) || isShutterOpenAt(x, y)) {
        continue;
      }
      const playerCaught = world.player.x === x && world.player.y === y;
      const headCaught = !world.player.hasHead && world.head.x === x && world.head.y === y;
      if (playerCaught || headCaught) {
        triggerGameOver();
        return;
      }
    }
  }
}

function syncMapSizeControls() {
  mapWidthInput.value = String(editorStage.width ?? editorStage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS);
  mapHeightInput.value = String(editorStage.height ?? editorStage.grid.length ?? DEFAULT_STAGE_ROWS);
}

function clampStageSize(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(MIN_STAGE_SIZE, Math.min(MAX_STAGE_SIZE, parsed));
}

function resizeGrid(grid, targetWidth, targetHeight) {
  const sourceWidth = targetWidth ?? grid[0]?.length ?? DEFAULT_STAGE_COLUMNS;
  const sourceHeight = targetHeight ?? grid.length ?? DEFAULT_STAGE_ROWS;
  const normalized = normalizeGrid(grid, sourceWidth, sourceHeight);
  const width = clampStageSize(targetWidth, sourceWidth);
  const height = clampStageSize(targetHeight, sourceHeight);
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => normalized[y]?.[x] ?? ".").join("")
  );
}

function applyMapSize() {
  const width = clampStageSize(mapWidthInput.value, editorStage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS);
  const height = clampStageSize(mapHeightInput.value, editorStage.grid.length ?? DEFAULT_STAGE_ROWS);
  editorStage.width = width;
  editorStage.height = height;
  editorStage.grid = resizeGrid(editorStage.grid, width, height);
  resizeCanvasForGrid(editorStage.grid);
  syncMapSizeControls();
  saveEditorStage();
  resetWorld();
  editorMessage = `マップサイズを ${width} x ${height} に変更。`;
  refreshExport();
}

function getTile(x, y) {
  if (y < 0 || y >= world.height || x < 0 || x >= world.width) {
    return "#";
  }
  return world.stage.grid[y][x];
}

function isSolidTile(x, y) {
  const tile = getTile(x, y);
  return tile === "#" || (isShutterTile(tile) && !isShutterOpenAt(x, y));
}

function getBoxAt(x, y) {
  return world.boxes.find((box) => box.x === x && box.y === y);
}

function canDetachedHeadMoveTo(x, y) {
  if (isSolidTile(x, y)) {
    return false;
  }
  if (world.boxes.some((box) => box.x === x && box.y === y)) {
    return false;
  }
  if (world.player.x === x && world.player.y === y) {
    return false;
  }
  return true;
}

function hasMetalBoxAt(x, y) {
  return world.boxes.some((box) => box.x === x && box.y === y);
}

function hasRepelJumpBooster() {
  return keys.repel && hasMetalBoxAt(world.player.x, world.player.y + 1);
}

function hasAttractJumpBooster() {
  return keys.attract && hasMetalBoxAt(world.player.x, world.player.y - 2);
}

function isGrounded(entity) {
  const belowY = entity.y + 1;
  if (isSolidTile(entity.x, belowY)) {
    return true;
  }
  if (world.boxes.some((box) => box !== entity && box.x === entity.x && box.y === belowY)) {
    return true;
  }
  if (!world.player.hasHead && entity !== world.head && world.head.x === entity.x && world.head.y === belowY) {
    return true;
  }
  if (entity !== world.player && world.player.x === entity.x && world.player.y === belowY) {
    return true;
  }
  return false;
}

function syncRenderPositions() {
  world.player.renderX = world.player.x;
  world.player.renderY = world.player.y;
  world.player.jumpVisual = 0;
  world.player.lastGroundedAt = 0;
  world.player.jumpQueuedUntil = 0;
  world.head.renderX = world.head.x;
  world.head.renderY = world.head.y;
  world.boxes.forEach((box) => {
    box.renderX = box.x;
    box.renderY = box.y;
  });
}

function updateRenderPositions() {
  const easing = 0.32;
  const snapThreshold = 0.01;
  [world.player, world.head, ...world.boxes].forEach((entity) => {
    entity.renderX += (entity.x - entity.renderX) * easing;
    entity.renderY += (entity.y - entity.renderY) * easing;
    if (Math.abs(entity.x - entity.renderX) < snapThreshold) {
      entity.renderX = entity.x;
    }
    if (Math.abs(entity.y - entity.renderY) < snapThreshold) {
      entity.renderY = entity.y;
    }
  });
  if (world.player.jumpVisual > 0) {
    world.player.jumpVisual = Math.max(0, world.player.jumpVisual - 0.055);
  }
}

function hasDetachedHeadAt(x, y, ignoreHead = false) {
  return !ignoreHead && !world.player.hasHead && world.head.x === x && world.head.y === y;
}

function hasPlayerAt(x, y, ignorePlayer = false) {
  return !ignorePlayer && world.player.x === x && world.player.y === y;
}

function getHeadPosition() {
  if (world.player.hasHead) {
    return { x: world.player.x, y: world.player.y };
  }
  return { x: world.head.x, y: world.head.y };
}

function isOccupied(x, y, ignoreBox = null) {
  if (isSolidTile(x, y)) {
    return true;
  }
  const box = getBoxAt(x, y);
  if (box && box !== ignoreBox) {
    return true;
  }
  if (hasDetachedHeadAt(x, y)) {
    return true;
  }
  if (hasPlayerAt(x, y)) {
    return true;
  }
  return false;
}

function tryMovePlayer(dx, dy) {
  if (world.cleared || world.gameOver || mode !== "play") {
    return;
  }

  const targetX = world.player.x + dx;
  const targetY = world.player.y + dy;

  const targetBox = getBoxAt(targetX, targetY);
  if (isSolidTile(targetX, targetY) || targetBox) {
    if (tryStepUp(dx, dy, targetBox)) {
      return;
    }
  }

  if (isSolidTile(targetX, targetY)) {
    return;
  }

  if (targetBox) {
    if (targetBox.type === "heavy") {
      return;
    }
    const pushX = targetBox.x + dx;
    const pushY = targetBox.y + dy;
    if (isOccupied(pushX, pushY, targetBox)) {
      return;
    }
    targetBox.x = pushX;
    targetBox.y = pushY;
  }

  if (!world.player.hasHead && world.head.x === targetX && world.head.y === targetY) {
    world.player.hasHead = true;
    world.head.attached = true;
    world.message = "頭を回収した。";
  }

  world.player.x = targetX;
  world.player.y = targetY;

  collectUsbIfPossible();
  tryInsertUsb();
  checkClear();
  checkShutterCrush();
}

function tryStepUp(dx, dy, blockingBox = null) {
  if (dy !== 0 || !isGrounded(world.player)) {
    return false;
  }

  const targetX = world.player.x + dx;
  const climbY = world.player.y - 1;
  if (climbY < 0) {
    return false;
  }

  if (isSolidTile(world.player.x, climbY) || hasDetachedHeadAt(world.player.x, climbY) || getBoxAt(world.player.x, climbY)) {
    return false;
  }
  if (isSolidTile(targetX, climbY) || hasDetachedHeadAt(targetX, climbY)) {
    return false;
  }

  const boxAbove = getBoxAt(targetX, climbY);
  if (boxAbove || (blockingBox && blockingBox.type === "heavy")) {
    return false;
  }

  world.player.x = targetX;
  world.player.y = climbY;
  world.player.jumpVisual = 0.32;
  world.player.lastGroundedAt = 0;
  collectUsbIfPossible();
  tryInsertUsb();
  checkClear();
  checkShutterCrush();
  return true;
}

function canPlayerJump(timestamp) {
  return isGrounded(world.player) || timestamp <= world.player.lastGroundedAt + COYOTE_TIME_MS;
}

function tryJumpPlayer(timestamp) {
  if (world.cleared || world.gameOver || mode !== "play") {
    return;
  }
  if (!canPlayerJump(timestamp)) {
    return;
  }

  const boosted = hasRepelJumpBooster() || hasAttractJumpBooster();
  const targetHeight = boosted ? 2 : 1;
  const path = Array.from({ length: targetHeight }, (_, index) => world.player.y - (index + 1));
  if (path.some((targetY) => isOccupied(world.player.x, targetY))) {
    if (boosted) {
      const normalTargetY = world.player.y - 1;
      if (isOccupied(world.player.x, normalTargetY)) {
        return;
      }
      world.player.y = normalTargetY;
      world.player.jumpVisual = 0.5;
      world.player.lastGroundedAt = 0;
      world.player.jumpQueuedUntil = 0;
      collectUsbIfPossible();
      tryInsertUsb();
      checkClear();
      checkShutterCrush();
    }
    return;
  }

  world.player.y -= targetHeight;
  world.player.jumpVisual = boosted ? 1 : 0.5;
  world.player.lastGroundedAt = 0;
  world.player.jumpQueuedUntil = 0;
  collectUsbIfPossible();
  tryInsertUsb();
  checkClear();
  checkShutterCrush();
}

function collectUsbIfPossible() {
  if (world.usb && !world.usb.collected && world.player.x === world.usb.x && world.player.y === world.usb.y) {
    world.usb.collected = true;
    world.player.carryingUsb = true;
    world.message = "USBメモリを回収した。頭に戻そう。";
  }
}

function tryInsertUsb() {
  if (!world.player.carryingUsb) {
    return;
  }

  const headPosition = getHeadPosition();
  const distance = Math.abs(world.player.x - headPosition.x) + Math.abs(world.player.y - headPosition.y);

  if (distance <= 1) {
    world.player.carryingUsb = false;
    world.head.hasUsb = true;
    world.message = "USBメモリを頭に挿した。出口へ。";
  }
}

function checkClear() {
  if (
    world.goal &&
    world.player.x === world.goal.x &&
    world.player.y === world.goal.y &&
    world.head.hasUsb &&
    world.player.hasHead
  ) {
    world.cleared = true;
    world.message = "ステージクリア。";
  }
}

function toggleHead() {
  if (world.cleared || world.gameOver || mode !== "play") {
    return;
  }

  if (world.player.hasHead) {
    world.player.hasHead = false;
    world.head.attached = false;
    world.head.x = world.player.x;
    world.head.y = world.player.y;
    world.head.facing = world.player.facing;
    world.message = "頭を置いた。";
    checkShutterCrush();
    return;
  }

  const distance = Math.abs(world.player.x - world.head.x) + Math.abs(world.player.y - world.head.y);
  if (distance === 0) {
    world.player.hasHead = true;
    world.head.attached = true;
    world.head.facing = world.player.facing;
    world.message = "頭を装着した。";
    checkShutterCrush();
    return;
  }

  world.message = "頭の場所まで戻る必要がある。";
}

function applyMagnet(modeName) {
  if (world.cleared || world.gameOver || mode !== "play") {
    return;
  }

  const headPos = getHeadPosition();
  let movedSomething = false;
  let movedPlayerByHeavyBox = false;
  const nearestHeavyBox = world.boxes
    .filter((box) => box.type === "heavy")
    .map((box) => ({
      box,
      dx: headPos.x - box.x,
      dy: headPos.y - box.y,
      distance: Math.abs(headPos.x - box.x) + Math.abs(headPos.y - box.y),
    }))
    .filter(({ distance }) => distance > 0 && distance <= 3)
    .sort((a, b) => a.distance - b.distance)[0]?.box ?? null;

  world.boxes.forEach((box) => {
    const dx = headPos.x - box.x;
    const dy = headPos.y - box.y;
    const distance = Math.abs(dx) + Math.abs(dy);

    if (distance === 0 || distance > 3) {
      box.attached = false;
      return;
    }

    if (box.type === "heavy") {
      box.attached = false;
      if (box !== nearestHeavyBox) {
        return;
      }
      const step = getMagnetStep(dx, dy, modeName);
      if (!step) {
        return;
      }
      const robotStep = modeName === "attract" ? { dx: -step.dx, dy: -step.dy } : { dx: step.dx, dy: step.dy };
      const magnetEntity = world.player.hasHead ? world.player : world.head;
      const targetX = magnetEntity.x + robotStep.dx;
      const targetY = magnetEntity.y + robotStep.dy;
      const canMove =
        magnetEntity === world.player
          ? !isOccupied(targetX, targetY)
          : canDetachedHeadMoveTo(targetX, targetY);
      if (canMove) {
        magnetEntity.x = targetX;
        magnetEntity.y = targetY;
        movedPlayerByHeavyBox = magnetEntity === world.player;
        movedSomething = true;
        if (magnetEntity === world.player) {
          collectUsbIfPossible();
          tryInsertUsb();
          checkClear();
        }
      }
      return;
    }

    if (distance === 1 && modeName === "attract") {
      box.attached = true;
      movedSomething = true;
      return;
    }

    box.attached = false;
    const step = getMagnetStep(dx, dy, modeName);
    if (!step) {
      return;
    }

    const nextX = box.x + step.dx;
    const nextY = box.y + step.dy;
    if (isOccupied(nextX, nextY, box)) {
      return;
    }

    box.x = nextX;
    box.y = nextY;
    movedSomething = true;
  });

  if (!world.player.hasHead) {
    const nearestMetal = world.boxes
      .map((box) => ({
        box,
        dx: box.x - world.head.x,
        dy: box.y - world.head.y,
        distance: Math.abs(box.x - world.head.x) + Math.abs(box.y - world.head.y),
      }))
      .filter(({ distance }) => distance > 0 && distance <= 3)
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearestMetal) {
      const step = getMagnetStep(nearestMetal.dx, nearestMetal.dy, modeName);
      if (step) {
        const targetX = world.head.x + step.dx;
        const targetY = world.head.y + step.dy;
        if (canDetachedHeadMoveTo(targetX, targetY)) {
          world.head.x = targetX;
          world.head.y = targetY;
          movedSomething = true;
        }
      }
    }
  }

  if (movedSomething) {
    world.message = movedPlayerByHeavyBox
      ? modeName === "attract"
        ? "重い鉄箱に引かれてロボが動いた。"
        : "重い鉄箱を押してロボが動いた。"
      : modeName === "attract"
        ? "引力を発生させた。"
        : "斥力を発生させた。";
  }
  checkShutterCrush();
}

function applyGravity() {
  const movers = [
    ...world.boxes.map((box) => ({ kind: "box", entity: box })),
    ...(!world.player.hasHead ? [{ kind: "head", entity: world.head }] : []),
    { kind: "player", entity: world.player },
  ].sort((a, b) => b.entity.y - a.entity.y);

  let moved = false;

  movers.forEach(({ kind, entity }) => {
    const nextY = entity.y + 1;
    const blockedByTile = isSolidTile(entity.x, nextY);
    const blockedByBox = world.boxes.some((box) => box !== entity && box.x === entity.x && box.y === nextY);
    const blockedByHead = kind !== "head" && hasDetachedHeadAt(entity.x, nextY, entity === world.head);
    const blockedByPlayer = kind !== "player" && hasPlayerAt(entity.x, nextY, entity === world.player);

    if (blockedByTile || blockedByBox || blockedByHead || blockedByPlayer) {
      return;
    }

    entity.y = nextY;
    moved = true;
  });

  if (moved) {
    collectUsbIfPossible();
    tryInsertUsb();
    checkClear();
    checkShutterCrush();
  }
}

function getMagnetStep(dx, dy, modeName) {
  const primaryAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  let stepDx = 0;
  let stepDy = 0;

  if (primaryAxis === "x") {
    stepDx = Math.sign(dx);
  } else {
    stepDy = Math.sign(dy);
  }

  if (modeName === "repel") {
    stepDx *= -1;
    stepDy *= -1;
  }

  if (stepDx === 0 && stepDy === 0) {
    return null;
  }
  return { dx: stepDx, dy: stepDy };
}

function queueMove(key) {
  moveQueue.push(key);
}

function processInput() {
  if (mode !== "play" || world.gameOver) {
    moveQueue.length = 0;
    return;
  }

  const next = moveQueue.shift();
  if (!next) {
    if (world.player.jumpQueuedUntil > 0 && sceneTime <= world.player.jumpQueuedUntil && canPlayerJump(sceneTime)) {
      tryJumpPlayer(sceneTime);
    }
    return;
  }

  if (next === "up") {
    world.player.jumpQueuedUntil = sceneTime + JUMP_BUFFER_MS;
    tryJumpPlayer(sceneTime);
  }
  if (next === "down") {
    tryMovePlayer(0, 1);
  }
  if (next === "left") {
    world.player.facing = "left";
    if (world.player.hasHead) {
      world.head.facing = "left";
    }
    tryMovePlayer(-1, 0);
  }
  if (next === "right") {
    world.player.facing = "right";
    if (world.player.hasHead) {
      world.head.facing = "right";
    }
    tryMovePlayer(1, 0);
  }
}

function update(timestamp) {
  if (renderFailure) {
    drawErrorState();
    requestAnimationFrame(update);
    return;
  }

  sceneTime = timestamp;
  if (isGrounded(world.player)) {
    world.player.lastGroundedAt = timestamp;
  }
  if (world.player.jumpQueuedUntil > 0 && timestamp > world.player.jumpQueuedUntil) {
    world.player.jumpQueuedUntil = 0;
  }
  processInput();

  if (mode === "play" && timestamp - lastGravityTick >= GRAVITY_INTERVAL) {
    applyGravity();
    lastGravityTick = timestamp;
  }

  if (mode === "play" && keys.attract && timestamp - lastMagnetTick >= MAGNET_INTERVAL) {
    applyMagnet("attract");
    lastMagnetTick = timestamp;
  }

  if (mode === "play" && keys.repel && timestamp - lastMagnetTick >= MAGNET_INTERVAL) {
    applyMagnet("repel");
    lastMagnetTick = timestamp;
  }

  try {
    updateRenderPositions();
    draw();
  } catch (error) {
    reportRenderFailure(error);
    drawErrorState();
  }
  requestAnimationFrame(update);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode === "edit") {
    drawEditor();
  } else {
    drawPlayWorld();
  }
  updateHud();
}

function drawErrorState() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#1b1928");
  gradient.addColorStop(1, "#13111d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  fillRoundedRect(canvas.width / 2 - 220, canvas.height / 2 - 92, 440, 184, 14, "rgba(47, 43, 68, 0.96)");
  strokeRoundedRect(canvas.width / 2 - 220, canvas.height / 2 - 92, 440, 184, 14, "rgba(214, 202, 244, 0.16)", 2);

  ctx.fillStyle = "#f0eaff";
  ctx.font = 'bold 28px "Iosevka", "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText("Render Error", canvas.width / 2, canvas.height / 2 - 26);
  ctx.font = '14px "Iosevka", "IBM Plex Mono", monospace';
  ctx.fillStyle = "rgba(233, 226, 247, 0.84)";
  ctx.fillText(renderFailure ?? "Unknown error", canvas.width / 2, canvas.height / 2 + 8);
  ctx.fillText("Reset か Restore Base を試してください。", canvas.width / 2, canvas.height / 2 + 36);
  ctx.textAlign = "start";
  updateHud();
}

function drawPlayWorld() {
  const metrics = getBoardMetrics(world.stage.grid);
  drawSceneBackdrop(metrics);
  drawBoardFromGrid(world.stage.grid, metrics);
  if (world.goal) {
    drawGoalAt(world.goal.x, world.goal.y, metrics);
  }
  if (world.usb && !world.usb.collected) {
    drawUsbAt(world.usb.x, world.usb.y, metrics);
  }
  world.boxes.forEach((box) => drawBoxAt(box.renderX, box.renderY, box.attached, metrics, box.type));
  drawHeadRadius(metrics);
  drawPlayerAt(world.player.renderX, world.player.renderY, world.player.hasHead, world.player.magneticBody, world.head.hasUsb, metrics);
  if (!world.player.hasHead) {
    drawHeadAtGrid(world.head.renderX, world.head.renderY, true, world.head.hasUsb, metrics);
  }
}

function drawEditor() {
  const metrics = getBoardMetrics(editorStage.grid);
  drawSceneBackdrop(metrics);
  drawBoardFromGrid(editorStage.grid, metrics);
  editorStage.grid.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "P") {
        drawPlayerAt(x, y, true, false, false, metrics);
      }
      if (cell === "O") {
        drawHeadAtGrid(x, y, true, false, metrics);
      }
      if (cell === "B") {
        drawBoxAt(x, y, false, metrics, "light");
      }
      if (cell === "H") {
        drawBoxAt(x, y, false, metrics, "heavy");
      }
      if (cell === "U") {
        drawUsbAt(x, y, metrics);
      }
      if (cell === "G") {
        drawGoalAt(x, y, metrics);
      }
    });
  });
  drawEditorCursorHint(metrics);
}

function getBoardMetrics(grid) {
  const columns = grid[0].length;
  const rows = grid.length;
  const availableWidth = canvas.width - 140;
  const availableHeight = canvas.height - 140;
  const tileSize = Math.max(MIN_TILE, Math.min(TILE, Math.floor(Math.min(availableWidth / columns, availableHeight / rows))));
  const width = columns * tileSize;
  const height = rows * tileSize;
  return {
    width,
    height,
    tileSize,
    offsetX: Math.round((canvas.width - width) / 2),
    offsetY: Math.round((canvas.height - height) / 2),
  };
}

function getTilePixel(gridX, gridY, metrics) {
  return {
    x: metrics.offsetX + gridX * metrics.tileSize,
    y: metrics.offsetY + gridY * metrics.tileSize,
  };
}

function roundedRectPath(x, y, width, height, radius) {
  const r = normalizeRadii(radius, width, height);
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + width - r.tr, y);
  if (r.tr > 0) {
    ctx.quadraticCurveTo(x + width, y, x + width, y + r.tr);
  } else {
    ctx.lineTo(x + width, y);
  }
  ctx.lineTo(x + width, y + height - r.br);
  if (r.br > 0) {
    ctx.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
  } else {
    ctx.lineTo(x + width, y + height);
  }
  ctx.lineTo(x + r.bl, y + height);
  if (r.bl > 0) {
    ctx.quadraticCurveTo(x, y + height, x, y + height - r.bl);
  } else {
    ctx.lineTo(x, y + height);
  }
  ctx.lineTo(x, y + r.tl);
  if (r.tl > 0) {
    ctx.quadraticCurveTo(x, y, x + r.tl, y);
  } else {
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function normalizeRadii(radius, width, height) {
  if (typeof radius === "number") {
    const clamped = Math.min(radius, width / 2, height / 2);
    return { tl: clamped, tr: clamped, br: clamped, bl: clamped };
  }
  return {
    tl: Math.min(radius.tl ?? 0, width / 2, height / 2),
    tr: Math.min(radius.tr ?? 0, width / 2, height / 2),
    br: Math.min(radius.br ?? 0, width / 2, height / 2),
    bl: Math.min(radius.bl ?? 0, width / 2, height / 2),
  };
}

function fillRoundedRect(x, y, width, height, radius, color) {
  roundedRectPath(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(x, y, width, height, radius, color, lineWidth = 2) {
  roundedRectPath(x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function pointHash(x, y, seed = 0) {
  const value = ((x + 17) * 73 + (y + 29) * 151 + seed * 199) % 1000;
  return value / 1000;
}

function drawFloorTile(gridX, gridY, metrics) {
  const { x, y } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  const variant = (gridX + gridY) % 2;
  const base = variant === 0 ? "#2d3046" : "#30344d";
  const panel = variant === 0 ? "#3a3f5d" : "#363b58";
  const accent = pointHash(gridX, gridY, 1) > 0.72 ? "#484f74" : "#434967";

  ctx.fillStyle = base;
  ctx.fillRect(x, y, tile, tile);

  ctx.fillStyle = panel;
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.0625, tile * 0.875, tile * 0.875);

  ctx.fillStyle = "rgba(232, 224, 255, 0.08)";
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.0625, tile * 0.875, Math.max(2, tile * 0.046875));
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.0625, Math.max(2, tile * 0.046875), tile * 0.875);

  ctx.fillStyle = "rgba(8, 8, 14, 0.22)";
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.890625, tile * 0.875, Math.max(2, tile * 0.046875));
  ctx.fillRect(x + tile * 0.890625, y + tile * 0.0625, Math.max(2, tile * 0.046875), tile * 0.875);

  ctx.fillStyle = accent;
  ctx.fillRect(x + tile * 0.28125, y + tile * 0.28125, tile * 0.4375, 2);
  ctx.fillRect(x + tile * 0.28125, y + tile * 0.6875, tile * 0.4375, 2);

  if (pointHash(gridX, gridY, 2) > 0.58) {
    ctx.fillStyle = "rgba(207, 194, 238, 0.12)";
    ctx.fillRect(x + tile * 0.1875, y + tile * 0.171875, Math.max(2, tile * 0.0625), Math.max(2, tile * 0.0625));
    ctx.fillRect(x + tile * 0.75, y + tile * 0.765625, Math.max(2, tile * 0.0625), Math.max(2, tile * 0.0625));
  }

  if (pointHash(gridX, gridY, 3) > 0.76) {
    ctx.fillStyle = "rgba(18, 18, 27, 0.34)";
    ctx.fillRect(x + tile * 0.40625, y + tile * 0.40625, tile * 0.21875, 2);
    ctx.fillRect(x + tile * 0.59375, y + tile * 0.4375, 2, tile * 0.15625);
  }
}

function drawButtonTile(gridX, gridY, group, metrics) {
  drawFloorTile(gridX, gridY, metrics);
  const { x, y } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  const pressed = mode === "play" ? isShutterPressed(group) : false;

  fillRoundedRect(x + tile * 0.18, y + tile * 0.58, tile * 0.64, tile * 0.16, 5, group.accentDark);
  fillRoundedRect(x + tile * 0.22, y + tile * (pressed ? 0.6 : 0.5), tile * 0.56, tile * 0.14, 5, group.accent);
  fillRoundedRect(x + tile * 0.28, y + tile * (pressed ? 0.62 : 0.52), tile * 0.44, tile * 0.05, 3, "rgba(255,255,255,0.26)");
}

function drawShutterTile(grid, gridX, gridY, metrics) {
  const tile = grid[gridY][gridX];
  const group = getShutterGroupByTile(tile);
  if (!group) {
    drawFloorTile(gridX, gridY, metrics);
    return;
  }

  drawFloorTile(gridX, gridY, metrics);
  const { x, y } = getTilePixel(gridX, gridY, metrics);
  const size = metrics.tileSize;
  const open = mode === "play" && isShutterPressed(group);
  const connectsUp = grid[gridY - 1]?.[gridX] === tile;
  const connectsDown = grid[gridY + 1]?.[gridX] === tile;
  const frameY = y + (connectsUp ? 0 : size * 0.08);
  const frameHeight = size - (connectsUp ? 0 : size * 0.08) - (connectsDown ? 0 : size * 0.08);
  const panelY = y + (connectsUp ? 0 : size * 0.14);
  const panelHeight = size - (connectsUp ? 0 : size * 0.14) - (connectsDown ? 0 : size * 0.14);

  ctx.fillStyle = group.accentDark;
  ctx.fillRect(x + size * 0.08, frameY, size * 0.84, frameHeight);

  if (open) {
    const openingY = y + (connectsUp ? 0 : size * 0.28);
    const openingHeight = size - (connectsUp ? 0 : size * 0.28) - (connectsDown ? 0 : size * 0.08);
    ctx.fillStyle = "rgba(16, 15, 24, 0.74)";
    ctx.fillRect(x + size * 0.16, openingY, size * 0.68, openingHeight);
    if (!connectsUp) {
      ctx.fillStyle = group.accent;
      ctx.fillRect(x + size * 0.16, y + size * 0.16, size * 0.68, size * 0.14);
    }
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.22)" : "rgba(18,18,27,0.2)";
      if (!connectsUp) {
        ctx.fillRect(x + size * 0.18, y + size * 0.18 + size * (i * 0.025), size * 0.64, 2);
      }
    }
    if (connectsDown) {
      ctx.fillStyle = "rgba(16, 15, 24, 0.86)";
      ctx.fillRect(x + size * 0.16, y + size * 0.92, size * 0.68, size * 0.08);
    }
    return;
  }

  ctx.fillStyle = group.accent;
  ctx.fillRect(x + size * 0.16, panelY, size * 0.68, panelHeight);
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.26)" : "rgba(18,18,27,0.18)";
    ctx.fillRect(x + size * 0.18, panelY + size * 0.04 + i * size * 0.09, size * 0.64, 2);
  }
}

function drawSceneBackdrop(metrics) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#1c1a2a");
  gradient.addColorStop(0.55, "#2b2740");
  gradient.addColorStop(1, "#151320");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
  for (let y = 0; y < canvas.height; y += 6) {
    ctx.fillRect(0, y, canvas.width, 2);
  }

  ctx.fillStyle = "rgba(11, 10, 19, 0.34)";
  ctx.fillRect(0, canvas.height - 260, canvas.width, 260);

  const lightBand = ctx.createLinearGradient(0, metrics.offsetY - 120, 0, metrics.offsetY + metrics.height + 180);
  lightBand.addColorStop(0, "rgba(191, 172, 242, 0.04)");
  lightBand.addColorStop(0.5, "rgba(160, 144, 218, 0.1)");
  lightBand.addColorStop(1, "rgba(21, 19, 32, 0)");
  ctx.fillStyle = lightBand;
  ctx.fillRect(0, metrics.offsetY - 120, canvas.width, metrics.height + 260);

  drawAsset("sceneLeft", 32, 68, 192, 192, 0.76);
  drawAsset("sceneRight", canvas.width - 224, canvas.height - 268, 192, 192, 0.76);

  ctx.fillStyle = "rgba(18, 16, 30, 0.52)";
  ctx.fillRect(metrics.offsetX - 58, metrics.offsetY - 46, metrics.width + 116, metrics.height + 92);

  fillRoundedRect(metrics.offsetX - 24, metrics.offsetY - 22, metrics.width + 48, metrics.height + 44, 14, "rgba(70, 63, 96, 0.74)");
  strokeRoundedRect(metrics.offsetX - 24, metrics.offsetY - 22, metrics.width + 48, metrics.height + 44, 14, "rgba(219, 208, 245, 0.1)", 2);

  fillRoundedRect(metrics.offsetX - 12, metrics.offsetY - 10, metrics.width + 24, metrics.height + 20, 10, "rgba(18, 17, 29, 0.82)");
  strokeRoundedRect(metrics.offsetX - 12, metrics.offsetY - 10, metrics.width + 24, metrics.height + 20, 10, "rgba(131, 119, 173, 0.22)", 1.5);

  ctx.fillStyle = "rgba(223, 214, 248, 0.05)";
  for (let i = 0; i < 18; i += 1) {
    const dotX = 34 + ((i * 97) % (canvas.width - 68));
    const dotY = 28 + ((i * 53) % (canvas.height - 56));
    ctx.fillRect(dotX, dotY, 2, 2);
  }
}

function drawBoardFromGrid(grid, metrics) {
  fillRoundedRect(metrics.offsetX - 8, metrics.offsetY - 8, metrics.width + 16, metrics.height + 16, 8, "#191726");
  strokeRoundedRect(metrics.offsetX - 8, metrics.offsetY - 8, metrics.width + 16, metrics.height + 16, 8, "rgba(223, 214, 248, 0.12)", 2);

  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      const tile = grid[y][x];
      if (tile === "#") {
        drawWallTile(grid, x, y, metrics);
      } else if (isButtonTile(tile)) {
        drawButtonTile(x, y, getShutterGroupByTile(tile), metrics);
      } else if (isShutterTile(tile)) {
        drawShutterTile(grid, x, y, metrics);
      } else {
        drawFloorTile(x, y, metrics);
      }
    }
  }
}

function isWallCell(grid, x, y) {
  return grid[y]?.[x] === "#";
}

function drawWallTile(grid, gridX, gridY, metrics) {
  const { x, y } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  const neighbors = {
    up: isWallCell(grid, gridX, gridY - 1),
    right: isWallCell(grid, gridX + 1, gridY),
    down: isWallCell(grid, gridX, gridY + 1),
    left: isWallCell(grid, gridX - 1, gridY),
  };

  const capHeight = neighbors.up ? 6 : 10;
  const variant = pointHash(gridX, gridY, 4);
  const cap = (capHeight / TILE) * tile;

  ctx.fillStyle = "#47415c";
  ctx.fillRect(x, y, tile, tile);

  ctx.fillStyle = "#5d5677";
  ctx.fillRect(x + tile * 0.0625, y + cap, tile * 0.875, tile - cap - tile * 0.0625);

  ctx.fillStyle = "#857ba4";
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.0625, tile * 0.875, cap);

  ctx.fillStyle = "rgba(244, 236, 255, 0.26)";
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.0625, tile * 0.875, 2);

  ctx.fillStyle = "#3a344c";
  ctx.fillRect(x + tile * 0.0625, y + tile * 0.875, tile * 0.875, Math.max(2, tile * 0.0625));

  if (!neighbors.left) {
    ctx.fillStyle = "#71698d";
    ctx.fillRect(x + tile * 0.0625, y + cap, Math.max(2, tile * 0.0625), tile - cap - tile * 0.125);
  }

  if (!neighbors.right) {
    ctx.fillStyle = "#322d42";
    ctx.fillRect(x + tile * 0.875, y + cap, Math.max(2, tile * 0.0625), tile - cap - tile * 0.125);
  }

  if (!neighbors.up) {
    ctx.fillStyle = "#b6a9d7";
    ctx.fillRect(x + tile * 0.125, y + tile * 0.15625, tile * 0.75, Math.max(2, tile * 0.046875));
  }

  if (!neighbors.down) {
    ctx.fillStyle = "#2a2538";
    ctx.fillRect(x + tile * 0.125, y + tile * 0.84375, tile * 0.75, 2);
  }

  ctx.fillStyle = variant > 0.5 ? "#665f84" : "#625b80";
  ctx.fillRect(x + tile * 0.1875, y + tile * 0.28125, tile * 0.625, tile * 0.53125);

  ctx.fillStyle = "rgba(240, 231, 255, 0.1)";
  ctx.fillRect(x + tile * 0.21875, y + tile * 0.3125, tile * 0.5625, 2);
  ctx.fillRect(x + tile * 0.21875, y + tile * 0.3125, 2, tile * 0.46875);

  ctx.fillStyle = "rgba(16, 15, 24, 0.22)";
  ctx.fillRect(x + tile * 0.21875, y + tile * 0.78125, tile * 0.5625, 2);
  ctx.fillRect(x + tile * 0.75, y + tile * 0.3125, 2, tile * 0.46875);

  if (variant > 0.68) {
    ctx.fillStyle = "#8f85af";
    ctx.fillRect(x + tile * 0.375, y + tile * 0.4375, tile * 0.25, 2);
    ctx.fillRect(x + tile * 0.34375, y + tile * 0.5625, tile * 0.3125, 2);
  }

  if (variant < 0.24) {
    ctx.fillStyle = "rgba(33, 29, 47, 0.62)";
    ctx.fillRect(x + tile * 0.28125, y + tile * 0.46875, 2, tile * 0.1875);
    ctx.fillRect(x + tile * 0.3125, y + tile * 0.625, tile * 0.1875, 2);
  }

  ctx.fillStyle = "#cfc4ee";
  const rivet = Math.max(2, tile * 0.046875);
  ctx.fillRect(x + tile * 0.15625, y + tile * 0.21875, rivet, rivet);
  ctx.fillRect(x + tile * 0.75, y + tile * 0.21875, rivet, rivet);
  ctx.fillRect(x + tile * 0.15625, y + tile * 0.75, rivet, rivet);
  ctx.fillRect(x + tile * 0.75, y + tile * 0.75, rivet, rivet);
}

function drawGoalAt(gridX, gridY, metrics) {
  const { x, y } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  const pulse = 0.7 + (Math.sin(sceneTime / 240) + 1) * 0.15;

  ctx.save();
  ctx.globalAlpha = 0.12 * pulse;
  ctx.fillStyle = "#c8bdf0";
  ctx.beginPath();
  ctx.ellipse(x + tile / 2, y + tile * 0.92, tile * 0.34, tile * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (drawAsset("goal", x, y, tile, tile)) {
    return;
  }
  fillRoundedRect(x + tile * 0.18, y + tile * 0.16, tile * 0.64, tile * 0.2, 8, "#7d729e");
  fillRoundedRect(x + tile * 0.44, y + tile * 0.28, tile * 0.12, tile * 0.18, 4, "#7e7694");
  fillRoundedRect(x + tile * 0.14, y + tile * 0.34, tile * 0.72, tile * 0.42, 10, "#9085b4");
  fillRoundedRect(x + tile * 0.22, y + tile * 0.42, tile * 0.56, tile * 0.24, 8, "#231f36");
  fillRoundedRect(x + tile * 0.28, y + tile * 0.7, tile * 0.44, tile * 0.08, 4, "#cdbf94");
}

function drawUsbAt(gridX, gridY, metrics) {
  const { x: cellX, y: cellY } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  if (drawAsset("usb", cellX, cellY, tile, tile)) {
    return;
  }
  const x = cellX + tile * 0.28125;
  const y = cellY + tile * 0.34375;
  fillRoundedRect(x, y, tile * 0.4375, tile * 0.59375, 10, "#6eb38f");
  strokeRoundedRect(x, y, tile * 0.4375, tile * 0.59375, 10, "#476d59", 2.5);
  fillRoundedRect(x + tile * 0.140625, y - tile * 0.109375, tile * 0.15625, tile * 0.1875, 5, "#cfe2d8");
  fillRoundedRect(x + tile * 0.21875, y - tile * 0.078125, Math.max(2, tile * 0.09375), Math.max(3, tile * 0.140625), 2, "#f8fbf8");
  fillRoundedRect(x + tile * 0.375, y - tile * 0.078125, Math.max(2, tile * 0.09375), Math.max(3, tile * 0.140625), 2, "#f8fbf8");
}

function drawBoxAt(gridX, gridY, attached, metrics, type = "light") {
  const { x: cellX, y: cellY } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  if (type === "light" && drawAsset(attached ? "boxLightAttached" : "boxLight", cellX, cellY, tile, tile)) {
    return;
  }
  const x = cellX + tile * 0.15625;
  const y = cellY + tile * 0.1875;
  ctx.fillStyle = "rgba(78, 92, 116, 0.14)";
  ctx.beginPath();
  ctx.ellipse(cellX + tile / 2, cellY + tile * 0.875, tile * 0.28125, tile * 0.109375, 0, 0, Math.PI * 2);
  ctx.fill();
  const boxColor = type === "heavy" ? "#6d657f" : attached ? "#a7b7ff" : "#99acb7";
  const frameColor = type === "heavy" ? "#3d3749" : "#58646f";
  fillRoundedRect(x, y, tile * 0.6875, tile * 0.71875, 16, boxColor);
  strokeRoundedRect(x, y, tile * 0.6875, tile * 0.71875, 16, frameColor, 2.5);
  fillRoundedRect(
    x + tile * 0.125,
    y + tile * 0.125,
    tile * 0.4375,
    tile * 0.4375,
    12,
    type === "heavy" ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.24)"
  );
  ctx.beginPath();
  ctx.strokeStyle = type === "heavy" ? "rgba(229, 221, 255, 0.18)" : "rgba(80, 92, 98, 0.6)";
  ctx.lineWidth = 2;
  ctx.moveTo(x + tile * 0.21875, y + tile * 0.1875);
  ctx.lineTo(x + tile * 0.46875, y + tile * 0.5);
  ctx.moveTo(x + tile * 0.46875, y + tile * 0.1875);
  ctx.lineTo(x + tile * 0.21875, y + tile * 0.5);
  ctx.stroke();
  if (type === "heavy") {
    fillRoundedRect(x + tile * 0.24, y + tile * 0.28, tile * 0.12, tile * 0.16, 3, "#2a2534");
    fillRoundedRect(x + tile * 0.42, y + tile * 0.28, tile * 0.12, tile * 0.16, 3, "#2a2534");
  }
}

function drawHeadRadius(metrics) {
  const headPos = world.player.hasHead ? world.player : world.head;
  const { x, y } = getTilePixel(headPos.renderX, headPos.renderY, metrics);
  const centerX = x + metrics.tileSize / 2;
  const centerY = y + metrics.tileSize / 2;
  const attractActive = mode === "play" && keys.attract;
  const repelActive = mode === "play" && keys.repel;
  const ringStroke = attractActive
    ? "rgba(173, 233, 255, 0.6)"
    : repelActive
      ? "rgba(184, 146, 248, 0.72)"
      : "rgba(187, 170, 235, 0.54)";
  const ringFill = attractActive
    ? "rgba(164, 229, 255, 0.12)"
    : repelActive
      ? "rgba(164, 122, 236, 0.16)"
      : "rgba(167, 147, 221, 0.08)";
  const crossStroke = attractActive
    ? "rgba(216, 247, 255, 0.18)"
    : repelActive
      ? "rgba(241, 232, 255, 0.24)"
      : "rgba(217, 208, 246, 0.12)";
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = ringStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, metrics.tileSize * 2.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ringFill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, metrics.tileSize * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([]);
  ctx.strokeStyle = crossStroke;
  ctx.beginPath();
  ctx.moveTo(centerX - 10, centerY);
  ctx.lineTo(centerX + 10, centerY);
  ctx.moveTo(centerX, centerY - 10);
  ctx.lineTo(centerX, centerY + 10);
  ctx.stroke();
  ctx.restore();
}

function drawPlayerAt(gridX, gridY, hasHead, magneticBody, hasUsb, metrics) {
  const { x: cellX, y: cellY } = getTilePixel(gridX, gridY, metrics);
  const tile = metrics.tileSize;
  const bob = mode === "play" ? Math.sin(sceneTime / 220 + gridX * 0.7 + gridY * 0.3) * 2.2 : 0;
  const x = cellX;
  const y = cellY + bob - tile * (world.player.jumpVisual ?? 0);
  const bodyName = magneticBody ? "robotBodyMagnetic" : "robotBody";
  const facing = world.player.facing ?? "left";
  const bodyImage = assets[bodyName];
  const bodyReady = bodyImage && bodyImage.complete && bodyImage.naturalWidth > 0;
  const bodyWidth = tile * 0.52;
  const bodyHeight = tile * 0.52;
  const bodyX = x + (tile - bodyWidth) / 2;
  const bodyY = y + tile - bodyHeight;
  const headSize = tile;
  const headX = x;
  const headY = y - tile * 0.4;
  if (!bodyReady) {
    ctx.fillStyle = "rgba(77, 87, 83, 0.12)";
    ctx.beginPath();
    ctx.ellipse(x + tile / 2, cellY + tile * 0.890625, tile * 0.25, tile * 0.109375, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const bodyDrawn = drawAsset(bodyName, bodyX, bodyY, bodyWidth, bodyHeight);
  if (bodyDrawn) {
    if (hasHead) {
      drawHeadAtPixels(headX, headY, headSize, facing, false, hasUsb);
    }
    return;
  }
  const bodyColor = magneticBody ? "#8fa0dd" : "#d17d62";
  fillRoundedRect(x + 16, y + 33, 12, 12, 6, darken(bodyColor, 0.08));
  fillRoundedRect(x + 36, y + 33, 12, 12, 6, darken(bodyColor, 0.08));
  fillRoundedRect(x + 21, y + 29, tile - 42, 26, { tl: 10, tr: 10, br: 13, bl: 13 }, bodyColor);
  strokeRoundedRect(x + 21, y + 29, tile - 42, 26, { tl: 10, tr: 10, br: 13, bl: 13 }, "#5f4d46", 2.5);
  fillRoundedRect(x + 26, y + 34, tile - 52, 15, 8, "#f7eedf");
  fillRoundedRect(x + 24, y + 51, 10, 7, 4, "#6d7c67");
  fillRoundedRect(x + 40, y + 51, 10, 7, 4, "#6d7c67");
  fillRoundedRect(x + 27, y + 39, 4, 4, 2, "rgba(93, 82, 67, 0.65)");
  fillRoundedRect(x + 33, y + 39, 4, 4, 2, "rgba(93, 82, 67, 0.65)");
  if (hasHead) {
    drawHeadAtPixels(headX, headY, headSize, facing, false, hasUsb);
  } else {
    fillRoundedRect(x + 27, y + 21, 10, 7, 4, "#746356");
    fillRoundedRect(x + 24, y + 12, TILE - 48, 12, 6, "#7c6a5d");
  }
}

function drawHeadAtGrid(gridX, gridY, detached, hasUsb, metrics) {
  const { x, y } = getTilePixel(gridX, gridY, metrics);
  drawHeadAtPixels(x, y, metrics.tileSize, world.head.facing ?? "left", detached, hasUsb);
}

function drawHeadAtPixels(tileX, tileY, tileSize, facing = "left", detached = false, hasUsb = false) {
  const headName = facing === "right" ? "robotHeadRight" : "robotHeadLeft";
  if (detached) {
    ctx.fillStyle = "rgba(77, 87, 83, 0.1)";
    ctx.beginPath();
    ctx.ellipse(tileX + tileSize / 2, tileY + tileSize * 0.75, tileSize * 0.203125, tileSize * 0.078125, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (drawAsset(headName, tileX, tileY, tileSize, tileSize)) {
    if (hasUsb) {
      const plugX = facing === "right" ? tileX + tileSize * 0.1875 : tileX + tileSize * 0.625;
      drawAsset("usbPlug", plugX, tileY + tileSize * 0.15625, tileSize * 0.1875, tileSize * 0.28125);
    }
    return true;
  }
  const headColor = detached ? "#efc38e" : "#efb46b";
  fillRoundedRect(tileX + 12, tileY + 8, tileSize - 24, tileSize - 24, 14, headColor);
  strokeRoundedRect(tileX + 12, tileY + 8, tileSize - 24, tileSize - 24, 14, "#7a5d35", 2.5);
  fillRoundedRect(tileX + 18, tileY + 14, tileSize - 36, 12, 8, "rgba(255, 247, 232, 0.46)");
  ctx.fillStyle = "#433326";
  ctx.beginPath();
  ctx.arc(tileX + 27, tileY + 24, 3.6, 0, Math.PI * 2);
  ctx.arc(tileX + tileSize - 27, tileY + 24, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(229, 143, 109, 0.58)";
  ctx.beginPath();
  ctx.arc(tileX + 22, tileY + 30, 3.5, 0, Math.PI * 2);
  ctx.arc(tileX + tileSize - 22, tileY + 30, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#433326";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tileX + tileSize / 2, tileY + 29, 7, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  fillRoundedRect(tileX + 28, tileY + 1, TILE - 56, 10, 5, "#7e997d");
  fillRoundedRect(tileX + tileSize / 2 - 2, tileY - 4, 4, 8, 2, "#7e997d");
  if (hasUsb) {
    fillRoundedRect(tileX + tileSize - 21, tileY + 13, 10, 20, 4, "#6eb38f");
  }
  return false;
}

function darken(hexColor, amount) {
  const color = hexColor.replace("#", "");
  const chunk = color.length === 3 ? color.split("").map((value) => value + value).join("") : color;
  const channels = chunk.match(/.{2}/g).map((part) => Math.max(0, Math.min(255, Math.round(parseInt(part, 16) * (1 - amount)))));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function drawEditorCursorHint(metrics) {
  fillRoundedRect(metrics.offsetX, canvas.height - 52, 246, 34, 8, "rgba(47, 43, 68, 0.92)");
  strokeRoundedRect(metrics.offsetX, canvas.height - 52, 246, 34, 8, "rgba(214, 202, 244, 0.14)", 1.5);
  ctx.fillStyle = "rgba(233, 226, 247, 0.9)";
  ctx.font = '14px "Iosevka", "IBM Plex Mono", monospace';
  ctx.fillText(`Palette: ${paletteItems.find((item) => item.key === selectedPalette)?.label ?? selectedPalette}`, metrics.offsetX + 14, canvas.height - 29);
}

function updateHud() {
  stageTitle.textContent = editorStage.title;
  stageGoal.textContent = editorStage.goal;
  stageHint.textContent =
    mode === "edit"
      ? "Editモード: パレットを選んでキャンバス上に配置。Playでそのままテストできます。"
      : editorStage.hint;
  nextStageButton.disabled = mode !== "play" || !world.cleared || world.gameOver || stageIndex >= stageDefinitions.length - 1;
  overlayNextStageButton.hidden = stageIndex >= stageDefinitions.length - 1;
  clearOverlay.classList.toggle("is-visible", mode === "play" && world.cleared);
  clearOverlay.setAttribute("aria-hidden", mode === "play" && world.cleared ? "false" : "true");
  gameOverOverlay.classList.toggle("is-visible", mode === "play" && world.gameOver);
  gameOverOverlay.setAttribute("aria-hidden", mode === "play" && world.gameOver ? "false" : "true");

  if (mode === "edit") {
    const problems = validateStage(editorStage);
    statusCard.innerHTML = [
      `<p>Mode: Edit</p>`,
      `<p>Palette: ${paletteItems.find((item) => item.key === selectedPalette)?.label ?? selectedPalette}</p>`,
      `<p>Size: ${editorStage.width ?? editorStage.grid[0].length} x ${editorStage.height ?? editorStage.grid.length}</p>`,
      `<p>${problems.length === 0 ? "Play可能" : `不足: ${problems.join(" / ")}`}</p>`,
      `<p>${editorMessage}</p>`,
    ].join("");
    return;
  }

  const headState = world.player.hasHead ? "装着中" : "設置中";
  const usbState = world.head.hasUsb ? "頭に装着済み" : world.player.carryingUsb ? "本体が保持中" : "未回収";
  statusCard.innerHTML = [
    `<p>Mode: Play</p>`,
    `<p>頭: ${headState}</p>`,
    `<p>USB: ${usbState}</p>`,
    `<p>State: ${world.gameOver ? "Game Over" : world.cleared ? "Clear" : "Playing"}</p>`,
    `<p>${renderFailure ? `Render Error: ${renderFailure}` : world.message}</p>`,
  ].join("");
}

function getGridPositionFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const metrics = getBoardMetrics(editorStage.grid);
  const localX = (event.clientX - rect.left) * scaleX - metrics.offsetX;
  const localY = (event.clientY - rect.top) * scaleY - metrics.offsetY;
  const x = Math.floor(localX / metrics.tileSize);
  const y = Math.floor(localY / metrics.tileSize);
  return { x, y };
}

function setEditorCell(x, y, value) {
  if (y < 0 || y >= editorStage.grid.length || x < 0 || x >= editorStage.grid[0].length) {
    return;
  }

  const rows = editorStage.grid.map((row) => row.split(""));
  if (singletonTiles.has(value)) {
    rows.forEach((row) => {
      row.forEach((cell, cellIndex) => {
        if (cell === value) {
          row[cellIndex] = ".";
        }
      });
    });
  }

  rows[y][x] = value;
  editorStage.grid = rows.map((row) => row.join(""));
  saveEditorStage();
}

function paintEditorAt(x, y) {
  if (mode !== "edit") {
    return;
  }
  if (x < 0 || x >= editorStage.grid[0].length || y < 0 || y >= editorStage.grid.length) {
    return;
  }
  setEditorCell(x, y, selectedPalette);
  editorMessage = `(${x}, ${y}) に ${paletteItems.find((item) => item.key === selectedPalette)?.label ?? selectedPalette} を配置。`;
  refreshExport();
}

function refreshExport() {
  const exportName = editorStage.id || `stage-${stageIndex + 1}`;
  exportOutput.value = [
    `export const ${exportName.replace(/-/g, "")} = {`,
    `  id: "${exportName}",`,
    `  title: "${editorStage.title}",`,
    `  goal: "${editorStage.goal}",`,
    `  hint: "${editorStage.hint}",`,
    `  width: ${editorStage.width ?? editorStage.grid[0].length},`,
    `  height: ${editorStage.height ?? editorStage.grid.length},`,
    "  grid: [",
    ...editorStage.grid.map((row) => `    "${row}",`),
    "  ],",
    "};",
  ].join("\n");
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "q", "e", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }

  if (mode !== "play") {
    return;
  }

  if ((key === "arrowup" || key === "w") && !keys.up) {
    keys.up = true;
    queueMove("up");
  }
  if ((key === "arrowdown" || key === "s") && !keys.down) {
    keys.down = true;
    queueMove("down");
  }
  if ((key === "arrowleft" || key === "a") && !keys.left) {
    keys.left = true;
    queueMove("left");
  }
  if ((key === "arrowright" || key === "d") && !keys.right) {
    keys.right = true;
    queueMove("right");
  }
  if (key === " ") {
    toggleHead();
  }
  if (key === "q") {
    keys.attract = true;
  }
  if (key === "e") {
    keys.repel = true;
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowup" || key === "w") {
    keys.up = false;
  }
  if (key === "arrowdown" || key === "s") {
    keys.down = false;
  }
  if (key === "arrowleft" || key === "a") {
    keys.left = false;
  }
  if (key === "arrowright" || key === "d") {
    keys.right = false;
  }
  if (key === "q") {
    keys.attract = false;
  }
  if (key === "e") {
    keys.repel = false;
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (mode !== "edit") {
    return;
  }
  isPainting = true;
  const { x, y } = getGridPositionFromEvent(event);
  paintEditorAt(x, y);
});

canvas.addEventListener("mousemove", (event) => {
  if (!isPainting || mode !== "edit") {
    return;
  }
  const { x, y } = getGridPositionFromEvent(event);
  paintEditorAt(x, y);
});

window.addEventListener("mouseup", () => {
  isPainting = false;
});

canvas.addEventListener("contextmenu", (event) => {
  if (mode !== "edit") {
    return;
  }
  event.preventDefault();
  const { x, y } = getGridPositionFromEvent(event);
  setEditorCell(x, y, ".");
  editorMessage = `(${x}, ${y}) を消去。`;
  refreshExport();
});

resetButton.addEventListener("click", () => {
  if (mode === "edit") {
    resetWorld();
    editorMessage = "編集内容を保ったまま、テスト状態をリセットしました。";
    return;
  }
  resetWorld();
});

playResetButton.addEventListener("click", () => {
  resetWorld();
});

overlayResetButton.addEventListener("click", () => {
  resetWorld();
});

restoreButton.addEventListener("click", restoreBaseStage);
applyMapSizeButton.addEventListener("click", applyMapSize);

nextStageButton.addEventListener("click", () => {
  if (stageIndex < stageDefinitions.length - 1) {
    loadStage(stageIndex + 1);
  }
});

overlayNextStageButton.addEventListener("click", () => {
  if (stageIndex < stageDefinitions.length - 1) {
    loadStage(stageIndex + 1);
  }
});

editModeButton.addEventListener("click", () => {
  setMode("edit");
});

playModeButton.addEventListener("click", () => {
  const problems = validateStage(editorStage);
  if (problems.length > 0) {
    editorMessage = `Playできません: ${problems.join(" / ")}`;
    setMode("edit");
    return;
  }
  resetWorld();
  setMode("play");
});

exportButton.addEventListener("click", refreshExport);

mapWidthInput.addEventListener("change", () => {
  mapWidthInput.value = String(clampStageSize(mapWidthInput.value, editorStage.width ?? editorStage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS));
});

mapHeightInput.addEventListener("change", () => {
  mapHeightInput.value = String(clampStageSize(mapHeightInput.value, editorStage.height ?? editorStage.grid.length ?? DEFAULT_STAGE_ROWS));
});

renderStageButtons();
renderPaletteButtons();
syncMapSizeControls();
resizeCanvasForGrid(editorStage.grid);
refreshExport();
setMode("edit");
try {
  draw();
} catch (error) {
  reportRenderFailure(error);
  drawErrorState();
}
requestAnimationFrame(update);

window.addEventListener("error", (event) => {
  if (!renderFailure) {
    reportRenderFailure(event.error ?? event.message);
    drawErrorState();
  }
});

window.addEventListener("resize", () => {
  resizeCanvasForGrid(editorStage.grid);
});
