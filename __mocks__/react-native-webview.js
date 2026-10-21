const React = require('react');
const { View } = require('react-native');

// Renders nothing native; tests only need the component to mount.
const WebView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref, testID: props.testID || 'webview' }));
WebView.displayName = 'WebView';

module.exports = { WebView, default: WebView };
