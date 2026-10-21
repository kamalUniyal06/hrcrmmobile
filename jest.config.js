module.exports = {
  preset: '@react-native/jest-preset',
  // These packages ship untranspiled ES modules.
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|react-native-.*|@react-native-.*)',
  ],
};
