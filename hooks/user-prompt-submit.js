#!/usr/bin/env node
"use strict";

const { writeState } = require("./turn-state.js");

// New user turn: forget last turn's violation count and delegation flag.
writeState({ violations: 0, delegatedThisTurn: false });

process.exit(0);
