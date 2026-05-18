import { DEFAULT_STAGE_COLUMNS, DEFAULT_STAGE_ROWS, paletteItems, singletonTiles } from "./config.js";
import { clampStageSize, resizeGrid } from "./stage.js";

export function createEditorController({
  paletteButtons,
  exportOutput,
  mapWidthInput,
  mapHeightInput,
  readMode,
  readStageIndex,
  readEditorStage,
  replaceEditorStage,
  readSelectedPalette,
  updateSelectedPalette,
  updateEditorMessage,
  persistEditorStage,
  resetWorld,
  resizeCanvasForGrid,
}) {
  function getPaletteLabel(key) {
    return paletteItems.find((item) => item.key === key)?.label ?? key;
  }

  function renderPaletteButtons() {
    paletteButtons.innerHTML = "";
    paletteItems.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `palette-button${item.key === readSelectedPalette() ? " is-active" : ""}`;
      button.textContent = item.label;
      button.addEventListener("click", () => {
        updateSelectedPalette(item.key);
        renderPaletteButtons();
      });
      paletteButtons.appendChild(button);
    });
  }

  function syncMapSizeControls() {
    const editorStage = readEditorStage();
    mapWidthInput.value = String(editorStage.width ?? editorStage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS);
    mapHeightInput.value = String(editorStage.height ?? editorStage.grid.length ?? DEFAULT_STAGE_ROWS);
  }

  function refreshExport() {
    const editorStage = readEditorStage();
    const exportName = editorStage.id || `stage-${readStageIndex() + 1}`;
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

  function setCellTile(x, y, value) {
    const editorStage = readEditorStage();
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
    replaceEditorStage({
      ...editorStage,
      grid: rows.map((row) => row.join("")),
    });
    persistEditorStage();
  }

  function paintSelectedTileAt(x, y) {
    if (readMode() !== "edit") {
      return;
    }
    const editorStage = readEditorStage();
    if (x < 0 || x >= editorStage.grid[0].length || y < 0 || y >= editorStage.grid.length) {
      return;
    }
    const selectedPalette = readSelectedPalette();
    setCellTile(x, y, selectedPalette);
    updateEditorMessage(`(${x}, ${y}) に ${getPaletteLabel(selectedPalette)} を配置。`);
    refreshExport();
  }

  function eraseCellAt(x, y) {
    setCellTile(x, y, ".");
    updateEditorMessage(`(${x}, ${y}) を消去。`);
    refreshExport();
  }

  function applyMapSize() {
    const editorStage = readEditorStage();
    const width = clampStageSize(mapWidthInput.value, editorStage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS);
    const height = clampStageSize(mapHeightInput.value, editorStage.grid.length ?? DEFAULT_STAGE_ROWS);
    const nextStage = {
      ...editorStage,
      width,
      height,
      grid: resizeGrid(editorStage.grid, width, height),
    };
    replaceEditorStage(nextStage);
    resizeCanvasForGrid(nextStage.grid);
    syncMapSizeControls();
    persistEditorStage();
    resetWorld();
    updateEditorMessage(`マップサイズを ${width} x ${height} に変更。`);
    refreshExport();
  }

  function clampMapWidthInput() {
    const editorStage = readEditorStage();
    mapWidthInput.value = String(clampStageSize(mapWidthInput.value, editorStage.width ?? editorStage.grid[0]?.length ?? DEFAULT_STAGE_COLUMNS));
  }

  function clampMapHeightInput() {
    const editorStage = readEditorStage();
    mapHeightInput.value = String(clampStageSize(mapHeightInput.value, editorStage.height ?? editorStage.grid.length ?? DEFAULT_STAGE_ROWS));
  }

  return {
    applyMapSize,
    clampMapHeightInput,
    clampMapWidthInput,
    eraseCellAt,
    getPaletteLabel,
    paintSelectedTileAt,
    refreshExport,
    renderPaletteButtons,
    setCellTile,
    syncMapSizeControls,
  };
}
