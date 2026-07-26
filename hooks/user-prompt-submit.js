#!/usr/bin/env node
"use strict";

const { writeState } = require("./turn-state.js");

// New user turn: forget last turn's violation count, delegation flag, and dispatch log.
writeState({ violations: 0, delegatedThisTurn: false, dispatches: [] });

process.exit(0);
