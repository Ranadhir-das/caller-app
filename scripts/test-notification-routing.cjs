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
