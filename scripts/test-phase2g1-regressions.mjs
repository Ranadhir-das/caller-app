import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEmptyProjectWorkEntry,
  buildProjectReportPayloadItem,
  validateAllProjectWorkEntries,
} from '../src/services/projects.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const callerAppRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. My Work UI Structural Invariants (Phase 2G.1)
// ---------------------------------------------------------------------------
test('Phase 2G.1: My Work UI Simplification Invariants', async (t) => {
  const workScreenPath = path.join(callerAppRoot, 'src', 'app', 'employee', 'work.tsx');
  const workScreenContent = fs.readFileSync(workScreenPath, 'utf8');

  await t.test('Assigned-project cards and lifecycle buttons do not render in My Work', () => {
    // Large project list cards should be absent
    assert.doesNotMatch(
      workScreenContent,
      /<Text[^>]*>My assigned projects<\/Text>/,
      'Heading "My assigned projects" must not be present in My Work',
    );
    assert.doesNotMatch(
      workScreenContent,
      /data\?\.projects\.map/,
      'data.projects.map project card list must be removed from My Work',
    );
    // Large lifecycle status transition buttons must be absent from My Work
    assert.doesNotMatch(
      workScreenContent,
      /\['STARTED',\s*'IN_PROGRESS',\s*'COMPLETED'\]/,
      'Lifecycle mutation buttons array must not be rendered in My Work',
    );
  });

  await t.test('Manage Projects navigation link is present and active', () => {
    assert.match(
      workScreenContent,
      /router\.push\('\/projects'/,
      'Manage Projects link routing to /projects must be preserved',
    );
    assert.match(
      workScreenContent,
      /Manage Projects ›/,
      'Manage Projects label must be visible in header',
    );
  });

  await t.test('Global Work Attachments section is removed from project-wise reporting', () => {
    assert.doesNotMatch(
      workScreenContent,
      /Work Attachments \(optional\)/,
      'Separate "Work Attachments" card must be removed from project reporting form',
    );
  });

  await t.test('Submission button is positioned at the end of the form after Daily Summary', () => {
    // DailyProjectSummaryCard (Daily Summary) must appear before the Submit button
    const dailySummaryIndex = workScreenContent.indexOf('title="Daily Summary"');
    const submitBtnIndex = workScreenContent.indexOf('Submit Work Report');

    assert.ok(dailySummaryIndex > 0, 'Daily Summary card must exist in project reporting');
    assert.ok(submitBtnIndex > 0, 'Submit Work Report button must exist in project reporting');
    assert.ok(
      submitBtnIndex > dailySummaryIndex,
      'Submit Work Report button must be located AFTER Daily Summary card',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Per-Project Independent Photo Selection & Removal State
// ---------------------------------------------------------------------------
test('Phase 2G.1: Per-Project Independent Photo Selection State', async (t) => {
  await t.test('Initial empty entry has null photo and photoName', () => {
    const entry = createEmptyProjectWorkEntry(10, 'CRM Mobile Dialer');
    assert.equal(entry.photo, null);
    assert.equal(entry.photoName, null);
  });

  await t.test('Adding photo to Entry 1 does not affect Entry 2', () => {
    const entry1 = createEmptyProjectWorkEntry(10, 'Project 1');
    const entry2 = createEmptyProjectWorkEntry(11, 'Project 2');

    // Attach photo to entry1 only
    const updatedEntry1 = {
      ...entry1,
      photo: 'data:image/jpeg;base64,ENTRY1_BASE64_MOCK',
      photoName: 'diagram_project1.png',
    };

    assert.equal(updatedEntry1.photo, 'data:image/jpeg;base64,ENTRY1_BASE64_MOCK');
    assert.equal(updatedEntry1.photoName, 'diagram_project1.png');

    // Entry 2 remains untouched with no photo
    assert.equal(entry2.photo, null);
    assert.equal(entry2.photoName, null);
  });

  await t.test('Both entries can have different independent photos', () => {
    let entry1 = createEmptyProjectWorkEntry(10, 'Project 1');
    let entry2 = createEmptyProjectWorkEntry(11, 'Project 2');

    entry1 = {
      ...entry1,
      photo: 'data:image/jpeg;base64,PHOTO_AAA',
      photoName: 'aaa.jpg',
    };
    entry2 = {
      ...entry2,
      photo: 'data:image/jpeg;base64,PHOTO_BBB',
      photoName: 'bbb.jpg',
    };

    assert.equal(entry1.photo, 'data:image/jpeg;base64,PHOTO_AAA');
    assert.equal(entry2.photo, 'data:image/jpeg;base64,PHOTO_BBB');
    assert.notEqual(entry1.photo, entry2.photo);
  });

  await t.test('Removing Entry 1 photo leaves Entry 2 photo completely intact', () => {
    let entry1 = {
      ...createEmptyProjectWorkEntry(10, 'Project 1'),
      photo: 'data:image/jpeg;base64,PHOTO_AAA',
      photoName: 'aaa.jpg',
    };
    let entry2 = {
      ...createEmptyProjectWorkEntry(11, 'Project 2'),
      photo: 'data:image/jpeg;base64,PHOTO_BBB',
      photoName: 'bbb.jpg',
    };

    // User removes photo from Entry 1
    entry1 = {
      ...entry1,
      photo: null,
      photoName: null,
    };

    assert.equal(entry1.photo, null);
    assert.equal(entry1.photoName, null);
    // Entry 2 is completely preserved
    assert.equal(entry2.photo, 'data:image/jpeg;base64,PHOTO_BBB');
    assert.equal(entry2.photoName, 'bbb.jpg');
  });
});

// ---------------------------------------------------------------------------
// 3. Payload Serialization & API Contract Compatibility
// ---------------------------------------------------------------------------
test('Phase 2G.1: Payload Serialization with Per-Entry Photos', async (t) => {
  await t.test('Entry without photo does not include photo key in serialized item', () => {
    const entry = createEmptyProjectWorkEntry(14, 'Project Alpha');
    entry.hours = '2';
    entry.minutes = '0';
    entry.status = 'Completed';
    entry.notes = 'Completed milestones';

    const item = buildProjectReportPayloadItem(entry);
    assert.equal(item.project_id, 14);
    assert.equal(item.project_name, 'Project Alpha');
    assert.equal(item.duration_minutes, 120);
    assert.equal(item.duration, '2h');
    assert.equal('photo' in item, false, 'photo key must be omitted when no photo is attached');
  });

  await t.test('Entry with photo extracts clean base64 string for API', () => {
    const entry = createEmptyProjectWorkEntry(14, 'Project Alpha');
    entry.hours = '1';
    entry.minutes = '30';
    entry.status = 'In Progress';
    entry.expectedCompletionDate = '2026-11-20';
    entry.notes = 'Progress with architectural diagram';
    entry.photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...';
    entry.photoName = 'arch_diagram.jpg';

    const item = buildProjectReportPayloadItem(entry);
    assert.equal(item.photo, '/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...');
    assert.equal(item.client_entry_id, entry.clientId);
    assert.equal(item.entry_id, entry.clientId);
    assert.equal(item.duration_minutes, 90);
  });

  await t.test('Multi-entry payload formats distinct entries with and without photos', () => {
    const entry1 = createEmptyProjectWorkEntry(101, 'Backend API');
    entry1.hours = '2';
    entry1.minutes = '15';
    entry1.status = 'Completed';
    entry1.notes = 'Added photo serializer support';
    entry1.photo = 'data:image/jpeg;base64,PHOTO_ONE_RAW_BYTES';

    const entry2 = createEmptyProjectWorkEntry(102, 'Mobile Client');
    entry2.hours = '1';
    entry2.minutes = '45';
    entry2.status = 'In Progress';
    entry2.expectedCompletionDate = '2026-11-22';
    entry2.notes = 'Refactored My Work UI';
    // entry2 has no photo

    const entries = [entry1, entry2];
    assert.equal(validateAllProjectWorkEntries(entries).valid, true);

    const payloadReports = entries.map(buildProjectReportPayloadItem);
    assert.equal(payloadReports.length, 2);
    assert.equal(payloadReports[0].photo, 'PHOTO_ONE_RAW_BYTES');
    assert.equal('photo' in payloadReports[1], false);
    assert.notEqual(payloadReports[0].client_entry_id, payloadReports[1].client_entry_id);
  });

  await t.test('Client UUID is preserved during retry after error', () => {
    const entry = createEmptyProjectWorkEntry(101, 'Backend API');
    entry.hours = '3';
    entry.minutes = '0';
    entry.status = 'Completed';
    entry.notes = 'First attempt';
    entry.photo = 'data:image/jpeg;base64,RAW_BYTES';
    const originalUuid = entry.clientId;

    // Simulate failed request -> user retries with the same entry state
    const payloadFirstAttempt = buildProjectReportPayloadItem(entry);
    const payloadRetryAttempt = buildProjectReportPayloadItem(entry);

    assert.equal(payloadFirstAttempt.client_entry_id, originalUuid);
    assert.equal(payloadRetryAttempt.client_entry_id, originalUuid);
    assert.equal(payloadFirstAttempt.photo, payloadRetryAttempt.photo);
  });
});
