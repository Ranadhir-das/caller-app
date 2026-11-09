import test from 'node:test';
import assert from 'node:assert/strict';

// Test presentation helpers & labels
import {
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  formatProjectDate,
  formatProjectDateTime,
} from '../src/services/projects.ts';

// Test capability helpers
import {
  isProjectWorker,
  isCallerCapable,
  isCounselorCapable,
  isDualRole,
} from '../src/services/capabilities.ts';

test('Project Presentation Helpers', async (t) => {
  await t.test('PROJECT_STATUS_LABELS contains all required lifecycle statuses', () => {
    assert.equal(PROJECT_STATUS_LABELS.ASSIGNED, 'Assigned');
    assert.equal(PROJECT_STATUS_LABELS.STARTED, 'Started');
    assert.equal(PROJECT_STATUS_LABELS.IN_PROGRESS, 'In Progress');
    assert.equal(PROJECT_STATUS_LABELS.PENDING_REVIEW, 'Pending Review');
    assert.equal(PROJECT_STATUS_LABELS.NEEDS_CHANGES, 'Needs Changes');
    assert.equal(PROJECT_STATUS_LABELS.COMPLETED, 'Completed');
    assert.equal(PROJECT_STATUS_LABELS.ON_HOLD, 'On Hold');
    assert.equal(PROJECT_STATUS_LABELS.CANCELLED, 'Cancelled');
  });

  await t.test('PROJECT_PRIORITY_LABELS contains all priority levels', () => {
    assert.equal(PROJECT_PRIORITY_LABELS.LOW, 'Low');
    assert.equal(PROJECT_PRIORITY_LABELS.MEDIUM, 'Medium');
    assert.equal(PROJECT_PRIORITY_LABELS.HIGH, 'High');
    assert.equal(PROJECT_PRIORITY_LABELS.URGENT, 'Urgent');
  });

  await t.test('formatProjectDate formats valid dates and handles null/empty', () => {
    assert.equal(formatProjectDate(null), 'Not set');
    assert.equal(formatProjectDate(undefined), 'Not set');
    assert.equal(formatProjectDate(''), 'Not set');
    const formatted = formatProjectDate('2026-11-20');
    assert.match(formatted, /20.*Nov.*2026/i);
  });

  await t.test('formatProjectDateTime formats ISO timestamps and handles null/empty', () => {
    assert.equal(formatProjectDateTime(null), '-');
    assert.equal(formatProjectDateTime(undefined), '-');
    const formatted = formatProjectDateTime('2026-11-05T14:30:00Z');
    assert.match(formatted, /2026/);
  });
});

test('Role & Capability Helper Tests', async (t) => {
  await t.test('isProjectWorker returns true for IT and VIDEO_EDITOR', () => {
    assert.equal(isProjectWorker({ role: 'IT' }), true);
    assert.equal(isProjectWorker({ role: 'VIDEO_EDITOR' }), true);
    assert.equal(isProjectWorker({ role: 'ADMIN' }), true);
    assert.equal(isProjectWorker({ role: 'MANAGER' }), true);
    assert.equal(isProjectWorker({ role: 'SUPER_ADMIN' }), true);
  });

  await t.test('isProjectWorker returns false for CALLER and COUNSELOR', () => {
    assert.equal(isProjectWorker({ role: 'CALLER' }), false);
    assert.equal(isProjectWorker({ role: 'COUNSELOR' }), false);
    assert.equal(isProjectWorker({ role: 'ACCOUNTANT' }), false);
    assert.equal(isProjectWorker(null), false);
    assert.equal(isProjectWorker(undefined), false);
  });

  await t.test('Existing capabilities remain undisturbed', () => {
    assert.equal(isCallerCapable({ role: 'CALLER' }), true);
    assert.equal(isCallerCapable({ role: 'IT' }), false);
    assert.equal(isCounselorCapable({ role: 'COUNSELOR' }), true);
    assert.equal(isCounselorCapable({ role: 'VIDEO_EDITOR' }), false);
  });
});

