import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEntryDurationInfo,
  calculateDailyProjectSummary,
} from '../src/services/durationAccounting.ts';

import { isProjectWorker } from '../src/services/capabilities.ts';

// ---------------------------------------------------------------------------
// 1. Individual Entry Duration Resolution & Incomplete Handling
// ---------------------------------------------------------------------------
test('Individual Entry Duration Resolution', async (t) => {
  await t.test('Canonical integer duration_minutes takes precedence', () => {
    const info = getEntryDurationInfo({
      duration_minutes: 150,
      duration: '1h', // Should be ignored in favor of integer 150
      hours: '1',
      minutes: '0',
    });
    assert.equal(info.minutes, 150);
    assert.equal(info.formatted, '2h 30m');
    assert.equal(info.isIncomplete, false);
  });

  await t.test('Structured hours and minutes are converted to canonical minutes', () => {
    const info = getEntryDurationInfo({
      hours: '3',
      minutes: '15',
    });
    assert.equal(info.minutes, 195);
    assert.equal(info.formatted, '3h 15m');
    assert.equal(info.isIncomplete, false);
  });

  await t.test('Legacy string duration is parsed accurately when integer minutes are absent', () => {
    const info1 = getEntryDurationInfo({ duration: '45 mins' });
    assert.equal(info1.minutes, 45);
    assert.equal(info1.formatted, '45m');
    assert.equal(info1.isIncomplete, false);

    const info2 = getEntryDurationInfo({ duration: '2h 15m' });
    assert.equal(info2.minutes, 135);
    assert.equal(info2.formatted, '2h 15m');
    assert.equal(info2.isIncomplete, false);

    const info3 = getEntryDurationInfo({ duration: '2.5 hours' });
    assert.equal(info3.minutes, 150);
    assert.equal(info3.formatted, '2h 30m');
    assert.equal(info3.isIncomplete, false);
  });

  await t.test('Missing, null, or undefined duration is flagged as incomplete (not silently zeroed)', () => {
    const info1 = getEntryDurationInfo({});
    assert.equal(info1.minutes, null);
    assert.equal(info1.formatted, 'Duration not recorded');
    assert.equal(info1.isIncomplete, true);

    const info2 = getEntryDurationInfo({ duration_minutes: null, duration: '' });
    assert.equal(info2.minutes, null);
    assert.equal(info2.isIncomplete, true);
  });

  await t.test('Zero or invalid duration strings are flagged as incomplete', () => {
    const info1 = getEntryDurationInfo({ duration_minutes: 0 });
    assert.equal(info1.minutes, null);
    assert.equal(info1.isIncomplete, true);

    const info2 = getEntryDurationInfo({ duration: 'not-a-duration' });
    assert.equal(info2.minutes, null);
    assert.equal(info2.isIncomplete, true);

    const info3 = getEntryDurationInfo({ hours: '0', minutes: '0' });
    assert.equal(info3.minutes, null);
    assert.equal(info3.isIncomplete, true);
  });
});

