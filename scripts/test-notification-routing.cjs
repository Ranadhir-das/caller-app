const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/notificationRouting.ts'), 'utf8');
const context = {exports:{}};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context);
const {websiteLeadNotificationTarget: target, isNotifiedLeadAvailable: available} = context.exports;
test('new website lead notification opens available queue with target lead', () => {
  const route = target({type:'NEW_WEBSITE_LEAD',lead_id:42}, true);
  assert.equal(route.pathname,'/(tabs)/leads');
  assert.equal(route.params.availableLeadId,'42');
  assert.equal(route.params.tab,'available');
});
test('string IDs are supported', () => assert.equal(target({type:'NEW_WEBSITE_LEAD',lead_id:'42'},true).params.availableLeadId,'42'));
test('logged out or noncaller cannot bypass authentication', () => {
  assert.equal(target({type:'NEW_WEBSITE_LEAD',lead_id:42},false),null);
});
test('other notification types are left to existing behavior', () => {
  assert.equal(target({type:'OTHER',lead_id:42},true),null);
});
test('invalid or missing lead IDs never navigate', () => {
  for (const id of [undefined,null,0,-1,1.1,'abc','../dialer',{},[],true,Number.MAX_SAFE_INTEGER+1])
    assert.equal(target({type:'NEW_WEBSITE_LEAD',lead_id:id},true),null);
  assert.equal(target(null,true),null);
});
test('already claimed or inaccessible lead is unavailable after refresh', () => {
  assert.equal(available([{id:'1'}],'42'),false);
  assert.equal(available([{id:'42'}],'42'),true);
  assert.equal(available([],'42'),false);
});
test('tap routing has no claim, dialer, or call creation capability', () => {
  assert.doesNotMatch(source,/claimLead|\/claim\/|\/calls\/|\/dialer/);
  const component = fs.readFileSync(path.join(root,'src/components/PushNotificationRegistration.tsx'),'utf8');
  assert.match(component,/router.push/);
  assert.match(component,/loading \|\| !token/);
  assert.doesNotMatch(component,/claimLead|\/claim\//);
});
test('foreground presentation does not dispatch tap navigation', () => {
  const service = fs.readFileSync(path.join(root,'src/services/notifications.ts'),'utf8');
  const foreground = service.slice(service.indexOf('subscriptions.push(n.addNotificationReceivedListener'), service.indexOf('subscriptions.push(n.addNotificationResponseReceivedListener'));
  assert.doesNotMatch(foreground,/onResponse|handleResponse|router/);
  assert.match(service,/shouldShowBanner: true/);
});

test('team chat tap opens only the authorized chat screen target for employees', () => {
  const result = target({type:'TEAM_CHAT',channel_id:8,message_id:12}, false, true);
  assert.equal(result.pathname, '/chat');
  assert.equal(result.params.channelId, '8');
});
test('notice tap targets the notice board for employees', () => {
  const result = target({type:'NOTICE',notice_id:'9'}, false, true);
  assert.equal(result.pathname, '/notices');
  assert.equal(result.params.noticeId, '9');
});
test('team events require authentication and valid resource IDs', () => {
  for (const payload of [{type:'TEAM_CHAT',channel_id:8}, {type:'NOTICE',notice_id:9}])
    assert.equal(target(payload, false, false), null);
  for (const id of [undefined,null,0,-1,'../dialer',{},[],true,Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(target({type:'TEAM_CHAT',channel_id:id},false,true),null);
    assert.equal(target({type:'NOTICE',notice_id:id},false,true),null);
  }
  assert.equal(target({type:'LEAD_ASSIGNED',lead_id:12},false,true),null);
});

test('followup due notification routes caller to lead details when lead_id exists', () => {
  const result = target({type:'FOLLOWUP_DUE', lead_id: 55, followup_id: 12}, true, true);
  assert.equal(result.pathname, '/lead-details');
  assert.equal(result.params.id, '55');
});

test('followup due notification routes caller to home tab when lead_id is missing', () => {
  const result = target({type:'FOLLOWUP_DUE', followup_id: 12, phone: '9876543210'}, true, true);
  assert.equal(result.pathname, '/(tabs)');
});

test('noncallers or unauthenticated users cannot open follow-up notifications', () => {
  assert.equal(target({type:'FOLLOWUP_DUE', lead_id: 55}, false, false), null);
  assert.equal(target({type:'FOLLOWUP_DUE', lead_id: 55}, false, true), null);
});

test('counselor forwarded notification routes counselor to counselor lead details', () => {
  const result = target({ type: 'COUNSELOR_LEAD_FORWARDED', lead_id: 88, assignment_id: 3 }, false, true, true);
  assert.equal(result.pathname, '/counselor-lead');
  assert.equal(result.params.id, '88');
});

test('caller or unauthenticated user cannot open counselor forwarded notification', () => {
  assert.equal(target({ type: 'COUNSELOR_LEAD_FORWARDED', lead_id: 88 }, true, true, false), null);
  assert.equal(target({ type: 'COUNSELOR_LEAD_FORWARDED', lead_id: 88 }, false, false, false), null);
});
