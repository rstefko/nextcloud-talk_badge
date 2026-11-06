(function () {
    'use strict';
    if (!isTalkPage()) return;
    if (!('setAppBadge' in navigator) || !('clearAppBadge' in navigator)) return;

    const originalFetch = window.fetch;
    let busy = false;
    let refreshPending = false;
    let lastCount = null;

    function isTalkPage() {
        return /(?:^|\/)(?:apps\/spreed|call)(?:\/|$)/.test(window.location.pathname);
    }

    function endpoint() {
        if (window.OC && typeof window.OC.generateUrl === 'function') {
            return window.OC.generateUrl('/ocs/v2.php/apps/spreed/api/v4/room');
        }
        return ((window.OC && window.OC.webroot) || '') +
            '/ocs/v2.php/apps/spreed/api/v4/room';
    }

    function isTalkRequest(input) {
        try {
            const url = new URL(
                typeof input === 'string' || input instanceof URL ? input : input.url,
                window.location.href
            );
            return url.origin === window.location.origin &&
                /\/ocs\/v[12]\.php\/apps\/(?:spreed\/api\/v1\/chat\/[^/]+\/read\/?|notifications\/api\/v\d+\/notifications(?:\/[^/]+)?\/?)$/.test(url.pathname);
        } catch (error) {
            console.debug('[Talk Badge] Could not inspect request URL', error);
            return false;
        }
    }

    async function refreshBadge() {
        if (document.visibilityState === 'hidden' || !isTalkPage()) return;
        if (busy) {
            refreshPending = true;
            return;
        }
        busy = true;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);

        try {
            const response = await originalFetch.call(window, endpoint(), {
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
                if (count > 0) await navigator.setAppBadge(count);
                else await navigator.clearAppBadge();
                lastCount = count;
            }
        } catch (error) {
            if (error.name !== 'AbortError') console.debug('[Talk Badge]', error);
        } finally {
            window.clearTimeout(timeout);
            busy = false;
            if (refreshPending) {
                refreshPending = false;
                refreshBadge();
            }
        }
    }

    window.fetch = function (...args) {
        const request = originalFetch.apply(this, args);
        if (!isTalkRequest(args[0])) return request;
        return request.then(response => {
            if (response.ok) refreshBadge();
            return response;
        });
    };

    const talkRequests = new WeakMap();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (...args) {
        const result = originalOpen.apply(this, args);
        talkRequests.set(this, isTalkRequest(args[1]));
        return result;
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (talkRequests.get(this)) {
            this.addEventListener('loadend', () => {
                if (this.status >= 200 && this.status < 300) refreshBadge();
            }, {once: true});
        }
        return originalSend.apply(this, args);
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshBadge();
    });
    window.addEventListener('focus', refreshBadge);
    window.addEventListener('online', refreshBadge);
    window.setInterval(refreshBadge, 90000);
    refreshBadge();
})();
