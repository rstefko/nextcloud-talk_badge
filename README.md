# Nextcloud Talk Badge

Client-side Nextcloud app that totals `unreadMessages` across Talk conversations and updates the installed Chrome PWA icon through the Badging API.

## Install

1. Extract `talk_badge` into your Nextcloud `custom_apps` directory.
2. Enable it with `occ app:enable talk_badge` or in **Apps > Your apps**.
3. Reload the installed Chrome PWA.

## How it works

- Runs only on Talk pages (`/apps/spreed` and `/call`, including their subpaths).
- Calls `/ocs/v2.php/apps/spreed/api/v4/room` using the logged-in session.
- Sums each conversation's `unreadMessages`.
- Refreshes after successful same-origin `/apps/spreed/api/v1/chat/{token}/read` and `/apps/notifications/api/v*/notifications` requests (including individual notification subpaths) made through XHR or `fetch`. Other chat and room requests do not trigger refreshes.
- Falls back to refreshing every 90 seconds while visible on a Talk page. Read-marker and notification triggers refresh immediately, independently of this timer.
- Each refresh makes an additional room-list request to calculate the complete unread total. The plugin's own requests do not trigger further refreshes; overlapping triggers queue one follow-up.
- Does not send notifications. API failures preserve the last known badge.

## Limitations

- Updates depend on request triggers and the fallback timer while the PWA is running and visible. The plugin cannot update after the PWA has been fully quit.
- Talk's API only supplies `unreadMessages` when the relevant chat capability is available.
- Requests made before the plugin loads or through previously captured network functions cannot be observed. Reload the PWA after installing or updating the plugin.

## Tests

With Node.js 18 or newer, run `node --test tests/badge.test.js`.
