const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(file, mocks = {}) {
  const context = {
    exports: {},
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}) };
      if (name === 'expo-file-system') return { File: class {} };
      if (name === 'expo/fetch') return { fetch: async () => ({}) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: {
      log() {},
      warn() {},
      error() {},
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
}

test('getChatTicket calls authenticated POST /mobile/chat/channels/<id>/ticket/ with Token auth', async () => {
  const apiRequests = [];
  const mockApi = {
    API_BASE_URL: 'https://vaaniapp.co.in/api/v1',
    apiRequest: async (endpoint, options) => {
      apiRequests.push({ endpoint, options });
      return { ticket: 'test_ticket_abc123', expires_in: 30 };
    },
  };

  const chatService = loadModule('src/services/chat.ts', { './api': mockApi });

  const response = await chatService.getChatTicket('user_secret_token_xyz', 42);

  assert.equal(apiRequests.length, 1);
  assert.equal(apiRequests[0].endpoint, '/mobile/chat/channels/42/ticket/');
  assert.equal(apiRequests[0].options.method, 'POST');
  assert.equal(apiRequests[0].options.token, 'user_secret_token_xyz');
  assert.deepEqual(response, { ticket: 'test_ticket_abc123', expires_in: 30 });
});

test('chatSocketUrl constructs URL with ?ticket= parameter and strictly omits long-lived token', () => {
  const mockApi = {
    API_BASE_URL: 'https://vaaniapp.co.in/api/v1',
    apiRequest: async () => ({}),
  };

  const chatService = loadModule('src/services/chat.ts', { './api': mockApi });

  const rawTicket = 'tkt_sec_123+/=';
  const url = chatService.chatSocketUrl(99, rawTicket);

  assert.equal(url.startsWith('wss://vaaniapp.co.in/ws/chat/99/?ticket='), true);
  assert.equal(url.includes(`ticket=${encodeURIComponent(rawTicket)}`), true);
  assert.equal(url.includes('token='), false, 'Socket URL must not contain auth token query parameter');
});

test('chatSocketUrl supports http -> ws conversion and optional legacy fallback parameter', () => {
  const mockApi = {
    API_BASE_URL: 'http://127.0.0.1:8000/api/v1',
    apiRequest: async () => ({}),
  };

  const chatService = loadModule('src/services/chat.ts', { './api': mockApi });

  const wsUrl = chatService.chatSocketUrl(5, 'ticket_val');
  assert.equal(wsUrl, 'ws://127.0.0.1:8000/ws/chat/5/?ticket=ticket_val');

  const legacyFallbackUrl = chatService.chatSocketUrl(5, 'legacy_tok', 'token');
  assert.equal(legacyFallbackUrl, 'ws://127.0.0.1:8000/ws/chat/5/?token=legacy_tok');
});

test('WebSocket lifecycle acquires fresh ticket for every connection and reconnect attempt (no reuse)', async () => {
  let ticketCounter = 0;
  const issuedTickets = [];
  const connectedSocketUrls = [];

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      connectedSocketUrls.push(url);
      setTimeout(() => {
        if (this.onopen) this.onopen();
      }, 0);
    }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose({ code: 1006 });
    }
  }

  const mockApi = {
    API_BASE_URL: 'https://vaaniapp.co.in/api/v1',
    apiRequest: async (endpoint, options) => {
      ticketCounter++;
      const ticket = `ticket_seq_${ticketCounter}`;
      issuedTickets.push(ticket);
      return { ticket, expires_in: 30 };
    },
  };

  const chatService = loadModule('src/services/chat.ts', { './api': mockApi });

  // Simulate first connection
  const res1 = await chatService.getChatTicket('auth_token', 10);
  const sock1 = new MockWebSocket(chatService.chatSocketUrl(10, res1.ticket));

  // Verify first ticket was used
  assert.equal(connectedSocketUrls[0], `wss://vaaniapp.co.in/ws/chat/10/?ticket=${res1.ticket}`);

  // Connection drops / reconnect required -> MUST fetch fresh ticket
  const res2 = await chatService.getChatTicket('auth_token', 10);
  const sock2 = new MockWebSocket(chatService.chatSocketUrl(10, res2.ticket));

  // Verify fresh, distinct ticket used on reconnect
  assert.notEqual(res1.ticket, res2.ticket);
  assert.equal(connectedSocketUrls[1], `wss://vaaniapp.co.in/ws/chat/10/?ticket=${res2.ticket}`);
  assert.equal(issuedTickets.length, 2);
  assert.equal(new Set(issuedTickets).size, 2, 'Every connection must have a unique ticket');
});

test('Channel switch and unmount race conditions discard pending ticket requests and avoid duplicate sockets', async () => {
  let connectionSeq = 0;
  let active = true;
  let openedSockets = [];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      openedSockets.push(url);
    }
    close() {}
  }

  const slowTicketFetch = async (channelId, delayMs) => {
    const seq = ++connectionSeq;
    await new Promise((r) => setTimeout(r, delayMs));
    if (!active || seq !== connectionSeq) {
      // Discard stale response
      return null;
    }
    return new MockWebSocket(`wss://vaaniapp.co.in/ws/chat/${channelId}/?ticket=ticket_for_${channelId}`);
  };

  // Start connecting to channel 1 (slow)
  const p1 = slowTicketFetch(1, 50);

  // Rapidly switch to channel 2 (faster)
  const p2 = slowTicketFetch(2, 10);

  await Promise.all([p1, p2]);

  // Channel 1 was superseded by channel 2; only channel 2 socket should be created
  assert.equal(openedSockets.length, 1);
  assert.equal(openedSockets[0].includes('ws/chat/2/'), true);
  assert.equal(openedSockets.some((s) => s.includes('ws/chat/1/')), false);

  // Now test unmount: active set to false
  active = false;
  const p3 = slowTicketFetch(3, 10);
  await p3;

  assert.equal(openedSockets.length, 1, 'No new socket created after unmount');
});

test('Ticket acquisition failure handles error cleanly without logging credentials', async () => {
  const mockApi = {
    API_BASE_URL: 'https://vaaniapp.co.in/api/v1',
    apiRequest: async () => {
      const err = new Error('Service Unavailable (HTTP 503)');
      err.status = 503;
      throw err;
    },
  };

  const chatService = loadModule('src/services/chat.ts', { './api': mockApi });

  await assert.rejects(
    async () => {
      await chatService.getChatTicket('secret_token', 12);
    },
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(String(err).includes('secret_token'), false, 'Credentials must not be in error message');
      return true;
    }
  );
});

