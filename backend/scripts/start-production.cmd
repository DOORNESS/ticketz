@echo off
cd /d C:\ticketz\backend
set NODE_OPTIONS=--max-old-space-size=4096
node dist\server.js
