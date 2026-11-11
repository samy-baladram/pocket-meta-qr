Static files for the site root (folder static/ in the repo) (made by the UI chat, Nov 10, 2026). The deploy copies every file here to public/
(see HANDOFF.md, request R7). Icons: brand-gradient tile with the white QR glyph; favicon.svg/ico use a simpler glyph
for 16-32 px. og.png = link preview (1200x630).

sw.js (UI chat, Nov 12, 2026): service worker, registered by the page on pocketmetaqr.com only. It keeps c/, z/, p/, e/
images on the device (cache-first; data and page always from the network). Change VERSION in it to drop the stored images.
