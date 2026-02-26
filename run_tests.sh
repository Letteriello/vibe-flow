#!/bin/bash
cd /c/Users/gabri/Desktop/Claude\ Code/vibe-flow
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=state-machine 2>&1 > /tmp/test_output.log
echo "Exit code: $?" >> /tmp/test_output.log
cat /tmp/test_output.log
