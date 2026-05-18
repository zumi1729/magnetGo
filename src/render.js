import {
  TILE,
  MIN_TILE,
  CHARACTER_RENDER_SCALE,
  HEAD_RENDER_SCALE,
  HEAD_RENDER_Y_OFFSET,
  DETACHED_HEAD_RENDER_Y_OFFSET,
  paletteItems,
  wallTileVariants,
} from "./config.js";

// 画像の読み込みそのものは renderer の外で済ませ、利用側から使い回せるようにする。
export function createAssetImages(manifest) {
  return Object.fromEntries(
    Object.entries(manifest).map(([name, url]) => {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      return [name, image];
    })
  );
}

export function createRenderer({
  canvas,
  ctx,
  assets,
  keys,
  readMode,
  readWorld,
  readEditorStage,
  readSelectedPalette,
  readSceneTime,
  readRenderFailure,
  isButtonTile,
  isShutterTile,
  isShutterPressed,
  findShutterGroup,
  updateHud,
}) {
  // アセット描画は「読み込み済みなら描く / 未読込なら何もしない」を共通化する。
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

  // 1 フレームの描画入口。モードに応じて editor / play を切り替える。
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (readMode() === "edit") {
      drawEditor();
    } else {
      drawPlayWorld();
    }
    updateHud();
  }