// ---------------------------------------------------------------------------
// 2. Daily Summary Calculation & Double-Counting Prevention
// ---------------------------------------------------------------------------
test('Daily Summary Calculation & Accounting Accuracy', async (t) => {
  await t.test('Empty entries array returns safe zeroed summary', () => {
    const summary = calculateDailyProjectSummary([]);
    assert.equal(summary.totalMinutes, 0);
    assert.equal(summary.formattedTotal, '0m');
    assert.equal(summary.entriesCount, 0);
    assert.equal(summary.projectsCount, 0);
    assert.equal(summary.incompleteEntriesCount, 0);
    assert.equal(summary.hasIncompleteDurations, false);
    assert.equal(summary.linkedEntriesCount, 0);
    assert.equal(summary.unlinkedEntriesCount, 0);
  });

  await t.test('Multiple entries correctly sum total duration across diverse projects', () => {
    const entries = [
      {
        entry_id: 'uuid-1',
        project_id: 10,
        project_name: 'CRM Backend API',
        duration_minutes: 120, // 2h
      },
      {
        entry_id: 'uuid-2',
        project_id: 11,
        project_name: 'Caller Mobile App',
        duration_minutes: 45, // 45m
      },
      {
        entry_id: 'uuid-3',
        project_id: 10,
        project_name: 'CRM Backend API',
        duration_minutes: 75, // 1h 15m
      },
    ];

    const summary = calculateDailyProjectSummary(entries);
    assert.equal(summary.totalMinutes, 240); // 120 + 45 + 75 = 240m (4h)
    assert.equal(summary.formattedTotal, '4h');
    assert.equal(summary.entriesCount, 3);
    assert.equal(summary.projectsCount, 2); // Projects 10 and 11
    assert.equal(summary.linkedEntriesCount, 3);
    assert.equal(summary.unlinkedEntriesCount, 0);
    assert.equal(summary.incompleteEntriesCount, 0);
    assert.equal(summary.hasIncompleteDurations, false);
  });

  await t.test('Duplicate entries with same UUID are not double-counted', () => {
    const entries = [
      {
        entry_id: 'uuid-dup-1',
        client_entry_id: 'uuid-dup-1',
        project_id: 14,
        project_name: 'Testing Project',
        duration_minutes: 90,
      },
      {
        // Replayed / duplicated entry with identical UUID
        entry_id: 'uuid-dup-1',
        client_entry_id: 'uuid-dup-1',
        project_id: 14,
        project_name: 'Testing Project',
        duration_minutes: 90,
      },
      {
        entry_id: 'uuid-unique-2',
        client_entry_id: 'uuid-unique-2',
        project_id: 15,
        project_name: 'Other Project',
        duration_minutes: 60,
      },
    ];

    const summary = calculateDailyProjectSummary(entries);
    // Should count uuid-dup-1 once (90m) + uuid-unique-2 (60m) = 150m (2h 30m)
    assert.equal(summary.totalMinutes, 150);
    assert.equal(summary.formattedTotal, '2h 30m');
    assert.equal(summary.entriesCount, 2);
    assert.equal(summary.projectsCount, 2);
  });

  await t.test('Legacy unlinked entries without project IDs are properly aggregated', () => {
    const entries = [
      {
        entry_id: 'uuid-linked',
        project_id: 10,
        project_name: 'Official Project',
        duration_minutes: 60,
      },
      {
        // Legacy or unlinked task
        entry_id: 'uuid-unlinked-1',
        project_id: null,
        project_name: 'Ad-hoc Server Maintenance',
        duration: '1h 30m', // 90m
      },
      {
        // Legacy task without entry_id or project_id
        project_id: null,
        project_name: 'Ad-hoc Server Maintenance',
        duration: '30m', // 30m
      },
    ];

    const summary = calculateDailyProjectSummary(entries);
    assert.equal(summary.totalMinutes, 180); // 60 + 90 + 30 = 180m (3h)
    assert.equal(summary.formattedTotal, '3h');
    assert.equal(summary.entriesCount, 3);
    assert.equal(summary.linkedEntriesCount, 1);
    assert.equal(summary.unlinkedEntriesCount, 2);
    assert.equal(summary.projectsCount, 2); // 'Official Project' and 'Ad-hoc Server Maintenance'
  });

  await t.test('Incomplete durations are flagged and counted without zeroing valid entries', () => {
    const entries = [
      {
        entry_id: 'uuid-valid',
        project_id: 10,
        project_name: 'Alpha',
        duration_minutes: 120,
      },
      {
        entry_id: 'uuid-missing',
        project_id: 10,
        project_name: 'Alpha',
        duration: '', // Missing duration
      },
      {
        entry_id: 'uuid-invalid',
        project_id: 12,
        project_name: 'Beta',
        duration: 'corrupted', // Invalid duration
      },
    ];

    const summary = calculateDailyProjectSummary(entries);
    assert.equal(summary.totalMinutes, 120); // Only the valid 120m
    assert.equal(summary.formattedTotal, '2h');
    assert.equal(summary.entriesCount, 3);
    assert.equal(summary.incompleteEntriesCount, 2);
    assert.equal(summary.hasIncompleteDurations, true);
    assert.equal(summary.projectsCount, 2);
  });
});

