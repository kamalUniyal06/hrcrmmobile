const React = require('react');
const { Text } = require('react-native');

const Ionicons = ({ name, ...props }) => React.createElement(Text, { ...props, testID: `icon-${name}` }, name);

module.exports = { Ionicons, default: Ionicons };
