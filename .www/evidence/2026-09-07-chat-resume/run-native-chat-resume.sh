#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
bun .www/evidence/2026-09-07-chat-resume/native-chat-resume-probe.ts
