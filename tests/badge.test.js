const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/badge.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const roomUrl = '/ocs/v2.php/apps/spreed/api/v4/room';
const readUrl = '/ocs/v2.php/apps/spreed/api/v1/chat/token/read';

function setup(pathname = '/apps/spreed/') {
    const calls = [];
    const badges = [];
    const errors = [];
    const events = {};
    const timers = new Map();
    const intervals = [];
    let elapsed = 0;
    let timerId = 0;
    class XHR extends EventTarget {
        open(...args) {
            this.openArgs = args;
        }
        send(...args) {
            this.sendArgs = args;
        }
        complete(status) {
            this.status = status;
            this.dispatchEvent(new Event('loadend'));
        }
    }
    const originalFetch = function (...args) {
        return new Promise((resolve, reject) => {
            calls.push({receiver: this, args, resolve, reject});
        });
    };
    const window = {
        location: new URL(pathname, 'https://cloud.example'),
        fetch: originalFetch,
        setTimeout(fn, delay) {
            timers.set(++timerId, {fn, delay});
            return timerId;
        },
        clearTimeout(id) { timers.delete(id); },
        setInterval(fn, delay) {
            intervals.push({fn, delay, next: elapsed + delay});
            return ++timerId;
        },
        addEventListener(name, fn) { events[name] = fn; }
    };
    const document = {
        visibilityState: 'visible',
        addEventListener(name, fn) { events[name] = fn; }
    };
    vm.runInNewContext(source, {
        window, document, URL, XMLHttpRequest: XHR, AbortController,
        console: {debug(...args) { errors.push(args); }},
        navigator: {
            async setAppBadge(count) { badges.push(count); },
            async clearAppBadge() { badges.push(0); }
        }
    });
    return {
        window, document, XHR, calls, badges, errors, timers, events, originalFetch,
        advance(ms) {
            elapsed += ms;
            for (const interval of intervals) {
                while (interval.next <= elapsed) {
                    interval.next += interval.delay;
                    interval.fn();
                }
            }
        },
        async rooms(index, count) {
            calls[index].resolve({
                ok: true,
                json: async () => ({ocs: {data: [{unreadMessages: 0}, {unreadMessages: count}]}})
            });
            await flush();
        }
    };
}

test('XHR read immediately updates badge from 3 to 1', async () => {
    const s = setup('/call/token');
    await s.rooms(0, 3);
    const xhr = new s.XHR();
    xhr.open('POST', readUrl, true);
    xhr.send('payload');
    assert.deepEqual(xhr.openArgs, ['POST', readUrl, true]);
    assert.deepEqual(xhr.sendArgs, ['payload']);
    xhr.complete(200);
    assert.equal(s.calls.length, 2);
    await s.rooms(1, 1);
    assert.deepEqual(s.badges, [3, 1]);
    assert.equal(s.calls.length, 2, 'badge request must not trigger itself');
    assert.equal(s.timers.size, 0, 'only in-flight request timeouts are allowed');
    xhr.complete(200);
    assert.equal(s.calls.length, 2, 'XHR completion listener runs once');
});

test('fetch preserves request arguments and response body', async () => {
    const s = setup();
    await s.rooms(0, 3);
    const input = new Request('https://cloud.example' + readUrl, {method: 'POST'});
    const options = {credentials: 'same-origin'};
    const pending = s.window.fetch(input, options);
    assert.equal(s.calls[1].args[0], input);
    assert.equal(s.calls[1].args[1], options);
    assert.equal(s.calls[1].receiver, s.window);
    const response = new Response('untouched');
    s.calls[1].resolve(response);
    assert.equal(await pending, response);
    assert.equal(await response.text(), 'untouched');
    assert.equal(s.calls.length, 3);
    await s.rooms(2, 0);
    assert.deepEqual(s.badges, [3, 0]);
});

test('overlapping Talk completions queue just one follow-up refresh', async () => {
    const s = setup();
    const xhr = new s.XHR();
    for (let i = 0; i < 3; i++) {
        xhr.open('POST', readUrl);
        xhr.send();
        xhr.complete(200);
    }
    assert.equal(s.calls.length, 1);
    await s.rooms(0, 3);
    assert.equal(s.calls.length, 2);
    await s.rooms(1, 1);
    assert.deepEqual(s.badges, [3, 1]);
    assert.equal(s.calls.length, 2);
});

