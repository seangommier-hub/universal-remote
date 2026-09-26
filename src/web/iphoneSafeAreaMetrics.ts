import type { Metrics } from "react-native-safe-area-context";

const IPHONE_17_WIDTH = 393;
const IPHONE_17_HEIGHT = 852;
const IPHONE_17_TOP_INSET = 62;
const IPHONE_17_BOTTOM_INSET = 34;

/** Safe-area metrics of an iPhone 17 so web paddings match the phone. */
export const IPHONE_17_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: IPHONE_17_WIDTH, height: IPHONE_17_HEIGHT },
  insets: { top: IPHONE_17_TOP_INSET, bottom: IPHONE_17_BOTTOM_INSET, left: 0, right: 0 },
};
