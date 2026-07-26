"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const STATE_PATH = path.join(os.homedir(), ".claude", "orch.turn-state.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { violations: 0, delegatedThisTurn: false, dispatches: [] };
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch {
    // best-effort — a failed write just means nudges reset to defaults next call
  }
}

module.exports = { readState, writeState };