// 描画エラー時でも状態表示は残し、復旧操作ができるようにする。
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
    ctx.fillText(readRenderFailure() ?? "Unknown error", canvas.width / 2, canvas.height / 2 + 8);
    ctx.fillText("Reset か Restore Base を試してください。", canvas.width / 2, canvas.height / 2 + 36);
    ctx.textAlign = "start";
    updateHud();
  }

  function drawPlayWorld() {
    const world = readWorld();
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
    const editorStage = readEditorStage();
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

  function getGridPositionFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const metrics = getBoardMetrics(readEditorStage().grid);
    const localX = (event.clientX - rect.left) * scaleX - metrics.offsetX;
    const localY = (event.clientY - rect.top) * scaleY - metrics.offsetY;
    const x = Math.floor(localX / metrics.tileSize);
    const y = Math.floor(localY / metrics.tileSize);
    return { x, y };
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

  function drawFloorTile(gridX, gridY, metrics) {
    const { x, y } = getTilePixel(gridX, gridY, metrics);
    const tile = metrics.tileSize;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, tile, tile);
  }

  function drawButtonTile(gridX, gridY, group, metrics) {
    drawFloorTile(gridX, gridY, metrics);
    const { x, y } = getTilePixel(gridX, gridY, metrics);
    const tile = metrics.tileSize;
    const pressed = readMode() === "play" ? isShutterPressed(group) : false;

    fillRoundedRect(x + tile * 0.18, y + tile * 0.58, tile * 0.64, tile * 0.16, 5, group.accentDark);
    fillRoundedRect(x + tile * 0.22, y + tile * (pressed ? 0.6 : 0.5), tile * 0.56, tile * 0.14, 5, group.accent);
    fillRoundedRect(x + tile * 0.28, y + tile * (pressed ? 0.62 : 0.52), tile * 0.44, tile * 0.05, 3, "rgba(255,255,255,0.26)");
  }

  function drawShutterTile(grid, gridX, gridY, metrics) {
    const tile = grid[gridY][gridX];
    const group = findShutterGroup(tile);
    if (!group) {
      drawFloorTile(gridX, gridY, metrics);
      return;
    }

    drawFloorTile(gridX, gridY, metrics);
    const { x, y } = getTilePixel(gridX, gridY, metrics);
    const size = metrics.tileSize;
    const open = readMode() === "play" && isShutterPressed(group);
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
    fillRoundedRect(metrics.offsetX - 8, metrics.offsetY - 8, metrics.width + 16, metrics.height + 16, 8, "#000");

    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        const tile = grid[y][x];
        if (isWallCell(grid, x, y)) {
          drawWallTile(grid, x, y, metrics);
        } else if (isButtonTile(tile)) {
          drawButtonTile(x, y, findShutterGroup(tile), metrics);
        } else if (isShutterTile(tile)) {
          drawShutterTile(grid, x, y, metrics);
        } else {
          drawFloorTile(x, y, metrics);
        }
      }
    }
  }

  function isWallCell(grid, x, y) {
    return grid[y]?.[x] in wallTileVariants;
  }

  function drawWallTile(grid, gridX, gridY, metrics) {
    const { x, y } = getTilePixel(gridX, gridY, metrics);
    const tile = metrics.tileSize;
    const wallTile = grid[gridY]?.[gridX];
    const forcedVariant = wallTileVariants[wallTile];
    const openTop = !isWallCell(grid, gridX, gridY - 1);
    const openRight = !isWallCell(grid, gridX + 1, gridY);
    const openBottom = !isWallCell(grid, gridX, gridY + 1);
    const openLeft = !isWallCell(grid, gridX - 1, gridY);
    const hasCornerTopLeft = !forcedVariant && openTop && openLeft;
    const hasCornerTopRight = !forcedVariant && openTop && openRight;
    const hasCornerBottomRight = !forcedVariant && openBottom && openRight;
    const hasCornerBottomLeft = !forcedVariant && openBottom && openLeft;
    const isForcedCorner = wallTile === "5" || wallTile === "6" || wallTile === "7" || wallTile === "8";

    if (forcedVariant && !isForcedCorner && drawAsset(forcedVariant, x, y, tile, tile)) {
      return;
    }

    if (isForcedCorner || openTop || openRight || openBottom || openLeft) {
      drawFloorTile(gridX, gridY, metrics);
      if (forcedVariant) {
        drawAsset(forcedVariant, x, y, tile, tile);
        return;
      }
      if (hasCornerTopLeft) {
        drawAsset("wallCornerTopLeft", x, y, tile, tile);
      }
      if (hasCornerTopRight) {
        drawAsset("wallCornerTopRight", x, y, tile, tile);
      }
      if (hasCornerBottomRight) {
        drawAsset("wallCornerBottomRight", x, y, tile, tile);
      }
      if (hasCornerBottomLeft) {
        drawAsset("wallCornerBottomLeft", x, y, tile, tile);
      }
      if (openTop && !(hasCornerTopLeft || hasCornerTopRight)) {
        drawAsset("wallCapTop", x, y, tile, tile);
      }
      if (openRight && !(hasCornerTopRight || hasCornerBottomRight)) {
        drawAsset("wallCapRight", x, y, tile, tile);
      }
      if (openBottom && !(hasCornerBottomRight || hasCornerBottomLeft)) {
        drawAsset("wallCapBottom", x, y, tile, tile);
      }
      if (openLeft && !(hasCornerBottomLeft || hasCornerTopLeft)) {
        drawAsset("wallCapLeft", x, y, tile, tile);
      }
      return;
    }
    if (drawAsset("wallBlock", x, y, tile, tile)) {
      return;
    }
    const radius = Math.max(2, tile * 0.04);
    const borderSize = Math.max(2, tile * 0.03);
    const seamSize = Math.max(2, tile * 0.045);
    const topPattern = gridY % 2 === 0 ? [0.14, 0.44, 0.74] : [0.28, 0.58];
    const bottomPattern = gridY % 2 === 0 ? [0.28, 0.58] : [0.14, 0.44, 0.74];

    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, tile, tile);
    fillRoundedRect(x, y, tile, tile, radius, "#50679d");
    strokeRoundedRect(x, y, tile, tile, radius, "#243458", borderSize);

    ctx.save();
    roundedRectPath(x, y, tile, tile, radius);
    ctx.clip();

    ctx.fillStyle = "#8099d2";
    ctx.fillRect(x, y, tile, Math.max(3, tile * 0.14));
    ctx.fillRect(x, y, Math.max(3, tile * 0.08), tile);

    ctx.fillStyle = "#314772";
    ctx.fillRect(x, y + tile * 0.5 - seamSize / 2, tile, seamSize);

    const drawBrickCuts = (positions, topOffset) => {
      positions.forEach((leftRatio) => {
        const cutX = x + tile * leftRatio;
        const cutY = y + tile * topOffset;
        const cutW = tile * 0.12;
        const cutH = tile * 0.12;
        ctx.fillStyle = "#2d426f";
        ctx.fillRect(cutX, cutY, cutW, cutH);
        ctx.fillStyle = "rgba(208, 226, 255, 0.16)";
        ctx.fillRect(cutX, cutY, cutW, Math.max(2, tile * 0.02));
      });
    };

    drawBrickCuts(topPattern, 0.18);
    drawBrickCuts(bottomPattern, 0.66);

    ctx.restore();
  }

  function drawGoalAt(gridX, gridY, metrics) {
    const { x, y } = getTilePixel(gridX, gridY, metrics);
    const tile = metrics.tileSize;
    const pulse = 0.7 + (Math.sin(readSceneTime() / 240) + 1) * 0.15;

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
    const isHeavy = type === "heavy";
    const lightScale = 1;
    const lightOffset = (tile - tile * lightScale) / 2;
    const shadowWidth = tile * (isHeavy ? 0.33 : 0.23);
    const shadowHeight = tile * (isHeavy ? 0.125 : 0.09);

    ctx.fillStyle = "rgba(78, 92, 116, 0.14)";
    ctx.beginPath();
    ctx.ellipse(cellX + tile / 2, cellY + tile * 0.875, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    if (type === "light" && drawAsset(attached ? "boxLightAttached" : "boxLight", cellX + lightOffset, cellY + lightOffset, tile * lightScale, tile * lightScale)) {
      return;
    }

    if (isHeavy && drawAsset("boxHeavy", cellX - tile * 0.04, cellY - tile * 0.04, tile * 1.08, tile * 1.08)) {
      return;
    }

    const x = cellX + tile * 0.15625;
    const y = cellY + tile * 0.1875;
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
    const world = readWorld();
    const headPos = world.player.hasHead ? world.player : world.head;
    const { x, y } = getTilePixel(headPos.renderX, headPos.renderY, metrics);
    const centerX = x + metrics.tileSize / 2;
    const centerY = y + metrics.tileSize / 2;
    const attractActive = readMode() === "play" && keys.attract;
    const repelActive = readMode() === "play" && keys.repel;
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
    const world = readWorld();
    const { x: cellX, y: cellY } = getTilePixel(gridX, gridY, metrics);
    const tile = metrics.tileSize;
    const bob = readMode() === "play" ? Math.sin(readSceneTime() / 220 + gridX * 0.7 + gridY * 0.3) * 2.2 : 0;
    const x = cellX;
    const y = cellY + bob - tile * (world.player.jumpVisual ?? 0);
    const bodyName = magneticBody ? "robotBodyMagnetic" : "robotBody";
    const facing = world.player.facing ?? "left";
    const bodyImage = assets[bodyName];
    const bodyReady = bodyImage && bodyImage.complete && bodyImage.naturalWidth > 0;
    const bodyWidth = tile * 0.52 * CHARACTER_RENDER_SCALE;
    const bodyHeight = tile * 0.52 * CHARACTER_RENDER_SCALE;
    const bodyX = x + (tile - bodyWidth) / 2;
    const bodyY = y + tile - bodyHeight;
    const headSize = tile * HEAD_RENDER_SCALE * CHARACTER_RENDER_SCALE;
    const headX = x + (tile - headSize) / 2;
    const headY = y - tile * 0.15 + tile * HEAD_RENDER_Y_OFFSET;
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
    const world = readWorld();
    const { x, y } = getTilePixel(gridX, gridY, metrics);
    const headSize = metrics.tileSize * HEAD_RENDER_SCALE * CHARACTER_RENDER_SCALE;
    drawHeadAtPixels(
      x + (metrics.tileSize - headSize) / 2,
      y + (metrics.tileSize - headSize) / 2 + metrics.tileSize * DETACHED_HEAD_RENDER_Y_OFFSET,
      headSize,
      world.head.facing ?? "left",
      detached,
      hasUsb
    );
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
    ctx.fillText(`Palette: ${paletteItems.find((item) => item.key === readSelectedPalette())?.label ?? readSelectedPalette()}`, metrics.offsetX + 14, canvas.height - 29);
  }

  return {
    draw,
    drawErrorState,
    getGridPositionFromEvent,
  };
}
