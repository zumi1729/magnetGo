import { stageDefinitions } from "../stages/index.js";
import {
  MIN_TILE,
  DISPLAY_TILE,
  DEFAULT_STAGE_COLUMNS,
  DEFAULT_STAGE_ROWS,
  MAGNET_INTERVAL,
  GRAVITY_INTERVAL,
  JUMP_BUFFER_MS,
  COYOTE_TIME_MS,
  assetUrls,
  wallTileVariants,
  paletteItems,
  shutterGroups,
} from "./config.js";
import { dom, isPlayerView } from "./dom.js";
import { createEditorController } from "./editor.js";
import { createGameplayController } from "./gameplay.js";
import { createAssetImages, createRenderer } from "./render.js";
import {
  cloneStage,
  createWorld,
  getStageStorageKey,
  resolveEditorStage,
  saveEditorStage as saveEditorStageToStorage,
  validateStage,
} from "./stage.js";

// 画像アセットは最初にまとめて読み込み、描画側へ渡す。
const assets = createAssetImages(assetUrls);

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
// DOM 参照は最初に束ねて取り出し、下ではロジックだけを追いやすくする。
const {
  appLayout,
  clearOverlay,
  overlayNextStageButton,
  gameOverOverlay,
  overlayResetButton,
  playSideActions,
  playResetButton,
  stageTitle,
  playerStageIndex,
  playerStageTitle,
  stageGoal,
  stageHint,
  statusCard,
  resetButton,
  stageButtons,
  nextStageButton,
  editModeButton,
  playModeButton,
  paletteButtons,
  exportButton,
  exportOutput,
  restoreButton,
  mapWidthInput,
  mapHeightInput,
  applyMapSizeButton,
} = dom;

const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  attract: false,
  repel: false,
};

// `main.js` は各機能をつなぐ役として、共有状態をまとめて持つ。
let stageIndex = 0;
let mode = "edit";
let selectedPalette = "#";
let isPainting = false;
let editorStage = resolveEditorStage(stageDefinitions[stageIndex], isPlayerView);
let world = createWorld(editorStage);
let lastMagnetTick = 0;
let lastGravityTick = 0;
let sceneTime = 0;
let editorMessage = "Editモードです。左クリックで配置、ドラッグで連続配置。";
let renderFailure = null;

// 編集用の処理は、現在の状態を読む関数と更新用の関数だけを受け取る。
const editorController = createEditorController({
  paletteButtons,
  exportOutput,
  mapWidthInput,
  mapHeightInput,
  readMode: () => mode,
  readStageIndex: () => stageIndex,
  readEditorStage: () => editorStage,
  replaceEditorStage: (nextStage) => {
    editorStage = nextStage;
  },
  readSelectedPalette: () => selectedPalette,
  updateSelectedPalette: (nextPalette) => {
    selectedPalette = nextPalette;
  },
  updateEditorMessage: (message) => {
    editorMessage = message;
  },
  persistEditorStage,
  resetWorld,
  resizeCanvasForGrid,
});

// ゲーム進行は描画や DOM を知らず、ワールド状態の更新に専念させる。
const gameplayController = createGameplayController({
  keys,
  wallTileVariants,
  jumpBufferMs: JUMP_BUFFER_MS,
  coyoteTimeMs: COYOTE_TIME_MS,
  readMode: () => mode,
  readWorld: () => world,
  readSceneTime: () => sceneTime,
  findShutterGroup,
  isShutterTile,
});

// 描画処理は、毎フレーム必要な状態だけを参照関数経由で読む。
const renderer = createRenderer({
  canvas,
  ctx,
  assets,
  keys,
  readMode: () => mode,
  readWorld: () => world,
  readEditorStage: () => editorStage,
  readSelectedPalette: () => selectedPalette,
  readSceneTime: () => sceneTime,
  readRenderFailure: () => renderFailure,
  isButtonTile,
  isShutterTile,
  isShutterPressed: gameplayController.isShutterPressed,
  findShutterGroup,
  updateHud,
});

function formatErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message ?? String(error);
}

// 描画エラーが起きたらループは止めず、画面表示だけエラー状態へ切り替える。
function reportRenderFailure(error) {
  const message = formatErrorMessage(error);
  renderFailure = message;
  world.message = `描画エラー: ${message}`;
  console.error(error);
}

function clearRenderFailure() {
  renderFailure = null;
}

// 保存時は「現在編集中の内容」と「元のステージ定義」の対応を一緒に記録する。
function persistEditorStage() {
  const baseStage = stageDefinitions[stageIndex];
  saveEditorStageToStorage(editorStage, baseStage);
}

