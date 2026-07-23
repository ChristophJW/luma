/**
 * Reanimated 4 moves its worklet transform into `react-native-worklets`, so
 * that plugin is required and must stay last in the list.
 *
 * Without it, every animation silently runs on the JavaScript thread — pinch
 * zoom lags behind the finger rather than failing outright, which is the
 * worst kind of misconfiguration.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
