const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Version configuration: 1.0.9 (26) across app.json, package.json, and build.gradle', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');

  assert.equal(appJson.expo.version, '1.0.9');
  assert.equal(appJson.expo.android.versionCode, 26);
  assert.equal(appJson.expo.android.package, 'com.vaani.caller');
  assert.equal(pkgJson.version, '1.0.9');

  assert.match(gradle, /versionCode\s+26/);
  assert.match(gradle, /versionName\s+"1.0.9"/);
});

test('Counselor navigation redesign: 5 coherent tab destinations with short unambiguous labels', () => {
  const layout = fs.readFileSync(path.join(root, 'src/app/counselor/_layout.tsx'), 'utf8');

  // Verify all 5 tab destinations are declared as first-class screens
  assert.match(layout, /<Tabs\.Screen\s+name="index"\s+options=\{\{\s*title:\s*'Dashboard'\s*\}\}/);
  assert.match(layout, /<Tabs\.Screen\s+name="leads"\s+options=\{\{\s*title:\s*'Leads'\s*\}\}/);
  assert.match(layout, /<Tabs\.Screen\s+name="add-lead"\s+options=\{\{\s*title:\s*'Add Lead'\s*\}\}/);
  assert.match(layout, /<Tabs\.Screen\s+name="quick-capture"\s+options=\{\{\s*title:\s*'Capture'\s*\}\}/);
  assert.match(layout, /<Tabs\.Screen\s+name="more"\s+options=\{\{\s*title:\s*'More'\s*\}\}/);

  // No tab is hidden with href: null
  assert.equal(layout.includes('href: null'), false, 'All 5 tabs must be visible');
});

test('CallerTabBar renders vector icons for add-lead and quick-capture without emoji or fallback more icon', () => {
  const tabBar = fs.readFileSync(path.join(root, 'src/components/CallerTabBar.tsx'), 'utf8');

  assert.match(tabBar, /name\s*===\s*'add-lead'/);
  assert.match(tabBar, /VectorIcon.*user-plus/);
  assert.match(tabBar, /name\s*===\s*'quick-capture'/);
  assert.match(tabBar, /VectorIcon.*camera/);
});

test('Counselor home screen has compact greeting and clickable stat cards mapping to filtered leads', () => {
  const index = fs.readFileSync(path.join(root, 'src/app/counselor/index.tsx'), 'utf8');

  // Compact header
  assert.match(index, /compactHeader/);
  assert.match(index, /dashboardTitle/);
  assert.match(index, /Counselor Dashboard/);

  // Every card maps to a filtered destination on /counselor/leads
  assert.match(index, /filter:\s*'ALL'/);
  assert.match(index, /filter:\s*'PENDING'/);
  assert.match(index, /filter:\s*'CONTACTED'/);
  assert.match(index, /filter:\s*'TODAY'/);
  assert.match(index, /filter:\s*'ADMISSION'/);

  // Cards are pressable with active feedback
  assert.match(index, /statCardPressed/);
});

test('Counselor leads screen supports route parameters and filters for ALL, PENDING, CONTACTED, TODAY, ADMISSION', () => {
  const leads = fs.readFileSync(path.join(root, 'src/app/counselor/leads.tsx'), 'utf8');

  assert.match(leads, /useLocalSearchParams/);
  assert.match(leads, /filter === 'TODAY'/);
  assert.match(leads, /filter === 'ADMISSION'/);
  assert.match(leads, /todayCount/);
  assert.match(leads, /admissionCount/);
});

test('Add Lead screen visibly presents two separate methods with short descriptions', () => {
  const addLead = fs.readFileSync(path.join(root, 'src/app/counselor/add-lead.tsx'), 'utf8');

  // Method 1: Add by Number
  assert.match(addLead, /Add Lead by Number/);
  assert.match(addLead, /Type student phone & details directly/);

  // Method 2: Quick Capture
  assert.match(addLead, /Quick Capture/);
  assert.match(addLead, /Scan screenshots to extract numbers/);
  assert.match(addLead, /\/counselor\/quick-capture/);

  // No emoji in method banners
  assert.equal(addLead.includes('📷'), false);
});

test('More screen uses VectorIcon instead of emojis', () => {
  const more = fs.readFileSync(path.join(root, 'src/app/counselor/more.tsx'), 'utf8');

  assert.match(more, /VectorIcon/);
  assert.equal(more.includes('💼'), false);
  assert.equal(more.includes('👤'), false);
  assert.equal(more.includes('⚙️'), false);
});