// 盤面サイズに応じてキャンバス解像度を調整し、プレイ・編集の両方で共用する。
function resizeCanvasForGrid(grid) {
  const columns = grid[0]?.length ?? DEFAULT_STAGE_COLUMNS;
  const rows = grid.length ?? DEFAULT_STAGE_ROWS;
  const paddedWidth = window.innerWidth < 860 ? 72 : 112;
  const paddedHeight = window.innerWidth < 860 ? 120 : 144;
  const targetTile = Math.max(MIN_TILE, Math.min(DISPLAY_TILE, Math.floor(1152 / Math.max(columns, rows))));
  canvas.width = Math.max(720, columns * targetTile + paddedWidth * 2);
  canvas.height = Math.max(720, rows * targetTile + paddedHeight * 2);
}

// ブラウザ保存を捨てて、元のステージ定義へ完全に戻す。
function restoreBaseStage() {
  const baseStage = stageDefinitions[stageIndex];
  window.localStorage.removeItem(getStageStorageKey(baseStage.id));
  editorStage = cloneStage(baseStage);
  resizeCanvasForGrid(editorStage.grid);
  resetWorld();
  setMode(isPlayerView ? "play" : "edit");
  editorController.syncMapSizeControls();
  editorMessage = "元のステージ定義に戻しました。";
  editorController.refreshExport();
}

// ステージ切り替え時は、編集データ解決・ワールド再構築・UI同期をまとめて行う。
function loadStage(index) {
  stageIndex = index;
  const baseStage = stageDefinitions[index];
  editorStage = resolveEditorStage(baseStage, isPlayerView);
  resizeCanvasForGrid(editorStage.grid);
  resetWorld();
  setMode(isPlayerView ? "play" : "edit");
  editorMessage = `${editorStage.title} を読み込みました。`;
  renderStageButtons();
  editorController.syncMapSizeControls();
  editorController.refreshExport();
}

// プレイ状態を作り直し、各ティマーや描画エラー状態も初期化する。
function resetWorld() {
  world = createWorld(editorStage);
  gameplayController.syncRenderPositions();
  lastMagnetTick = 0;
  lastGravityTick = 0;
  clearRenderFailure();
}

// モード切替は class と aria を同時に更新し、見た目と状態をずらさない。
function setMode(nextMode) {
  mode = isPlayerView ? "play" : nextMode;
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

// ステージ選択ボタンは current index に応じて毎回描き直す。
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

// ボタン/シャッターの対応色は、タイル文字から逆引きして求める。
function findShutterGroup(tile) {
  return Object.values(shutterGroups).find((group) => group.button === tile || group.shutter === tile) ?? null;
}

function isButtonTile(tile) {
  return Object.values(shutterGroups).some((group) => group.button === tile);
}

function isShutterTile(tile) {
  return Object.values(shutterGroups).some((group) => group.shutter === tile);
}

// 実際の押下判定は gameplay 側にまとめてある。
function isShutterPressed(group) {
  return gameplayController.isShutterPressed(group);
}

// メインループでは「入力処理 -> 状態更新 -> 描画」の順に 1 フレームを進める。
function update(timestamp) {
  if (renderFailure) {
    // 描画が壊れた後は通常更新を止め、エラー画面だけを維持する。
    renderer.drawErrorState();
    requestAnimationFrame(update);
    return;
  }

  sceneTime = timestamp;
    // 地面に触れていた時刻を覚えておき、ジャンプ猶予の判定に使う。
  if (gameplayController.isGrounded(world.player)) {
    world.player.lastGroundedAt = timestamp;
  }
  // ジャンプ予約は有効期限を過ぎたら破棄する。
  if (world.player.jumpQueuedUntil > 0 && timestamp > world.player.jumpQueuedUntil) {
    world.player.jumpQueuedUntil = 0;
  }
  gameplayController.processInput();

  // 重力は一定間隔ごとに 1 回ずつ進める。
  if (mode === "play" && timestamp - lastGravityTick >= GRAVITY_INTERVAL) {
    gameplayController.stepGravity();
    lastGravityTick = timestamp;
  }

  // 磁力も押しっぱなしをそのまま使わず、一定間隔ごとに処理する。
  if (mode === "play" && keys.attract && timestamp - lastMagnetTick >= MAGNET_INTERVAL) {
    gameplayController.stepMagnet("attract");
    lastMagnetTick = timestamp;
  }

  if (mode === "play" && keys.repel && timestamp - lastMagnetTick >= MAGNET_INTERVAL) {
    gameplayController.stepMagnet("repel");
    lastMagnetTick = timestamp;
  }

  try {
    // 実際の座標とは別に表示用の座標をなめらかに動かす。
    gameplayController.updateRenderPositions();
    renderer.draw();
  } catch (error) {
    reportRenderFailure(error);
    renderer.drawErrorState();
  }
  requestAnimationFrame(update);
}

// 状態表示欄は、編集モードとプレイモードで内容を切り替える。
function updateHud() {
  playerStageIndex.textContent = `Stage ${stageIndex + 1}`;
  playerStageTitle.textContent = editorStage.title;
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
    // 編集中はプレイ可能条件や現在パレットを中心に表示する。
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

  // プレイ中は頭・USB・進行状態を中心に表示する。
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

// キーボード入力はブラウザ標準の動作を止めて、順番待ちの入力として積む。
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "q", "e", "w", "a", "s", "d", "enter"].includes(key)) {
    event.preventDefault();
  }

  if (key === "enter" && mode === "play" && world.cleared && !world.gameOver && stageIndex < stageDefinitions.length - 1) {
    loadStage(stageIndex + 1);
    return;
  }

  if (mode !== "play") {
    return;
  }

  // 移動は押し始めた瞬間だけ登録し、押しっぱなしの重複を防ぐ。
  if ((key === "arrowup" || key === "w") && !keys.up) {
    keys.up = true;
    gameplayController.queueMove("up");
  }
  if ((key === "arrowdown" || key === "s") && !keys.down) {
    keys.down = true;
    gameplayController.queueMove("down");
  }
  if ((key === "arrowleft" || key === "a") && !keys.left) {
    keys.left = true;
    gameplayController.queueMove("left");
  }
  if ((key === "arrowright" || key === "d") && !keys.right) {
    keys.right = true;
    gameplayController.queueMove("right");
  }
  if (key === " ") {
    gameplayController.toggleHead();
  }
  // 磁力は押している間だけ使えるので、ここでは押下状態だけを更新する。
  if (key === "q") {
    keys.attract = true;
  }
  if (key === "e") {
    keys.repel = true;
  }
});

