const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, mocks, globals={}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022},
  }).outputText, {exports, require:name => { assert.ok(name in mocks, `Unexpected import: ${name}`); return mocks[name]; },
    __DEV__:false, AbortController, setTimeout, clearTimeout, console, ...globals});
  return exports;
}
function setup(options={}) {
  let now = Date.parse('2026-10-08T08:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const values = new Map(), tasks = new Map(), running = new Set(), requests = [], starts = [], stops = [];
  let token = 'secret-token', sessionId = 'session-a', offline = false, statusCode = 0;
  let allowed = options.allowed !== false, gps = true;
  const session = {session_id:sessionId, started_at:new Clock(now-7200000).toISOString(), expires_at:new Clock(now+14400000).toISOString()};
  const storage = {getItem:async key => values.get(key)||null, setItem:async(key,value) => values.set(key,value), removeItem:async key => values.delete(key)};
  const location = {
    Accuracy:{High:4,Balanced:3},
    getForegroundPermissionsAsync:async() => ({status:allowed?'granted':'denied', canAskAgain:false, android:{accuracy:'fine'}}),
    getBackgroundPermissionsAsync:async() => ({status:allowed?'granted':'denied'}),
    requestForegroundPermissionsAsync:async() => ({status:allowed?'granted':'denied'}),
    requestBackgroundPermissionsAsync:async() => ({status:allowed?'granted':'denied'}),
    hasServicesEnabledAsync:async() => gps,
    hasStartedLocationUpdatesAsync:async name => running.has(name),
    stopLocationUpdatesAsync:async name => { stops.push(name); running.delete(name); },
    startLocationUpdatesAsync:async(name,settings) => { starts.push({name,settings}); running.add(name); },
  };
  class ApiError extends Error { constructor(message,status,details) { super(message); this.status=status; this.details=details; } }
  const api = {ApiError, apiRequest:async(endpoint, args) => {
    requests.push({endpoint,...args});
    assert.equal(args.token, token);
    assert.equal(args.suppressErrorLog, true);
    if (offline) throw new Error('offline');
    if (statusCode) throw new ApiError('Rejected',statusCode);
    if (endpoint.endsWith('/status/')) return args.body ? {status:'ok'} : session;
    assert.ok(['session-a','session-b'].includes(args.body.session_id));
    return {accepted:args.body.points.map(p=>p.recorded_at.replace('Z','+00:00'))};
  }};
  const queue = compile('services/locationQueue.ts',{}, {Date:Clock});
  const taskManager = {isAvailableAsync:async()=>true, isTaskDefined:name=>tasks.has(name), defineTask:(name,fn)=>tasks.set(name,fn)};
  const rn = {Platform:{OS:'android'}, AppState:{currentState:'active'}, Alert:{alert:(_,__,buttons)=>buttons[options.decline?0:1].onPress()}};
  const service = compile('services/employeeLocation.ts', {
    '@react-native-async-storage/async-storage':storage, 'expo-location':location,
    'react-native':rn, './api':api, './auth':{getStoredToken:async()=>token,getStoredSessionId:async()=>sessionId},
    './locationQueue':queue, 'expo-task-manager': options.missingNative ? null : taskManager,
  }, {Date:Clock});
  const point = (changes={}) => ({timestamp:now, coords:{latitude:22.5726, longitude:88.3639, accuracy:5, altitude:10, speed:0, heading:0}, ...changes});
  return {...service, queue, values, tasks, running, requests, starts, stops, point, session, api, storage,
    advance:ms=>now+=ms, offline:value=>offline=value, permission:value=>allowed=value, gps:value=>gps=value,
    authStatus:value=>statusCode=value, changeSession:()=>{sessionId='session-b'; session.session_id=sessionId; session.started_at=new Clock(now-1000).toISOString(); session.expires_at=new Clock(now+14400000).toISOString();},
    queueState:()=>JSON.parse(values.get('vaani_employee_location_queue_v1')||'null'),
    background:async points=>tasks.get(service.MOVING_LOCATION_TASK)({data:{locations:points},error:null}),
  };
}

test('global task registration, authenticated start and supported native options', async()=>{
  const app=setup(); assert.equal(app.tasks.size,2);
  await app.startEmployeeLocation(7);
  assert.equal(app.running.size,2);
  const moving=app.starts.find(s=>s.name===app.MOVING_LOCATION_TASK).settings;
  const stationary=app.starts.find(s=>s.name===app.STATIONARY_LOCATION_TASK).settings;
  assert.equal(moving.timeInterval,10000); assert.equal(moving.distanceInterval,15);
  assert.match(moving.foregroundService.notificationBody,/administrators/);
  assert.equal(stationary.timeInterval,60000);
  assert.equal(app.queueState().session.userId,7);
  assert.ok(!JSON.stringify(app.queueState()).includes('secret-token'));
});
test('repeated session start does not duplicate native listeners', async()=>{
  const app=setup(); await Promise.all([app.startEmployeeLocation(7),app.startEmployeeLocation(7)]);
  await app.startEmployeeLocation(7,false); assert.equal(app.starts.length,2);
});
test('permission denial shows only unavailable and never starts collection', async()=>{
  const app=setup({allowed:false,decline:true}); const statuses=[];
  app.subscribeLocationStatus(value=>statuses.push(value)); await app.startEmployeeLocation(7);
  assert.equal(app.running.size,0); assert.equal(statuses.at(-1),'unavailable');
  const component=fs.readFileSync(`${__dirname}/../src/components/EmployeeLocationRegistration.tsx`,'utf8');
  assert.match(component,/>Please enable location\.<\/Text>/);
});
test('GPS disabled does not masquerade as network failure', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.gps(false);
  const states=[]; app.subscribeLocationStatus(value=>states.push(value)); await app.maintainEmployeeLocation();
  assert.equal(states.at(-1),'unavailable'); assert.equal(app.running.size,0);
  assert.equal(app.requests.at(-1).body.state,'UNAVAILABLE');
});
test('revoked permissions stop native tasks, foreground resume can restart them', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.permission(false);
  await app.maintainEmployeeLocation(); assert.equal(app.running.size,0);
  app.permission(true); await app.startEmployeeLocation(7,false); assert.equal(app.running.size,2);
});
test('background collection persists before network and removes only acknowledged points', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); await app.background([app.point()]);
  assert.equal(app.requests.filter(r=>r.endpoint==='/mobile/location/').length,1);
  assert.equal(app.queueState().points.length,0); assert.ok(app.queueState().lastPoint);
});
test('offline queue survives failure and retries on network recovery', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true);
  await app.background([app.point()]); assert.equal(app.queueState().points.length,1);
  app.advance(60000); await app.background([app.point()]); assert.equal(app.queueState().points.length,2);
  app.offline(false); app.advance(60000); await app.maintainEmployeeLocation();
  assert.equal(app.queueState().points.length,0);
  assert.equal(app.requests.filter(r=>r.endpoint==='/mobile/location/').at(-1).body.points.length,2);
});
test('duplicate callbacks from both native streams are idempotent', async()=>{
  const app=setup(); await app.startEmployeeLocation(7);
  await Promise.all([app.background([app.point()]),app.background([app.point()])]);
  app.advance(20000); await app.maintainEmployeeLocation();
  assert.equal(app.requests.filter(r=>r.endpoint==='/mobile/location/').length,1);
});
test('stationary samples are reduced to one per minute, moving samples are retained', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true);
  await app.background([app.point()]);
  app.advance(10000); await app.background([app.point()]); assert.equal(app.queueState().points.length,1);
  app.advance(50000); await app.background([app.point()]); assert.equal(app.queueState().points.length,2);
  app.advance(10000);
  const moving=app.point(); moving.coords.speed=3; moving.coords.latitude+=0.001;
  await app.background([moving]); assert.equal(app.queueState().points.length,3);
});
test('logout stops, flushes before closing and clears private queue', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true); await app.background([app.point()]);
  app.offline(false); await app.stopEmployeeLocation();
  assert.equal(app.running.size,0); assert.equal(app.queueState(),null);
  assert.equal(app.requests.at(-1).body.state,'STOPPED');
});
test('offline logout also stops and clears queue', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true); await app.background([app.point()]);
  await app.stopEmployeeLocation(); assert.equal(app.running.size,0); assert.equal(app.queueState(),null);
});
test('session expiry stops native tracking without an internet request', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.advance(5*3600000);
  const before=app.requests.length; await app.background([app.point()]);
  assert.equal(app.running.size,0); assert.equal(app.queueState().enabled,false); assert.equal(app.requests.length,before);
});
for(const code of [401,403]) test(`HTTP ${code} stops and clears session tracking`,async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.authStatus(code);
  await app.background([app.point()]); assert.equal(app.running.size,0); assert.equal(app.queueState().enabled,false);
});
test('new authenticated session cannot submit another session queue', async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true); await app.background([app.point()]);
  app.changeSession(); app.offline(false); const count=app.requests.length;
  await app.maintainEmployeeLocation(); assert.equal(app.queueState().enabled,false); assert.equal(app.requests.length,count);
});
test('missing native task manager tolerates an older installed development build',async()=>{
  const app=setup({missingNative:true}); await app.startEmployeeLocation(7); assert.equal(app.running.size,0);
});
test('invalid, inaccurate, old and future positions are excluded before queuing',async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true);
  const invalid=app.point(); invalid.coords.latitude=91;
  const inaccurate=app.point(); inaccurate.coords.accuracy=999;
  await app.background([invalid,inaccurate,app.point({timestamp:0}),app.point({timestamp:Date.now()+999999999})]);
  assert.equal(app.queueState().points.length,0);
});
test('queue length is bounded and only acknowledged timestamps are removed',()=>{
  const app=setup(); const now=Date.parse('2026-10-08T08:00:00Z');
  const point={latitude:22,longitude:88,accuracy:5,speed:0,heading:0,altitude:0,recorded_at:new Date(now).toISOString()};
  const queue={session:{...app.session,userId:7},enabled:true,lastPoint:null,points:Array.from({length:10005},(_,i)=>({...point,recorded_at:new Date(now-i*1000).toISOString()}))};
  const bounded=app.queue.queueLocations(queue,[],now); assert.equal(bounded.points.length,5000);
  assert.equal(app.queue.acknowledgeLocations(bounded,[bounded.points[0].recorded_at]).points.length,4999);
  assert.equal(app.queue.queueLocations(queue,[],now+3*86400000).points.length,0);
});
test('root registration observes authentication and leaves routing intact',()=>{
  const root=fs.readFileSync(`${__dirname}/../src/app/_layout.tsx`,'utf8');
  const registration=fs.readFileSync(`${__dirname}/../src/components/EmployeeLocationRegistration.tsx`,'utf8');
  assert.equal(root.match(/<EmployeeLocationRegistration\s*\/>/g).length,1);
  assert.match(registration,/if \(!user \|\| !token\)/);
  assert.match(registration,/startEmployeeLocation\(user.id\)/);
  assert.match(registration,/subscription.remove\(\)/);
  assert.doesNotMatch(registration,/router\.|getCurrentPositionAsync/);
});

