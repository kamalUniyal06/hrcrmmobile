const React = require('react');
const { View } = require('react-native');

const insets = { top: 0, right: 0, bottom: 0, left: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const SafeAreaProvider = ({ children }) => React.createElement(React.Fragment, null, children);
const SafeAreaView = React.forwardRef(({ edges, ...props }, ref) => React.createElement(View, { ...props, ref }));
SafeAreaView.displayName = 'SafeAreaView';

module.exports = {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaInsetsContext: React.createContext(insets),
  SafeAreaFrameContext: React.createContext(frame),
  useSafeAreaInsets: () => insets,
  useSafeAreaFrame: () => frame,
  initialWindowMetrics: { insets, frame },
};
