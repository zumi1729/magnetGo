const getElementOrStub = (id, tag = "div") => document.getElementById(id) ?? document.createElement(tag);

export const dom = {
  appLayout: getElementOrStub("appLayout"),
  clearOverlay: getElementOrStub("clearOverlay"),
  overlayNextStageButton: getElementOrStub("overlayNextStageButton", "button"),
  gameOverOverlay: getElementOrStub("gameOverOverlay"),
  overlayResetButton: getElementOrStub("overlayResetButton", "button"),
  playSideActions: getElementOrStub("playSideActions"),
  playResetButton: getElementOrStub("playResetButton", "button"),
  stageTitle: getElementOrStub("stageTitle", "h2"),
  playerStageIndex: getElementOrStub("playerStageIndex", "p"),
  playerStageTitle: getElementOrStub("playerStageTitle", "h2"),
  stageGoal: getElementOrStub("stageGoal", "p"),
  stageHint: getElementOrStub("stageHint", "p"),
  statusCard: getElementOrStub("statusCard"),
  resetButton: getElementOrStub("resetButton", "button"),
  stageButtons: getElementOrStub("stageButtons"),
  nextStageButton: getElementOrStub("nextStageButton", "button"),
  editModeButton: getElementOrStub("editModeButton", "button"),
  playModeButton: getElementOrStub("playModeButton", "button"),
  paletteButtons: getElementOrStub("paletteButtons"),
  exportButton: getElementOrStub("exportButton", "button"),
  exportOutput: getElementOrStub("exportOutput", "textarea"),
  restoreButton: getElementOrStub("restoreButton", "button"),
  mapWidthInput: getElementOrStub("mapWidthInput", "input"),
  mapHeightInput: getElementOrStub("mapHeightInput", "input"),
  applyMapSizeButton: getElementOrStub("applyMapSizeButton", "button"),
};

export const shellMode = new URLSearchParams(window.location.search).get("mode") === "play" ? "play" : "edit";
export const isPlayerView = shellMode === "play";

document.body.classList.toggle("view-play", isPlayerView);
document.body.classList.toggle("view-edit", !isPlayerView);