test('expired offline points replay only after the same employee authenticates again',async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true); await app.background([app.point()]);
  app.advance(5*3600000); await app.maintainEmployeeLocation();
  assert.equal(app.queueState().enabled,false); assert.equal(app.queueState().points.length,1);
  app.changeSession(); app.offline(false); await app.startEmployeeLocation(7);
  const uploads=app.requests.filter(r=>r.endpoint==='/mobile/location/');
  assert.equal(uploads.at(-1).body.session_id,'session-a');
  assert.equal(app.queueState().session.session_id,'session-b');
  assert.equal(app.queueState().enabled,true);
  assert.equal(JSON.parse(app.values.get('vaani_employee_location_backlog_v1')).length,0);
});
test('a different employee never receives or uploads previous employee offline samples',async()=>{
  const app=setup(); await app.startEmployeeLocation(7); app.offline(true); await app.background([app.point()]);
  app.changeSession(); app.offline(false);
  const before=app.requests.filter(r=>r.endpoint==='/mobile/location/').length;
  await app.startEmployeeLocation(8);
  assert.equal(app.requests.filter(r=>r.endpoint==='/mobile/location/').length,before);
  assert.equal(app.queueState().session.userId,8); assert.equal(app.queueState().points.length,0);
});
test('online logout drains more than one batch before clearing',async()=>{
  const app=setup(); await app.startEmployeeLocation(7);
  const queued=app.queueState(); queued.points=Array.from({length:205},(_,i)=>({latitude:22,longitude:88,accuracy:5,
    recorded_at:new Date(Date.parse('2026-10-08T07:00:00Z')+i*10000).toISOString()}));
  app.values.set('vaani_employee_location_queue_v1',JSON.stringify(queued));
  await app.stopEmployeeLocation();
  assert.deepEqual(app.requests.filter(r=>r.endpoint==='/mobile/location/').map(r=>r.body.points.length),[100,100,5]);
  assert.equal(app.queueState(),null);
});
test('unmount followed by remount does not leave startup cancelled',async()=>{
  const app=setup();
  const first=app.startEmployeeLocation(7);
  const stop=app.stopEmployeeLocation(false);
  const second=app.startEmployeeLocation(7);
  await Promise.all([first,stop,second]);
  assert.equal(app.running.size,2);
});
test('existing logout invokes tracking stop before API and clears credentials even offline',async()=>{
  const events=[]; const storage=new Map([['caller_auth_token','token'],['caller_session_id','sid']]);
  const auth=compile('services/auth.ts',{
    'expo-secure-store':{getItemAsync:async key=>storage.get(key), deleteItemAsync:async key=>{events.push(`delete:${key}`);storage.delete(key);}},
    './employeeLocation':{stopEmployeeLocation:async()=>events.push('stop')},
    './api':{apiRequest:async()=>{events.push('logout');throw new Error('offline');}},
  });
  await auth.logout();
  assert.deepEqual(events.slice(0,2),['stop','logout']); assert.equal(storage.size,0);
});