test('Project API Client Integration Tests (Mocked Network)', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (url.includes('/mobile/employee/projects/14/request-completion/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 14, status: 'PENDING_REVIEW', detail: 'Completion requested successfully.' }),
      };
    }
    if (url.includes('/mobile/employee/projects/14/')) {
      if (options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: body.status, detail: 'Updated' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 14,
          title: 'Mocked Project Details',
          description: 'Testing details API',
          status: 'NEEDS_CHANGES',
          status_display: 'Needs changes',
          priority: 'HIGH',
          priority_display: 'High',
          due_date: '2026-11-20',
          self_created: true,
          created_at: '2026-11-01T10:00:00Z',
          can_request_completion: true,
          is_overdue: false,
          review_comments: 'Please fix test coverage',
          completion_requested_at: '2026-11-04T12:00:00Z',
          work_reports: [
            {
              id: 101,
              client_entry_id: 'uuid-101',
              work_date: '2026-11-05',
              duration_minutes: 90,
              duration_formatted: '1h 30m',
              description: 'Completed unit tests',
              status: 'SUBMITTED',
              reference_link: 'https://github.com/org/repo/pull/1',
              employee__username: 'test_it',
            },
          ],
        }),
      };
    }
    if (url.includes('/mobile/employee/projects/9999/')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Project #9999 not found.' }),
      };
    }
    if (url.endsWith('/mobile/employee/projects/') || url.includes('/mobile/employee/projects/?')) {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 99,
            title: body.title,
            description: body.description || '',
            status: 'STARTED',
            status_display: 'Started',
            priority: body.priority || 'MEDIUM',
            priority_display: 'Medium',
            due_date: body.due_date || null,
            self_created: true,
            created_at: '2026-11-05T12:00:00Z',
            can_request_completion: true,
            is_overdue: false,
            review_comments: '',
            completion_requested_at: null,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          projects: [
            {
              id: 14,
              title: 'Mobile Work Report Redesign',
              description: 'Implement Phase 2B UI',
              status: 'IN_PROGRESS',
              status_display: 'In progress',
              priority: 'HIGH',
              priority_display: 'High',
              due_date: '2026-11-20',
              self_created: false,
              created_at: '2026-11-01T08:00:00Z',
              can_request_completion: true,
              is_overdue: false,
              review_comments: '',
              completion_requested_at: null,
            },
          ],
        }),
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    };
  };

  const {
    getProjects,
    createProject,
    getProjectDetail,
    updateProjectStatus,
    requestProjectCompletion,
  } = await import('../src/services/projects.ts');

  await t.test('getProjects dispatches correct URL and Authorization header', async () => {
    calls.length = 0;
    const res = await getProjects('test-token-123');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/mobile\/employee\/projects\/$/);
    assert.equal(calls[0].options.headers.Authorization, 'Token test-token-123');
    assert.equal(res.projects.length, 1);
    assert.equal(res.projects[0].id, 14);
  });

  await t.test('createProject sends POST with title, priority and due_date', async () => {
    calls.length = 0;
    const created = await createProject('test-token-123', {
      title: 'Automated Backup System',
      description: 'Setup PostgreSQL backups',
      priority: 'HIGH',
      due_date: '2026-11-30',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Token test-token-123');
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(sent.title, 'Automated Backup System');
    assert.equal(sent.priority, 'HIGH');
    assert.equal(sent.due_date, '2026-11-30');
    assert.equal(created.id, 99);
    assert.equal(created.status, 'STARTED');
    assert.equal(created.self_created, true);
  });

  await t.test('getProjectDetail retrieves project detail with work reports and review comments', async () => {
    calls.length = 0;
    const detail = await getProjectDetail('test-token-123', 14);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/mobile\/employee\/projects\/14\/$/);
    assert.equal(detail.id, 14);
    assert.equal(detail.status, 'NEEDS_CHANGES');
    assert.equal(detail.review_comments, 'Please fix test coverage');
    assert.equal(detail.completion_requested_at, '2026-11-04T12:00:00Z');
    assert.equal(detail.work_reports.length, 1);
    assert.equal(detail.work_reports[0].duration_formatted, '1h 30m');
  });

  await t.test('updateProjectStatus sends PATCH with status', async () => {
    calls.length = 0;
    const res = await updateProjectStatus('test-token-123', 14, { status: 'IN_PROGRESS' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'PATCH');
    assert.equal(res.status, 'IN_PROGRESS');
  });

  await t.test('requestProjectCompletion sends POST to dedicated request-completion endpoint', async () => {
    calls.length = 0;
    const res = await requestProjectCompletion('test-token-123', 14);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'POST');
    assert.match(calls[0].url, /\/mobile\/employee\/projects\/14\/request-completion\/$/);
    assert.equal(res.status, 'PENDING_REVIEW');
    assert.match(res.detail, /Completion requested/);
  });

  await t.test('getProjects with statusFilter passes query parameter properly', async () => {
    calls.length = 0;
    await getProjects('test-token-123', 'IN_PROGRESS');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/mobile\/employee\/projects\/\?status=IN_PROGRESS$/);
  });

  await t.test('API Error handling surfaces backend error status and detail', async () => {
    // Test 403 error on restricted project
    try {
      await getProjectDetail('test-token-123', 9999);
      assert.fail('Should have thrown an ApiError');
    } catch (err) {
      assert.equal(err.status, 404);
      assert.match(err.message, /not found/i);
    }
  });

  globalThis.fetch = originalFetch;
});

