export const TILE = 64;
export const MIN_TILE = 18;
export const DISPLAY_TILE = 96;
export const DEFAULT_STAGE_COLUMNS = 20;
export const DEFAULT_STAGE_ROWS = 20;
export const MIN_STAGE_SIZE = 6;
export const MAX_STAGE_SIZE = 40;
export const STAGE_STORAGE_VERSION = 2;
export const MAGNET_INTERVAL = 500;
export const GRAVITY_INTERVAL = 180;
export const JUMP_BUFFER_MS = 140;
export const COYOTE_TIME_MS = 120;
export const CHARACTER_RENDER_SCALE = 1.3;
export const HEAD_RENDER_SCALE = 0.7;
export const HEAD_RENDER_Y_OFFSET = 0.1;
export const DETACHED_HEAD_RENDER_Y_OFFSET = 0.12;

export const assetUrls = {
  robotHeadLeft: new URL("../assets/robot-head2.PNG", import.meta.url).href,
  robotHeadRight: new URL("../assets/robot-head2-right.PNG", import.meta.url).href,
  robotBody: new URL("../assets/robot-body3.PNG", import.meta.url).href,
  robotBodyMagnetic: new URL("../assets/robot-body3.PNG", import.meta.url).href,
  boxLight: new URL("../assets/box-light.png", import.meta.url).href,
  boxHeavy: new URL("../assets/H-Box.PNG", import.meta.url).href,
  boxLightAttached: new URL("../assets/box-light-attached.svg", import.meta.url).href,
  usb: new URL("../assets/usb.PNG", import.meta.url).href,
  usbPlug: new URL("../assets/usb-plug.svg", import.meta.url).href,
  goal: new URL("../assets/Goal.PNG", import.meta.url).href,
  wallBlock: new URL("../assets/block2-cold.PNG", import.meta.url).href,
  wallCapTop: new URL("../assets/wall-top.PNG", import.meta.url).href,
  wallCapRight: new URL("../assets/wall-right.PNG", import.meta.url).href,
  wallCapBottom: new URL("../assets/wall-bottom.PNG", import.meta.url).href,
  wallCapLeft: new URL("../assets/wall-left.PNG", import.meta.url).href,
  wallCornerTopLeft: new URL("../assets/wall-tl.PNG", import.meta.url).href,
  wallCornerTopRight: new URL("../assets/wall-tr.PNG", import.meta.url).href,
  wallCornerBottomRight: new URL("../assets/wall-rb.PNG", import.meta.url).href,
  wallCornerBottomLeft: new URL("../assets/wall-lb.PNG", import.meta.url).href,
  sceneLeft: new URL("../assets/scene-left.svg", import.meta.url).href,
  sceneRight: new URL("../assets/scene-right.svg", import.meta.url).href,
};

export const wallTileVariants = {
  "#": null,
  "1": "wallCapTop",
  "2": "wallCapRight",
  "3": "wallCapBottom",
  "4": "wallCapLeft",
  "5": "wallCornerTopLeft",
  "6": "wallCornerTopRight",
  "7": "wallCornerBottomRight",
  "8": "wallCornerBottomLeft",
};

export const paletteItems = [
  { key: ".", label: "Empty" },
  { key: "#", label: "Wall" },
  { key: "1", label: "Wall Top" },
  { key: "2", label: "Wall Right" },
  { key: "3", label: "Wall Bottom" },
  { key: "4", label: "Wall Left" },
  { key: "5", label: "Wall Corner TL" },
  { key: "6", label: "Wall Corner TR" },
  { key: "7", label: "Wall Corner BR" },
  { key: "8", label: "Wall Corner BL" },
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

export const singletonTiles = new Set(["P", "O", "U", "G"]);

export const shutterGroups = {
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