test('ignores unrelated, cross-origin and failed requests', async () => {
    const s = setup();
    await s.rooms(0, 1);
    for (const [url, status] of [
        ['/ocs/v2.php/apps/files/api/v1/room', 200],
        ['https://other.example' + readUrl, 200],
        [roomUrl + 'mate', 200],
        [roomUrl, 200],
        ['/ocs/v2.php/apps/spreed/api/v1/chat/token', 200],
        [readUrl + '/extra', 200],
        [readUrl.replace('/v1/chat/', '/v2/chat/'), 200],
        ['/ocs/v2.php/apps/spreed/api/v1/chat//read', 200],
        ['/ocs/v2.php/apps/spreed/api/v1/notifications', 200],
        ['/ocs/v2.php/apps/notifications/api/v2/chat/token/read', 200],
        [readUrl, 500],
        [readUrl, 0]
    ]) {
        const xhr = new s.XHR();
        xhr.open('GET', url);
        xhr.send();
        xhr.complete(status);
    }
    assert.equal(s.calls.length, 1);
    const failed = s.window.fetch(readUrl);
    const response = new Response('', {status: 500});
    s.calls[1].resolve(response);
    assert.equal(await failed, response);
    assert.equal(s.calls.length, 2);
    const rejected = s.window.fetch(readUrl);
    const error = new Error('offline');
    s.calls[2].reject(error);
    await assert.rejects(rejected, value => value === error);
    assert.equal(s.calls.length, 3);
});

test('visibility and route guards remain active', async () => {
    const inactive = setup('/apps/files/');
    assert.equal(inactive.window.fetch, inactive.originalFetch);
    assert.equal(inactive.calls.length, 0);
    const s = setup();
    await s.rooms(0, 1);
    s.document.visibilityState = 'hidden';
    const xhr = new s.XHR();
    xhr.open('POST', readUrl);
    xhr.send();
    xhr.complete(200);
    assert.equal(s.calls.length, 1);
    s.document.visibilityState = 'visible';
    s.events.visibilitychange();
    await s.rooms(1, 0);
    s.window.location = new URL('https://cloud.example/apps/files/');
    s.events.focus();
    s.advance(90000);
    assert.equal(s.calls.length, 2);
});

test('notification and read-marker requests trigger immediate refreshes', async () => {
    const s = setup();
    await s.rooms(0, 0);
    for (const url of [
        '/ocs/v2.php/apps/notifications/api/v2/notifications',
        '/ocs/v2.php/apps/notifications/api/v2/notifications/42',
        '/nextcloud/ocs/v1.php/apps/spreed/api/v1/chat/token/read?format=json'
    ]) {
        const before = s.calls.length;
        const pending = s.window.fetch(url);
        s.calls[before].resolve(new Response(''));
        await pending;
        assert.equal(s.calls.length, before + 2, url);
        await s.rooms(before + 1, 1);
    }
});

test('fallback refreshes at 90 seconds and skips hidden pages', async () => {
    const s = setup();
    await s.rooms(0, 3);
    s.advance(89999);
    assert.equal(s.calls.length, 1);
    s.advance(1);
    assert.equal(s.calls.length, 2);
    await s.rooms(1, 1);
    assert.deepEqual(s.badges, [3, 1]);
    s.document.visibilityState = 'hidden';
    s.advance(90000);
    assert.equal(s.calls.length, 2);
    s.document.visibilityState = 'visible';
    s.events.visibilitychange();
    await s.rooms(2, 0);
    assert.deepEqual(s.badges, [3, 1, 0]);
});

test('failed badge refresh logs and can be retried on focus', async () => {
    const s = setup();
    s.calls[0].reject(new Error('offline'));
    await flush();
    assert.equal(s.errors.length, 1);
    assert.equal(s.timers.size, 0);
    s.events.focus();
    await s.rooms(1, 1);
    assert.deepEqual(s.badges, [1]);
});
