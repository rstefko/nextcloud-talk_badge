# Talk Badge 0.1.0

Client-side Nextcloud app that totals `unreadMessages` across Talk conversations and updates the installed Chrome PWA icon through the Badging API.

## Install

1. Extract `talk_badge` into your Nextcloud `custom_apps` directory.
2. Enable it with `occ app:enable talk_badge` or in **Apps > Your apps**.
3. Reload the installed Chrome PWA.

If your instance enforces app signing, this development ZIP is unsigned and must be signed using your instance's app-signing process.

## How it works

- Runs only on Talk pages.
- Calls `/ocs/v2.php/apps/spreed/api/v4/room` using the logged-in session.
- Sums each conversation's `unreadMessages`.
- Refreshes on load, focus, visibility change, reconnect, and every 60 seconds while visible.
- Does not send notifications. API failures preserve the last known badge.

## Limitations

- This polling approach updates while the PWA is running. It cannot guarantee updates after the PWA has been fully quit.
- Talk's API only supplies `unreadMessages` when the relevant chat capability is available.
