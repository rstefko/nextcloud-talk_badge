(function () {
    'use strict';
    if (!/(?:^|\/)apps\/spreed(?:\/|$)/.test(window.location.pathname)) return;
    if (!('setAppBadge' in navigator) || !('clearAppBadge' in navigator)) return;

    const intervalMs = 60000;
    let timer = null;
    let busy = false;
    let lastCount = null;

    function endpoint() {
        if (window.OC && typeof window.OC.generateUrl === 'function') {
            return window.OC.generateUrl('/ocs/v2.php/apps/spreed/api/v4/room');
        }
        return ((window.OC && window.OC.webroot) || '') +
            '/ocs/v2.php/apps/spreed/api/v4/room';
    }

    async function refreshBadge() {
        if (busy || document.visibilityState === 'hidden') return;
        busy = true;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(endpoint(), {
                credentials: 'same-origin',
                headers: {'Accept': 'application/json', 'OCS-APIRequest': 'true'},
                signal: controller.signal
            });
            if (!response.ok) throw new Error('Talk API HTTP ' + response.status);

            const json = await response.json();
            const rooms = json && json.ocs && json.ocs.data;
            if (!Array.isArray(rooms)) throw new Error('Unexpected Talk API response');

            const count = rooms.reduce((sum, room) => {
                const n = Number(room && room.unreadMessages);
                return sum + (Number.isFinite(n) && n > 0 ? n : 0);
            }, 0);

            if (count !== lastCount) {
                lastCount = count;
                if (count > 0) await navigator.setAppBadge(count);
                else await navigator.clearAppBadge();
            }
        } catch (error) {
            if (error.name !== 'AbortError') console.debug('[Talk Badge]', error);
        } finally {
            window.clearTimeout(timeout);
            busy = false;
        }
    }

    function start() {
        if (timer !== null) window.clearInterval(timer);
        refreshBadge();
        timer = window.setInterval(refreshBadge, intervalMs);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshBadge();
    });
    window.addEventListener('focus', refreshBadge);
    window.addEventListener('online', refreshBadge);
    start();
})();
