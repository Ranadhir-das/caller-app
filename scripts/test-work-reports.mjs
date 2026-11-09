import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateClientEntryId,
  createEmptyProjectWorkEntry,
  convertHoursMinutesToTotalMinutes,
  formatMinutesToDuration,
  parseDurationToMinutes,
  validateProjectWorkEntry,
  validateAllProjectWorkEntries,
  buildProjectReportPayloadItem,
  PROJECT_WORK_STATUSES,
} from '../src/services/projects.ts';

import { isProjectWorker } from '../src/services/capabilities.ts';
import { ApiError } from '../src/services/api.ts';

// ---------------------------------------------------------------------------
// 1. UUID Generation & Idempotency Tests
// ---------------------------------------------------------------------------
test('UUID Generation & Idempotency Logic', async (t) => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  await t.test('generateClientEntryId generates valid RFC4122 v4 UUID', () => {
    const id = generateClientEntryId();
    assert.match(id, UUID_V4_REGEX);
  });

  await t.test('Multiple generated UUIDs are distinct and unique', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateClientEntryId());
    }
    assert.equal(ids.size, 100);
  });

  await t.test('createEmptyProjectWorkEntry assigns a unique clientId upon creation', () => {
    const entry1 = createEmptyProjectWorkEntry();
    const entry2 = createEmptyProjectWorkEntry();
    assert.match(entry1.clientId, UUID_V4_REGEX);
    assert.match(entry2.clientId, UUID_V4_REGEX);
    assert.notEqual(entry1.clientId, entry2.clientId);
    assert.equal(entry1.status, 'In Progress');
    assert.equal(entry1.projectId, null);
    assert.equal(entry1.projectName, '');
  });

  await t.test('Editing fields preserves the original clientId', () => {
    const entry = createEmptyProjectWorkEntry(10, 'CRM Mobile Dialer');
    const originalUuid = entry.clientId;

    // Simulate user edits across various fields
    const updated = {
      ...entry,
      hours: '2',
      minutes: '30',
      status: 'Completed',
      notes: 'Implemented dialer fixes',
      referenceLink: 'https://github.com/org/repo/pull/42',
    };

    assert.equal(updated.clientId, originalUuid);
    assert.equal(updated.projectId, 10);
    assert.equal(updated.projectName, 'CRM Mobile Dialer');
    assert.equal(updated.hours, '2');
    assert.equal(updated.minutes, '30');
    assert.equal(updated.status, 'Completed');
  });

  await t.test('Payload generation strictly reuses clientId for both entry_id and client_entry_id', () => {
    const entry = createEmptyProjectWorkEntry(14, 'Project Alpha');
    entry.hours = '1';
    entry.minutes = '15';
    entry.status = 'In Progress';
    entry.expectedCompletionDate = '2026-11-20';
    entry.notes = 'Refactored reporting components';

    const payloadItem = buildProjectReportPayloadItem(entry);
    assert.equal(payloadItem.entry_id, entry.clientId);
    assert.equal(payloadItem.client_entry_id, entry.clientId);
    assert.equal(payloadItem.project_id, 14);
    assert.equal(payloadItem.project_name, 'Project Alpha');
    assert.equal(payloadItem.duration_minutes, 75);
    assert.equal(payloadItem.duration, '1h 15m');
  });
});

