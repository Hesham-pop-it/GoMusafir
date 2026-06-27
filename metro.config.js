const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude the website folder and redundant react-native copies
config.resolver.blockList = /GoMusafir-Website\/.*|node_modules\/.*\/node_modules\/react-native\/.*/;

module.exports = config;