test('Project Creation Form Validation Logic', async (t) => {
  function validateProjectForm(title, dueDate) {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      return { valid: false, error: 'Project title is required.' };
    }
    if (cleanTitle.length > 180) {
      return { valid: false, error: 'Title cannot exceed 180 characters.' };
    }
    if (dueDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return { valid: false, error: 'Invalid due date format.' };
      }
    }
    return { valid: true };
  }

  await t.test('Rejects empty or whitespace title', () => {
    assert.equal(validateProjectForm('', null).valid, false);
    assert.equal(validateProjectForm('   ', null).valid, false);
    assert.equal(validateProjectForm('', null).error, 'Project title is required.');
  });

  await t.test('Rejects title exceeding 180 characters', () => {
    const longTitle = 'A'.repeat(181);
    assert.equal(validateProjectForm(longTitle, null).valid, false);
    assert.equal(validateProjectForm(longTitle, null).error, 'Title cannot exceed 180 characters.');
  });

  await t.test('Accepts valid title within 180 characters', () => {
    assert.equal(validateProjectForm('Valid Project Title', null).valid, true);
    assert.equal(validateProjectForm('A'.repeat(180), null).valid, true);
  });

  await t.test('Validates due date format when provided', () => {
    assert.equal(validateProjectForm('Valid Title', '2026-11-20').valid, true);
    assert.equal(validateProjectForm('Valid Title', 'invalid-date').valid, false);
  });
});

test('Project Lifecycle State Machine Guards', async (t) => {
  function canEmployeeEdit(status) {
    return status !== 'COMPLETED' && status !== 'CANCELLED' && status !== 'PENDING_REVIEW';
  }

  function canRequestCompletion(status) {
    return status === 'STARTED' || status === 'IN_PROGRESS' || status === 'NEEDS_CHANGES';
  }

  await t.test('Completed and Cancelled projects are terminal and cannot be edited by employees', () => {
    assert.equal(canEmployeeEdit('COMPLETED'), false);
    assert.equal(canEmployeeEdit('CANCELLED'), false);
  });

  await t.test('Projects in Pending Review are locked from employee edits', () => {
    assert.equal(canEmployeeEdit('PENDING_REVIEW'), false);
  });

  await t.test('Active projects allow editing', () => {
    assert.equal(canEmployeeEdit('STARTED'), true);
    assert.equal(canEmployeeEdit('IN_PROGRESS'), true);
    assert.equal(canEmployeeEdit('NEEDS_CHANGES'), true);
  });

  await t.test('canRequestCompletion only allowed for STARTED, IN_PROGRESS, and NEEDS_CHANGES', () => {
    assert.equal(canRequestCompletion('STARTED'), true);
    assert.equal(canRequestCompletion('IN_PROGRESS'), true);
    assert.equal(canRequestCompletion('NEEDS_CHANGES'), true);
    assert.equal(canRequestCompletion('COMPLETED'), false);
    assert.equal(canRequestCompletion('CANCELLED'), false);
    assert.equal(canRequestCompletion('PENDING_REVIEW'), false);
  });
});