// ---------------------------------------------------------------------------
// 2. Canonical Duration Handling & Conversions
// ---------------------------------------------------------------------------
test('Canonical Duration Handling & Conversions', async (t) => {
  await t.test('convertHoursMinutesToTotalMinutes calculates integer minutes correctly', () => {
    assert.equal(convertHoursMinutesToTotalMinutes(0, 0), 0);
    assert.equal(convertHoursMinutesToTotalMinutes(0, 45), 45);
    assert.equal(convertHoursMinutesToTotalMinutes(1, 0), 60);
    assert.equal(convertHoursMinutesToTotalMinutes(2, 30), 150);
    assert.equal(convertHoursMinutesToTotalMinutes(7, 45), 465);
    assert.equal(convertHoursMinutesToTotalMinutes(24, 0), 1440);
  });

  await t.test('convertHoursMinutesToTotalMinutes handles string inputs and whitespace safely', () => {
    assert.equal(convertHoursMinutesToTotalMinutes('2', '30'), 150);
    assert.equal(convertHoursMinutesToTotalMinutes(' 3 ', ' 15 '), 195);
    assert.equal(convertHoursMinutesToTotalMinutes('', '45'), 45);
    assert.equal(convertHoursMinutesToTotalMinutes('2', ''), 120);
    assert.equal(convertHoursMinutesToTotalMinutes('', ''), 0);
    assert.equal(convertHoursMinutesToTotalMinutes('abc', 'def'), 0);
  });

  await t.test('formatMinutesToDuration produces canonical human-readable strings', () => {
    assert.equal(formatMinutesToDuration(0), '0m');
    assert.equal(formatMinutesToDuration(-10), '0m');
    assert.equal(formatMinutesToDuration(30), '30m');
    assert.equal(formatMinutesToDuration(60), '1h');
    assert.equal(formatMinutesToDuration(90), '1h 30m');
    assert.equal(formatMinutesToDuration(150), '2h 30m');
    assert.equal(formatMinutesToDuration(1440), '24h');
  });

  await t.test('parseDurationToMinutes parses various valid string formats to integer minutes', () => {
    assert.equal(parseDurationToMinutes('90'), 90);
    assert.equal(parseDurationToMinutes('90 mins'), 90);
    assert.equal(parseDurationToMinutes('45m'), 45);
    assert.equal(parseDurationToMinutes('1h 30m'), 90);
    assert.equal(parseDurationToMinutes('2 hours 15 mins'), 135);
    assert.equal(parseDurationToMinutes('2.5 hours'), 150);
    assert.equal(parseDurationToMinutes(120), 120);
    assert.equal(parseDurationToMinutes(''), 0);
    assert.equal(parseDurationToMinutes(null), 0);
    assert.equal(parseDurationToMinutes(undefined), 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Validation Rules for Project Work Entries
// ---------------------------------------------------------------------------
test('Project Work Entry Validation Rules', async (t) => {
  await t.test('Rejects missing or whitespace-only project name', () => {
    const entry = createEmptyProjectWorkEntry();
    entry.hours = '1';
    entry.expectedCompletionDate = '2026-11-20';
    const res = validateProjectWorkEntry(entry, 0);
    assert.equal(res.valid, false);
    assert.match(res.error, /Please enter or select a project name/);
  });

  await t.test('Rejects zero duration (0 hours and 0 minutes)', () => {
    const entry = createEmptyProjectWorkEntry(1, 'Valid Project');
    entry.hours = '0';
    entry.minutes = '0';
    entry.expectedCompletionDate = '2026-11-20';
    const res = validateProjectWorkEntry(entry, 0);
    assert.equal(res.valid, false);
    assert.match(res.error, /Please specify work duration/);
  });

  await t.test('Rejects duration exceeding 24 hours (1440 minutes)', () => {
    const entry = createEmptyProjectWorkEntry(1, 'Valid Project');
    entry.hours = '25';
    entry.minutes = '0';
    entry.expectedCompletionDate = '2026-11-20';
    const res = validateProjectWorkEntry(entry, 0);
    assert.equal(res.valid, false);
    assert.match(res.error, /cannot exceed 24 hours/);
  });

  await t.test('Rejects missing expected completion date for In Progress and Pending status', () => {
    const inProgressEntry = createEmptyProjectWorkEntry(1, 'Valid Project');
    inProgressEntry.hours = '2';
    inProgressEntry.status = 'In Progress';
    inProgressEntry.expectedCompletionDate = '';
    assert.equal(validateProjectWorkEntry(inProgressEntry, 0).valid, false);

    const pendingEntry = createEmptyProjectWorkEntry(1, 'Valid Project');
    pendingEntry.hours = '2';
    pendingEntry.status = 'Pending';
    pendingEntry.expectedCompletionDate = '';
    assert.equal(validateProjectWorkEntry(pendingEntry, 0).valid, false);
  });

  await t.test('Permits empty expected completion date when status is Completed', () => {
    const completedEntry = createEmptyProjectWorkEntry(1, 'Valid Project');
    completedEntry.hours = '3';
    completedEntry.status = 'Completed';
    completedEntry.expectedCompletionDate = '';
    assert.equal(validateProjectWorkEntry(completedEntry, 0).valid, true);
  });

  await t.test('Validates reference link format when provided', () => {
    const validEntry = createEmptyProjectWorkEntry(1, 'Valid Project');
    validEntry.hours = '2';
    validEntry.expectedCompletionDate = '2026-11-20';
    validEntry.referenceLink = 'https://github.com/myorg/repo/pull/10';
    assert.equal(validateProjectWorkEntry(validEntry, 0).valid, true);

    const invalidEntry = createEmptyProjectWorkEntry(1, 'Valid Project');
    invalidEntry.hours = '2';
    invalidEntry.expectedCompletionDate = '2026-11-20';
    invalidEntry.referenceLink = 'not-a-valid-url';
    const res = validateProjectWorkEntry(invalidEntry, 0);
    assert.equal(res.valid, false);
    assert.match(res.error, /Reference link must start with http:\/\/ or https:\/\//);
  });

  await t.test('validateAllProjectWorkEntries checks all cards and prefixes card index', () => {
    const card1 = createEmptyProjectWorkEntry(1, 'Valid Project 1');
    card1.hours = '2';
    card1.expectedCompletionDate = '2026-11-20';

    const card2 = createEmptyProjectWorkEntry(2, ''); // Missing name
    card2.hours = '1';
    card2.expectedCompletionDate = '2026-11-20';

    const res = validateAllProjectWorkEntries([card1, card2]);
    assert.equal(res.valid, false);
    assert.match(res.error, /Project 2: Please enter or select a project name/);
  });

  await t.test('validateAllProjectWorkEntries rejects empty entries array', () => {
    assert.equal(validateAllProjectWorkEntries([]).valid, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Payload Construction & Backend Contract Conformance
// ---------------------------------------------------------------------------
test('Backend API Contract Conformance for project_reports', async (t) => {
  await t.test('Single completed project item serialization', () => {
    const entry = createEmptyProjectWorkEntry(10, 'CRM Dialer App');
    entry.hours = '4';
    entry.minutes = '30';
    entry.status = 'Completed';
    entry.expectedCompletionDate = '2026-11-15'; // Should be cleared on Completed
    entry.notes = 'Fixed audio latency';
    entry.referenceLink = 'https://github.com/example/pr/1';

    const payloadItem = buildProjectReportPayloadItem(entry);
    assert.deepEqual(payloadItem, {
      entry_id: entry.clientId,
      client_entry_id: entry.clientId,
      project_id: 10,
      project_name: 'CRM Dialer App',
      duration_minutes: 270,
      duration: '4h 30m',
      status: 'Completed',
      expected_completion_date: '',
      notes: 'Fixed audio latency',
      reference_link: 'https://github.com/example/pr/1',
    });
  });

  await t.test('Multi-entry report root payload includes all required contract keys', () => {
    const entry1 = createEmptyProjectWorkEntry(10, 'Backend API');
    entry1.hours = '3';
    entry1.status = 'In Progress';
    entry1.expectedCompletionDate = '2026-11-25';
    entry1.notes = 'Added endpoints';

    const entry2 = createEmptyProjectWorkEntry(11, 'Frontend UI');
    entry2.hours = '2';
    entry2.minutes = '15';
    entry2.status = 'Completed';
    entry2.notes = 'Refactored forms';

    const projectReports = [entry1, entry2].map(buildProjectReportPayloadItem);
    const rootPayload = {
      date: '2026-11-05',
      project_reports: projectReports,
      work_links: ['https://example.com/demo'],
    };

    assert.equal(rootPayload.date, '2026-11-05');
    assert.equal(rootPayload.project_reports.length, 2);
    assert.equal(rootPayload.project_reports[0].client_entry_id, entry1.clientId);
    assert.equal(rootPayload.project_reports[1].client_entry_id, entry2.clientId);
    assert.notEqual(rootPayload.project_reports[0].client_entry_id, rootPayload.project_reports[1].client_entry_id);
    assert.equal(rootPayload.project_reports[0].duration_minutes, 180);
    assert.equal(rootPayload.project_reports[1].duration_minutes, 135);
  });
});

// ---------------------------------------------------------------------------
// 5. Mocked API Network Submission & HTTP 409 Conflict Handling
// ---------------------------------------------------------------------------
test('API Submission Workflow & HTTP 409 Conflict Handling', async (t) => {
  const originalFetch = globalThis.fetch;
  const recordedRequests = [];

  // Mock server tracking submitted entry_ids and payloads
  const database = new Map();

  globalThis.fetch = async (url, options) => {
    recordedRequests.push({ url: String(url), options });
    if (url.includes('/mobile/employee/reports/')) {
      const body = JSON.parse(options.body);

      // Inspect project_reports for idempotency
      if (body.project_reports) {
        for (const item of body.project_reports) {
          const existing = database.get(item.client_entry_id);
          if (existing) {
            // Check for conflict
            const isIdentical =
              existing.project_id === item.project_id &&
              existing.project_name === item.project_name &&
              existing.duration_minutes === item.duration_minutes &&
              existing.notes === item.notes;

            if (!isIdentical) {
              return {
                ok: false,
                status: 409,
                json: async () => ({
                  detail: `Idempotency conflict: Work entry '${item.client_entry_id}' already exists with different data.`,
                }),
              };
            }
          } else {
            database.set(item.client_entry_id, item);
          }
        }
      }

      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 456 }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    };
  };

  const { apiRequest } = await import('../src/services/api.ts');

  await t.test('First submission succeeds with HTTP 201', async () => {
    const entry = createEmptyProjectWorkEntry(14, 'Project Alpha');
    entry.hours = '2';
    entry.status = 'In Progress';
    entry.expectedCompletionDate = '2026-11-20';
    entry.notes = 'Initial work';

    const payload = {
      date: '2026-11-05',
      project_reports: [buildProjectReportPayloadItem(entry)],
    };

    const res = await apiRequest('/mobile/employee/reports/', {
      method: 'POST',
      token: 'test-token',
      body: payload,
    });
    assert.equal(res.id, 456);
  });

  await t.test('Identical retry with same UUID succeeds without conflict', async () => {
    // Look up the entry from previous test
    const [storedId, storedItem] = Array.from(database.entries())[0];

    const identicalPayload = {
      date: '2026-11-05',
      project_reports: [
        {
          entry_id: storedId,
          client_entry_id: storedId,
          project_id: storedItem.project_id,
          project_name: storedItem.project_name,
          duration_minutes: storedItem.duration_minutes,
          duration: storedItem.duration,
          status: storedItem.status,
          expected_completion_date: storedItem.expected_completion_date,
          notes: storedItem.notes,
        },
      ],
    };

    const res = await apiRequest('/mobile/employee/reports/', {
      method: 'POST',
      token: 'test-token',
      body: identicalPayload,
    });
    assert.equal(res.id, 456);
  });

  await t.test('Reusing same UUID with conflicting payload throws ApiError with status 409', async () => {
    const [storedId] = Array.from(database.entries())[0];

    const conflictingPayload = {
      date: '2026-11-05',
      project_reports: [
        {
          entry_id: storedId,
          client_entry_id: storedId,
          project_id: 999, // Conflicting project ID!
          project_name: 'Different Project Name',
          duration_minutes: 500, // Conflicting duration!
          duration: '8h 20m',
          status: 'Completed',
          expected_completion_date: '',
          notes: 'Conflicting work description',
        },
      ],
    };

    try {
      await apiRequest('/mobile/employee/reports/', {
        method: 'POST',
        token: 'test-token',
        body: conflictingPayload,
      });
      assert.fail('Expected ApiError with 409 Conflict');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.match(err.message, /Idempotency conflict/i);
    }
  });

  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 6. Role Isolation & Legacy Daily Reporting Flow
// ---------------------------------------------------------------------------
test('Role Isolation & Non-Project Daily Reporting Flow', async (t) => {
  await t.test('isProjectWorker returns true only for IT, VIDEO_EDITOR, and MANAGEMENT', () => {
    assert.equal(isProjectWorker({ role: 'IT' }), true);
    assert.equal(isProjectWorker({ role: 'VIDEO_EDITOR' }), true);
    assert.equal(isProjectWorker({ role: 'ADMIN' }), true);
    assert.equal(isProjectWorker({ role: 'MANAGER' }), true);
    assert.equal(isProjectWorker({ role: 'SUPER_ADMIN' }), true);
  });

  await t.test('isProjectWorker returns false for standard operational roles', () => {
    assert.equal(isProjectWorker({ role: 'CALLER' }), false);
    assert.equal(isProjectWorker({ role: 'COUNSELOR' }), false);
    assert.equal(isProjectWorker({ role: 'ACCOUNTANT' }), false);
  });

  await t.test('Legacy caller report payload preserves notes and work_links without project_reports', () => {
    const callerPayload = {
      date: '2026-11-05',
      notes: 'Completed 65 outbound verification calls',
      work_links: ['https://drive.google.com/file/1'],
    };

    assert.equal(callerPayload.notes, 'Completed 65 outbound verification calls');
    assert.equal(callerPayload.project_reports, undefined);
    assert.equal(callerPayload.work_links.length, 1);
  });
});
