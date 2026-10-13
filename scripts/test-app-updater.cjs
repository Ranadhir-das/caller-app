const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function setup(options={}) {
 const files = new Map(), requests=[], validations=[];let downloads=0, release;
 const native={getInstalledAppInfo:async()=>({version:'1.0.1',versionCode:options.currentCode??2,packageName:'com.vaani.caller'}),validateApk:async(uri,code)=>{validations.push([uri,code]);if(options.badApk)throw Error('Invalid APK');return true;},installApk:async()=>options.permission?'permission_required':'installer_opened',openInstallSettings:async()=>{}};
 const info={latest_version:'1.0.2',version_code:3,minimum_version_code:1,mandatory:false,download_url:'https://vaaniapp.co.in/dist/vaani.apk',...options.info};
 const FS={cacheDirectory:'file:///cache/',getInfoAsync:async uri=>files.has(uri)?{exists:true,size:files.get(uri),isDirectory:false}:{exists:false},makeDirectoryAsync:async()=>{},deleteAsync:async uri=>files.delete(uri),moveAsync:async({from,to})=>{files.set(to,files.get(from));files.delete(from)},createDownloadResumable:(url,uri,headers,progress)=>{requests.push({url,headers});return {cancelAsync:async()=>{},downloadAsync:async()=>{downloads++;progress({totalBytesWritten:50,totalBytesExpectedToWrite:100});if(options.hold)await new Promise(r=>release=r);if(options.fail){options.fail=false;throw Error('Network failed')}files.set(uri,options.empty?0:100);return {status:options.downloadStatus??200,headers:options.headers||{},uri}}}}};
 class ApiError extends Error {constructor(message,status){super(message);this.status=status;}}
 const exports={};const mocks={'react-native':{Platform:{OS:options.platform||'android'}},'expo-modules-core':{requireOptionalNativeModule:()=>options.noNative?null:native},'expo-file-system/legacy':FS,'./api':{ApiError,apiRequest:async(path,opts)=>{requests.push({path,opts});if(options.apiStatus)throw new ApiError('App update information is not available yet. Contact your administrator.',options.apiStatus);if(options.apiFail)throw Error('API failed');return info}}};
 const compiled=ts.transpileModule(fs.readFileSync('src/services/appUpdater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{exports,require:n=>{if(!(n in mocks))throw Error(n);return mocks[n]},URL,AbortController,setTimeout,clearTimeout,console});
 return {api:exports,files,requests,validations,options,get downloads(){return downloads},release:()=>release()};
}
test('installed build code, optional notes and version comparisons',async()=>{const x=setup();await x.api.getAppUpdateInfo('private-token');assert.equal(x.api.getUpdateState().current.versionCode,2);assert.equal(x.api.getUpdateState().status,'update_available');assert.equal(x.api.getUpdateState().info.release_notes.length,0);assert.equal(x.requests[0].path,'/mobile/app-update/');const y=setup({info:{version_code:2}});await y.api.getAppUpdateInfo();assert.equal(y.api.getUpdateState().status,'up_to_date')});
test('progress, duplicate prevention, token-free download, cache detection and installer',async()=>{const x=setup({hold:true});await x.api.getAppUpdateInfo('private-token');const promise=x.api.downloadLatestApk();await new Promise(r=>setImmediate(r));assert.equal(x.api.getUpdateState().progress,.5);await x.api.downloadLatestApk();assert.equal(x.downloads,1);x.release();await promise;assert.equal(x.api.getUpdateState().status,'downloaded');assert.equal(Object.keys(x.requests[1].headers).length,0);assert.ok(!JSON.stringify(x.requests[1]).includes('private-token'));await x.api.getAppUpdateInfo();assert.equal(x.api.getUpdateState().status,'downloaded');await x.api.installDownloadedApk();assert.match(x.api.getUpdateState().message,/cancel/);assert.equal(x.api.getUpdateState().status,'downloaded')});
test('network failure cleans partial file and can retry',async()=>{const x=setup({fail:true});await x.api.getAppUpdateInfo();await x.api.downloadLatestApk();assert.equal(x.api.getUpdateState().status,'error');assert.equal(x.files.size,0);await x.api.downloadLatestApk();assert.equal(x.api.getUpdateState().status,'downloaded')});
test('empty or wrong APK cannot install',async()=>{for(const opts of [{empty:true},{badApk:true}]){const x=setup(opts);await x.api.getAppUpdateInfo();await x.api.downloadLatestApk();assert.equal(x.api.getUpdateState().status,'error');assert.equal(x.api.getUpdateState().fileUri,undefined)}});
test('missing file and unknown-app permission are recoverable',async()=>{const x=setup({permission:true});await x.api.getAppUpdateInfo();await x.api.downloadLatestApk();await x.api.installDownloadedApk();assert.equal(x.api.getUpdateState().permissionRequired,true);x.files.clear();await x.api.installDownloadedApk();assert.equal(x.api.getUpdateState().status,'error');assert.equal(x.api.getUpdateState().fileUri,undefined)});
test('API failure, unsupported platforms and old binaries fail safely',async()=>{for(const opts of [{apiFail:true},{platform:'ios'},{platform:'web'},{noNative:true}]){const x=setup(opts);await x.api.getAppUpdateInfo();assert.equal(x.api.getUpdateState().status,'error')}});
test('reject insecure and credential-bearing metadata',()=>{const x=setup();for(const url of ['http://example.com/a.apk','https://user:pass@example.com/a.apk','https://example.com/a.apk?token=secret'])assert.throws(()=>x.api.parseUpdateInfo({latest_version:'1',version_code:2,minimum_version_code:1,mandatory:false,download_url:url}));});


test('1.0.1 (17) offers 1.0.1 (18) despite identical displayed version names',async()=>{
 const x=setup({currentCode:17,info:{latest_version:'1.0.1',version_code:18}});
 await x.api.getAppUpdateInfo('private-token');
 assert.equal(x.api.getUpdateState().status,'update_available');
 await x.api.downloadLatestApk();
 assert.equal(x.api.getUpdateState().status,'downloaded');
 assert.equal(x.validations.at(-1)[1],18);
});
test('unconfigured CRM metadata (503) gives a publication error and cannot download',async()=>{
 const x=setup({currentCode:17,apiStatus:503,info:{latest_version:'1.0.1',version_code:18}});
 await x.api.getAppUpdateInfo();
 assert.equal(x.api.getUpdateState().status,'error');
 assert.match(x.api.getUpdateState().error,/CRM has not configured/);
 assert.equal(x.api.getUpdateState().info,undefined);
 await x.api.downloadLatestApk();assert.equal(x.downloads,0);
});
test('failed metadata recheck clears stale release actions without deleting a valid cached APK',async()=>{
 const x=setup();await x.api.getAppUpdateInfo();await x.api.downloadLatestApk();
 assert.equal(x.api.getUpdateState().status,'downloaded');x.options.apiStatus=503;
 await x.api.getAppUpdateInfo();assert.equal(x.api.getUpdateState().info,undefined);
 assert.equal(x.api.getUpdateState().fileUri,undefined);assert.equal(x.files.size,1);
 await x.api.downloadLatestApk();assert.equal(x.downloads,1);
 x.options.apiStatus=undefined;await x.api.getAppUpdateInfo();assert.equal(x.api.getUpdateState().status,'downloaded');
});
test('missing configured APK (404) identifies publication problem, cleans partial bytes and permits retry',async()=>{
 const x=setup({downloadStatus:404});await x.api.getAppUpdateInfo();await x.api.downloadLatestApk();
 assert.equal(x.api.getUpdateState().status,'error');assert.match(x.api.getUpdateState().error,/HTTP 404/);
 assert.equal(x.api.getUpdateState().fileUri,undefined);assert.equal(x.files.size,0);
 x.options.downloadStatus=200;await x.api.downloadLatestApk();assert.equal(x.api.getUpdateState().status,'downloaded');
});
test('private APK URLs report a download permission problem without sending the employee token',async()=>{
 for(const code of [401,403]){
  const x=setup({downloadStatus:code});await x.api.getAppUpdateInfo('private-token');await x.api.downloadLatestApk();
  assert.match(x.api.getUpdateState().error,/not publicly accessible/);assert.equal(x.files.size,0);
  assert.ok(!JSON.stringify(x.requests[1]).includes('private-token'));
 }
});
test('mismatched byte length is rejected before native validation; complete bytes proceed',async()=>{
 const x=setup({headers:{'Content-Length':'200'}});await x.api.getAppUpdateInfo();await x.api.downloadLatestApk();
 assert.match(x.api.getUpdateState().error,/incomplete/);assert.equal(x.validations.length,0);assert.equal(x.files.size,0);
 x.options.headers={'content-length':'100'};await x.api.downloadLatestApk();assert.equal(x.api.getUpdateState().status,'downloaded');
});
