// jest-environment-jsdom-custom.cjs
const JsdomEnvironment = require('jest-environment-jsdom');

class JsdomCustomEnvironment extends JsdomEnvironment {
  constructor(config, options) {
    // Ensure testEnvironmentOptions exists to prevent JSDOM errors
    if (!config.testEnvironmentOptions) config.testEnvironmentOptions = {};
    if (typeof config.testEnvironmentOptions.html === 'undefined') {
      config.testEnvironmentOptions.html = '<!DOCTYPE html>';
    }
    // Optionally set a default userAgent or other options:
    if (typeof config.testEnvironmentOptions.userAgent === 'undefined') {
      config.testEnvironmentOptions.userAgent = 'node';
    }

    // Call parent constructor with the normalized config
    super(config, options);
  }
}

module.exports = JsdomCustomEnvironment;