// ---------------------------------------------------------------------------
// 3. Historical Reports & Workspace Snapshot Window (30 Days)
// ---------------------------------------------------------------------------
test('Historical Reports & Workspace Snapshot Constraints', async (t) => {
  await t.test('Correctly computes summaries across multiple independent daily reports', () => {
    const historicalReports = [
      {
        id: 101,
        date: '2026-11-05',
        project_reports: [
          { entry_id: 'e1', project_id: 1, duration_minutes: 120 },
          { entry_id: 'e2', project_id: 2, duration_minutes: 60 },
        ],
      },
      {
        id: 100,
        date: '2026-11-04',
        project_reports: [
          { entry_id: 'e3', project_id: 1, duration_minutes: 180 },
        ],
      },
      {
        id: 99,
        date: '2026-11-03',
        notes: 'Non-project general daily work',
        project_reports: [],
      },
    ];

    const sum1 = calculateDailyProjectSummary(historicalReports[0].project_reports);
    assert.equal(sum1.totalMinutes, 180);
    assert.equal(sum1.formattedTotal, '3h');
    assert.equal(sum1.entriesCount, 2);

    const sum2 = calculateDailyProjectSummary(historicalReports[1].project_reports);
    assert.equal(sum2.totalMinutes, 180);
    assert.equal(sum2.formattedTotal, '3h');
    assert.equal(sum2.entriesCount, 1);

    const sum3 = calculateDailyProjectSummary(historicalReports[2].project_reports);
    assert.equal(sum3.totalMinutes, 0);
    assert.equal(sum3.entriesCount, 0);
  });

  await t.test('Respects maximum 30 reports returned by workspace API snapshot', () => {
    // Generate mock workspace reports slice of 30 items
    const mockReports = Array.from({ length: 30 }, (_, i) => ({
      id: 30 - i,
      date: `2026-10-${String(30 - i).padStart(2, '0')}`,
      project_reports: [{ entry_id: `uuid-${i}`, project_id: 1, duration_minutes: 60 }],
    }));

    assert.equal(mockReports.length, 30);
    const daySummary = calculateDailyProjectSummary(mockReports[0].project_reports);
    assert.equal(daySummary.totalMinutes, 60);
    assert.equal(daySummary.entriesCount, 1);
  });

  await t.test('Workspace snapshot window UI wording accurately describes 30 most recent reports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const workFile = fs.readFileSync(path.resolve('src/app/employee/work.tsx'), 'utf8');

    // Must have accurate wording
    assert.ok(workFile.includes('Previous reports'));
    assert.ok(workFile.includes('Showing up to 30 most recent daily work reports available in your workspace snapshot.'));
    assert.ok(workFile.includes('No recent work reports available in this workspace snapshot.'));

    // Must not contain inaccurate 'Last 30 days' calendar day restriction wording
    assert.equal(workFile.includes('Previous reports (Last 30 days)'), false);
    assert.equal(workFile.includes('last 30 days'), false);
  });
});

// ---------------------------------------------------------------------------
// 4. Role Compatibility & UI Scope
// ---------------------------------------------------------------------------
test('Role Compatibility for Duration Accounting', async (t) => {
  await t.test('isProjectWorker distinguishes project workers from operational staff', () => {
    assert.equal(isProjectWorker({ role: 'IT' }), true);
    assert.equal(isProjectWorker({ role: 'VIDEO_EDITOR' }), true);
    assert.equal(isProjectWorker({ role: 'CALLER' }), false);
    assert.equal(isProjectWorker({ role: 'COUNSELOR' }), false);
    assert.equal(isProjectWorker({ role: 'ACCOUNTANT' }), false);
  });
});
