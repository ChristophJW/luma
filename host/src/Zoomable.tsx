/**
 * Pinch-to-zoom and pan for a single photograph.
 *
 * Gestures run on the UI thread through Reanimated worklets. On the JS thread
 * a pinch trails the fingers by a frame or two, which reads as the app being
 * slow rather than as an animation choice.
 *
 * Zoom state is reported upward so a parent can stand down conflicting
 * gestures — a lightbox must stop offering "next photo" the moment a finger
 * is dragging a zoomed image around.
 */

import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
/** Double-tap jumps here, which is enough to read a face across a room. */
const DOUBLE_TAP_SCALE = 2.5;

export function Zoomable({
  children,
  onZoomedChange,
}: {
  children: ReactNode;
  /** Fires when the image leaves or returns to its resting size. */
  onZoomedChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  function report(zoomed: boolean) {
    onZoomedChange?.(zoomed);
  }

  function reset() {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(report)(false);
  }

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      "worklet";
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      "worklet";
      // Snapping back below 1 rather than allowing it means the photograph
      // always returns to filling its frame, never floating undersized.
      if (scale.value <= MIN_SCALE) {
        reset();
        return;
      }
      savedScale.value = scale.value;
      runOnJS(report)(true);
    });

  const pan = Gesture.Pan()
    // One finger panning a photograph at rest would fight the parent's
    // swipe-to-next, so panning only exists once zoomed in.
    .minPointers(1)
    .onUpdate((event) => {
      "worklet";
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      "worklet";
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      "worklet";
      if (scale.value > MIN_SCALE) {
        reset();
        return;
      }
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      savedScale.value = DOUBLE_TAP_SCALE;
      runOnJS(report)(true);
    });

  // Pinch and pan run together; the double tap has to win outright, or a
  // second tap gets swallowed by the pan recogniser.
  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