// keyup では磁力や移動の押下状態だけを解除する。
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

// 編集中の左ドラッグは「選択中のタイルを連続で配置する」操作として扱う。
canvas.addEventListener("mousedown", (event) => {
  if (mode !== "edit") {
    return;
  }
  isPainting = true;
  const { x, y } = renderer.getGridPositionFromEvent(event);
  editorController.paintSelectedTileAt(x, y);
});

canvas.addEventListener("mousemove", (event) => {
  if (!isPainting || mode !== "edit") {
    return;
  }
  const { x, y } = renderer.getGridPositionFromEvent(event);
  editorController.paintSelectedTileAt(x, y);
});

// マウスを離したら、連続配置中の状態を解除する。
window.addEventListener("mouseup", () => {
  isPainting = false;
});

// 右クリックは消しゴム操作として使うので、コンテキストメニューは抑止する。
canvas.addEventListener("contextmenu", (event) => {
  if (mode !== "edit") {
    return;
  }
  event.preventDefault();
  const { x, y } = renderer.getGridPositionFromEvent(event);
  editorController.eraseCellAt(x, y);
});

// Edit 中の Reset は「編集内容を保持したままテスト状態だけ戻す」挙動にする。
resetButton.addEventListener("click", () => {
  if (!isPlayerView && mode === "edit") {
    resetWorld();
    editorMessage = "編集内容を保ったまま、テスト状態をリセットしました。";
    return;
  }
  resetWorld();
});

// Play 側にある Reset ボタン群はすべて同じ初期化処理へ寄せる。
playResetButton.addEventListener("click", () => {
  resetWorld();
});

overlayResetButton.addEventListener("click", () => {
  resetWorld();
});

// 周辺 UI は、それぞれ対応する処理へそのままつなぐ。
restoreButton.addEventListener("click", restoreBaseStage);
applyMapSizeButton.addEventListener("click", editorController.applyMapSize);

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
  if (!isPlayerView) {
    setMode("edit");
  }
});

playModeButton.addEventListener("click", () => {
  const problems = validateStage(editorStage);
  if (problems.length > 0) {
    // 必須オブジェクトが不足している状態では Play へ入れない。
    editorMessage = `Playできません: ${problems.join(" / ")}`;
    setMode(isPlayerView ? "play" : "edit");
    return;
  }
  resetWorld();
  setMode("play");
});

exportButton.addEventListener("click", editorController.refreshExport);

mapWidthInput.addEventListener("change", () => {
  editorController.clampMapWidthInput();
});

mapHeightInput.addEventListener("change", () => {
  editorController.clampMapHeightInput();
});

// 初回起動時に UI とキャンバスを現在ステージへ同期する。
renderStageButtons();
editorController.renderPaletteButtons();
editorController.syncMapSizeControls();
resizeCanvasForGrid(editorStage.grid);
editorController.refreshExport();
if (isPlayerView) {
  resetWorld();
  setMode("play");
} else {
  setMode("edit");
}

// 最初の 1 フレームを即時描画してから、通常の更新ループへ入る。
try {
  renderer.draw();
} catch (error) {
  reportRenderFailure(error);
  renderer.drawErrorState();
}
requestAnimationFrame(update);

// 予期しない実行時エラーでも、白画面ではなくエラー状態を描画する。
window.addEventListener("error", (event) => {
  if (!renderFailure) {
    reportRenderFailure(event.error ?? event.message);
    renderer.drawErrorState();
  }
});

// ウィンドウサイズ変更時は、現在グリッドに合わせてキャンバスだけ再調整する。
window.addEventListener("resize", () => {
  resizeCanvasForGrid(editorStage.grid);
});
