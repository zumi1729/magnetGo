export function createGameplayController({
  keys,
  wallTileVariants,
  jumpBufferMs,
  coyoteTimeMs,
  readMode,
  readWorld,
  readSceneTime,
  findShutterGroup,
  isShutterTile,
}) {
  const moveQueue = [];

  // 座標上のタイルを返す。範囲外は壁として扱う。
  function getTile(x, y) {
    const world = readWorld();
    if (y < 0 || y >= world.height || x < 0 || x >= world.width) {
      return "#";
    }
    return world.stage.grid[y][x];
  }

  // シャッターはプレイ中で、対応ボタンが押されている間だけ開く。
  function isShutterOpenAt(x, y) {
    const tile = getTile(x, y);
    const group = findShutterGroup(tile);
    if (!group || tile !== group.shutter || readMode() !== "play") {
      return false;
    }
    return isShutterPressed(group);
  }

  // 壁や閉じたシャッターは、移動・重力・磁力のすべてを遮る。
  function isSolidTile(x, y) {
    const tile = getTile(x, y);
    return tile in wallTileVariants || (isShutterTile(tile) && !isShutterOpenAt(x, y));
  }

  // 指定セルにいる箱エンティティを取得する。
  function getBoxAt(x, y) {
    return readWorld().boxes.find((box) => box.x === x && box.y === y);
  }

  // 分離した頭は、空間は通れるが壁・箱・プレイヤーには重なれない。
  function canDetachedHeadMoveTo(x, y) {
    const world = readWorld();
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

  // ジャンプ強化判定で使う、金属箱の存在チェック。
  function hasMetalBoxAt(x, y) {
    return readWorld().boxes.some((box) => box.x === x && box.y === y);
  }

  // 斥力ジャンプは、足元に金属箱があるときだけ成立する。
  function canRepelBoostJump() {
    const world = readWorld();
    return keys.repel && hasMetalBoxAt(world.player.x, world.player.y + 1);
  }

  // 引力ジャンプは、頭上側に金属箱があるときだけ成立する。
  function canAttractBoostJump() {
    const world = readWorld();
    return keys.attract && hasMetalBoxAt(world.player.x, world.player.y - 2);
  }

  // エンティティの直下に床・箱・他アクターがあるかを判定する。
  function isGrounded(entity) {
    const world = readWorld();
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

  // リセット直後などに、描画座標を現在の論理座標へ即座にそろえる。
  function syncRenderPositions() {
    const world = readWorld();
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

  // 表示用の座標を実際の座標へ少しずつ近づけて、見た目を滑らかにする。
  function updateRenderPositions() {
    const world = readWorld();
    const easing = 0.32;
    const snapThreshold = 0.01;

    // プレイヤー・頭・箱を同じルールで少しずつ動かす。
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
      // ジャンプの見た目用オフセットは時間経過で減衰させる。
      world.player.jumpVisual = Math.max(0, world.player.jumpVisual - 0.055);
    }
  }

  // 頭が分離中のときだけ、そのセルを占有物として扱う。
  function hasDetachedHeadAt(x, y, ignoreHead = false) {
    const world = readWorld();
    return !ignoreHead && !world.player.hasHead && world.head.x === x && world.head.y === y;
  }

  // 占有判定では、移動元のプレイヤー自身を無視したい場合がある。
  function hasPlayerAt(x, y, ignorePlayer = false) {
    const world = readWorld();
    return !ignorePlayer && world.player.x === x && world.player.y === y;
  }

  // 磁力の発生源は、装着中ならプレイヤー位置、分離中なら頭の位置になる。
  function getHeadPosition() {
    const world = readWorld();
    if (world.player.hasHead) {
      return { x: world.player.x, y: world.player.y };
    }
    return { x: world.head.x, y: world.head.y };
  }

  // 押し出し・ジャンプ・磁力移動で共通利用する占有判定。
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

  // ゲームオーバー状態にして、状態表示用のメッセージも更新する。
  function triggerGameOver(message = "シャッターに挟まれた。") {
    const world = readWorld();
    world.gameOver = true;
    world.message = message;
  }

  // 閉じたシャッターの位置に本体や頭があると圧死扱いにする。
  function checkShutterCrush() {
    const world = readWorld();
    if (readMode() !== "play" || world.cleared || world.gameOver) {
      return;
    }

    // ステージ全体を走査して、閉じたシャッター上の当たり判定を確認する。
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

  // USB は本体が未取得の USB マスに乗ったときだけ回収できる。
  function collectUsbIfPossible() {
    const world = readWorld();
    if (world.usb && !world.usb.collected && world.player.x === world.usb.x && world.player.y === world.usb.y) {
      world.usb.collected = true;
      world.player.carryingUsb = true;
      world.message = "USBメモリを回収した。頭に戻そう。";
    }
  }

  // USB を持った本体が頭に隣接したら、自動で頭へ挿入する。
  function tryInsertUsbIntoHead() {
    const world = readWorld();
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

  // ゴール条件を満たしたかを確認し、クリア状態を更新する。
  function updateClearState() {
    const world = readWorld();
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

  // 横移動時だけ、1 マス段差を登れるかを判定して適用する。
  function tryStepUp(dx, dy, blockingBox = null) {
    const world = readWorld();
    if (dy !== 0 || !isGrounded(world.player)) {
      return false;
    }

    const targetX = world.player.x + dx;
    const climbY = world.player.y - 1;
    if (climbY < 0) {
      return false;
    }

    // まず現在位置の上と移動先の上が空いているかを見る。
    if (isSolidTile(world.player.x, climbY) || hasDetachedHeadAt(world.player.x, climbY) || getBoxAt(world.player.x, climbY)) {
      return false;
    }
    if (isSolidTile(targetX, climbY) || hasDetachedHeadAt(targetX, climbY)) {
      return false;
    }

    // 段差の上に重い箱や別の箱がある場合は登れない。
    const boxAbove = getBoxAt(targetX, climbY);
    if (boxAbove || (blockingBox && blockingBox.type === "heavy")) {
      return false;
    }

    // 段差を登った後も、USB・クリア・圧死判定は通常移動と同じく更新する。
    world.player.x = targetX;
    world.player.y = climbY;
    world.player.jumpVisual = 0.32;
    world.player.lastGroundedAt = 0;
    collectUsbIfPossible();
    tryInsertUsbIntoHead();
    updateClearState();
    checkShutterCrush();
    return true;
  }

  // 歩行・箱押し・頭の回収を解決し、移動後の状態もまとめて更新する。
  function tryMovePlayer(dx, dy) {
    const world = readWorld();
    if (world.cleared || world.gameOver || readMode() !== "play") {
      return;
    }

    const targetX = world.player.x + dx;
    const targetY = world.player.y + dy;

    // 壁や箱にぶつかったときは、まず段差登りができるかを試す。
    const targetBox = getBoxAt(targetX, targetY);
    if (isSolidTile(targetX, targetY) || targetBox) {
      if (tryStepUp(dx, dy, targetBox)) {
        return;
      }
    }

    if (isSolidTile(targetX, targetY)) {
      return;
    }

    // 軽い箱だけは 1 マス先が空いていれば押せる。
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

    // 頭の上に戻ったら自動で再装着する。
    if (!world.player.hasHead && world.head.x === targetX && world.head.y === targetY) {
      world.player.hasHead = true;
      world.head.attached = true;
      world.message = "頭を回収した。";
    }

    world.player.x = targetX;
    world.player.y = targetY;

    collectUsbIfPossible();
    tryInsertUsbIntoHead();
    updateClearState();
    checkShutterCrush();
  }

  // 接地直後の猶予時間と入力バッファを考慮したジャンプ可否判定。
  function canPlayerJump(timestamp) {
    const world = readWorld();
    return isGrounded(world.player) || timestamp <= world.player.lastGroundedAt + coyoteTimeMs;
  }

  // 通常ジャンプまたは強化ジャンプを適用し、関連状態を更新する。
  function tryJumpPlayer(timestamp) {
    const world = readWorld();
    if (world.cleared || world.gameOver || readMode() !== "play") {
      return;
    }
    if (!canPlayerJump(timestamp)) {
      return;
    }

    // 磁力条件を満たしていれば 2 マスジャンプになる。
    const boosted = canRepelBoostJump() || canAttractBoostJump();
    const targetHeight = boosted ? 2 : 1;
    const path = Array.from({ length: targetHeight }, (_, index) => world.player.y - (index + 1));
    // 2 マスジャンプだけ通らない場合は、1 マスジャンプができるかを試す。
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
        tryInsertUsbIntoHead();
        updateClearState();
        checkShutterCrush();
      }
      return;
    }

    world.player.y -= targetHeight;
    world.player.jumpVisual = boosted ? 1 : 0.5;
    world.player.lastGroundedAt = 0;
    world.player.jumpQueuedUntil = 0;
    collectUsbIfPossible();
    tryInsertUsbIntoHead();
    updateClearState();
    checkShutterCrush();
  }

  // Space で頭をその場に置くか、同じ位置にある頭を再装着する。
  function toggleHead() {
    const world = readWorld();
    if (world.cleared || world.gameOver || readMode() !== "play") {
      return;
    }

    // 装着中なら、その場に頭を落として分離状態にする。
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

    // 分離した頭と同じ位置まで戻れば再装着できる。
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

  // 磁力で 1 マス動かす方向を、距離の大きい軸に沿って決める。
  function getMagnetStep(dx, dy, modeName) {
    const primaryAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    let stepDx = 0;
    let stepDy = 0;

    if (primaryAxis === "x") {
      stepDx = Math.sign(dx);
    } else {
      stepDy = Math.sign(dy);
    }

    // 斥力のときはベクトルを反転させる。
    if (modeName === "repel") {
      stepDx *= -1;
      stepDy *= -1;
    }

    if (stepDx === 0 && stepDy === 0) {
      return null;
    }
    return { dx: stepDx, dy: stepDy };
  }

  // 磁力を 1 回ぶん適用して、箱や頭の移動を解決する。
  function stepMagnet(modeName) {
    const world = readWorld();
    if (world.cleared || world.gameOver || readMode() !== "play") {
      return;
    }

    const headPos = getHeadPosition();
    let movedSomething = false;
    let movedPlayerByHeavyBox = false;
    // 重い箱は最も近い 1 個だけが効果対象になる。
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

      // 射程外の箱は吸着状態も解除する。
      if (distance === 0 || distance > 3) {
        box.attached = false;
        return;
      }

      // 重い箱は箱自体ではなく、ロボ側を動かす。
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
        // 本体に装着中か、分離頭かで動かせる対象が変わる。
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
            tryInsertUsbIntoHead();
            updateClearState();
          }
        }
        return;
      }

      // 軽い箱は引力時だけ隣接で吸着状態になる。
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

      // 軽い箱は 1 マス先が空いていればその方向へ動かす。
      const nextX = box.x + step.dx;
      const nextY = box.y + step.dy;
      if (isOccupied(nextX, nextY, box)) {
        return;
      }

      box.x = nextX;
      box.y = nextY;
      movedSomething = true;
    });

    // 頭が分離中なら、近くの金属に引かれて頭自身も移動できる。
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

    // 実際に何か動いたときだけ、直近の行動メッセージを更新する。
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

  // 重力を 1 回ぶん適用して、落下を解決する。
  function stepGravity() {
    const world = readWorld();
    // 下にいるものから順に処理して、同じ更新内ですり抜けないようにする。
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

      // タイル・箱・頭・プレイヤーのどれかに塞がれていれば落ちない。
      if (blockedByTile || blockedByBox || blockedByHead || blockedByPlayer) {
        return;
      }

      entity.y = nextY;
      moved = true;
    });

    if (moved) {
      collectUsbIfPossible();
      tryInsertUsbIntoHead();
      updateClearState();
      checkShutterCrush();
    }
  }

  // 入力を順番待ちの配列に入れて、1 回ずつ処理する。
  function queueMove(key) {
    moveQueue.push(key);
  }

  // 順番待ちの入力を 1 件だけ取り出して、移動やジャンプへ変換する。
  function processInput() {
    const world = readWorld();
    // プレイ中以外やゲームオーバー中は入力を捨てる。
    if (readMode() !== "play" || world.gameOver) {
      moveQueue.length = 0;
      return;
    }

    const next = moveQueue.shift();
    // 入力がないフレームでも、ジャンプバッファ中ならジャンプを試す。
    if (!next) {
      if (world.player.jumpQueuedUntil > 0 && readSceneTime() <= world.player.jumpQueuedUntil && canPlayerJump(readSceneTime())) {
        tryJumpPlayer(readSceneTime());
      }
      return;
    }

    if (next === "up") {
      world.player.jumpQueuedUntil = readSceneTime() + jumpBufferMs;
      tryJumpPlayer(readSceneTime());
    }
    if (next === "down") {
      tryMovePlayer(0, 1);
    }
    // 左右入力は向きも同時に更新する。
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

  // ボタンは本体・箱・分離した頭のいずれかが乗ると押下扱いになる。
  function isShutterPressed(group) {
    const world = readWorld();
    return world.stage.grid.some((row, y) =>
      row.split("").some((cell, x) => {
        if (cell !== group.button) {
          return false;
        }
        return (
          (world.player.x === x && world.player.y === y) ||
          world.boxes.some((box) => box.x === x && box.y === y) ||
          (!world.player.hasHead && world.head.x === x && world.head.y === y)
        );
      })
    );
  }

  return {
    stepGravity,
    stepMagnet,
    isGrounded,
    isShutterPressed,
    processInput,
    queueMove,
    syncRenderPositions,
    toggleHead,
    updateRenderPositions,
  };
}
