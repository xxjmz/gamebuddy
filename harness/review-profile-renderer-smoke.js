'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {buildDashboard}=require('../review/service');
const counters={typedCardsPlayed:10,attacksPlayed:6,cardsTaken:2,rewardSkips:1,eliteEntries:1,normalCombats:3,shopsVisited:1,knownGoldSpent:60,smiths:1,heals:1,playerBlocked:6,playerHpLoss:4};
let dashboard=buildDashboard({runs:['win','loss','abandoned'].map((result,i)=>({runId:'profile-'+i,character:i===2?'silent':'ironclad',endedAt:i+1,result,finalAct:1,finalFloor:10,initialDeckSize:10,finalState:{deckSize:12,gold:20,deck:[],relics:[]},counters}))});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'gamebuddy-profile-')));
ipcMain.handle('review:getDashboard',()=>dashboard);
const timer=setTimeout(()=>{console.error('Profile renderer timed out');app.exit(1);},20000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1400,height:1050,webPreferences:{preload:path.join(__dirname,'..','preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadFile(path.join(__dirname,'..','src','review.html'));
 const settle=()=>win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await settle();
 let state=await win.webContents.executeJavaScript("({text:document.body.innerText,polygons:document.querySelectorAll('.review-radar-data').length,width:document.documentElement.scrollWidth,viewport:innerWidth})");
 assert.match(state.text,/全角色 · 最近 3 局/);assert.match(state.text,/放弃 1 局/);assert.equal(state.polygons,1);assert.ok(state.width<=state.viewport);
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.review-stat-row').length"),4);
 assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.review-stat-track').length"),3);
 assert.match(state.text,/最多连胜/);
 assert.doesNotMatch(await win.webContents.executeJavaScript("document.querySelector('.review-stats').textContent"),/20张内牌组|火堆升级/);
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('.review-result.abandoned').textContent"),'放弃');
 const output=path.join(__dirname,'..','.runtime','review-profile');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'universal-profile.png'),(await win.webContents.capturePage()).toPNG());
 for(const size of [[1120,720],[850,900]]){win.setSize(...size);await settle();assert.ok(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'));}
 dashboard={...dashboard,axes:dashboard.axes.map((a,i)=>i===0?{...a,value:null}:a)};
 win.webContents.send('review:changed',dashboard);await settle();
 state=await win.webContents.executeJavaScript("({text:document.body.innerText,polygons:document.querySelectorAll('.review-radar-data').length})");
 assert.equal(state.polygons,0);assert.ok(state.text.includes('等待'+dashboard.axes[0].label+'数据'));assert.doesNotMatch(state.text,/再完成 0 局/);
 clearTimeout(timer);win.destroy();console.log('Universal review, three result states, unknown axes and responsive renderer passed: '+output);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(timer);app.exit(1);});
