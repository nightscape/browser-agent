// ==UserScript==
// @name         SensAI Widget
// @namespace    https://sensai.dev
// @version      0.1.0
// @description  Inject SensAI chat assistant into any page
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// CONFIGURE: Set this to your SensAI server URL.
const SENSAI_SERVER = "http://localhost:4222";

(function () {
  "use strict";
  const script = document.createElement("script");
  script.src = `${SENSAI_SERVER}/sensai-widget.iife.js`;
  script.onload = () => window.SensAI?.init({ serverUrl: SENSAI_SERVER });
  document.head.appendChild(script);
})();
