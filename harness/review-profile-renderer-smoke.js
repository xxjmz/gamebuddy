'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {buildDashboard}=require('../review/service');
const counters={typedCardsPlayed:10,attacksPlayed:6,cardsTaken:2,rewardSkips:1,eliteEntries:1,normalCombats:3,shopsVisited:1,knownGoldSpent:60,smiths:1,heals:1,playerBlocked:6,playerHpLoss:4};
let dashboard=buildDashboard({runs:['win','loss','abandoned'].map((result,i)=>({runId:'profile-'+i,character:i===2?'silent':'ironclad',endedAt:i+1,result,finalAct:1,finalFloor:10,initialDeckSize:10,finalState:{deckSize:12,gold:20,deck:[],relics:[]},counters}))});
let leaderboardFilters=null;
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'gamebuddy-profile-')));
ipcMain.handle('review:getDashboard',()=>dashboard);
ipcMain.handle('review:getPlayerProfile',()=>({displayName:'匿名人士'}));
ipcMain.handle('review:listLeaderboard',(_event,filters)=>{
  leaderboardFilters=filters;
  return {ok:true,items:[{
    runId:'smoke-run-secret',
    displayName:'烟测选手',
    observedDurationSeconds:75,
    combatSaveLoad:true,
    finalDeck:[{id:'STRIKE',upgraded:true}],
    finalRelics:[{id:'BURNING_BLOOD'}],
    selectedEvents:[{eventId:'FISH',pageId:'INITIAL',optionId:'AGREE'}],
    playerId:'player-smoke-secret'
  }]};
});
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
 win.setSize(1400,1050);await settle();
 await win.webContents.executeJavaScript(`document.querySelector('#review-open-leaderboard').click()`);
 for(let i=0;i<40 && !await win.webContents.executeJavaScript('document.body.innerText.includes("烟测选手")');i++) await new Promise(resolve=>setTimeout(resolve,50));
 assert.deepEqual(leaderboardFilters,{character:'ironclad',ascension:0,gameMode:'Standard'});
 assert.equal(leaderboardFilters.url,undefined);
 assert.equal(leaderboardFilters.method,undefined);
 win.show();win.focus();await settle();
 let board=await win.webContents.executeJavaScript(`(()=>{document.querySelector('.leaderboard-row').click();const row=document.querySelector('.leaderboard-row');row.focus();const style=getComputedStyle(row);return {text:document.body.innerText,html:document.body.innerHTML,width:document.documentElement.scrollWidth,viewport:innerWidth,active:document.activeElement===row,outlineWidth:style.outlineWidth,outlineStyle:style.outlineStyle,outlineColor:style.outlineColor};})()`);
 assert.match(board.text,/通关榜/);assert.match(board.text,/烟测选手/);assert.match(board.text,/01:15/);assert.match(board.text,/有战斗内读档/);
 assert.match(board.text,/STRIKE/);assert.match(board.text,/BURNING_BLOOD/);assert.match(board.text,/FISH \/ INITIAL \/ AGREE/);
 assert.doesNotMatch(board.text,/player-smoke-secret/);assert.doesNotMatch(board.html,/player-smoke-secret/);
 assert.ok(board.width<=board.viewport);assert.equal(board.active,true);assert.equal(board.outlineStyle,'solid');assert.notEqual(board.outlineWidth,'0px');assert.match(board.outlineColor,/32,\s*191,\s*208/);
 win.setSize(850,900);await settle();
 board=await win.webContents.executeJavaScript("({text:document.body.innerText,width:document.documentElement.scrollWidth,viewport:innerWidth})");
 assert.match(board.text,/烟测选手/);assert.match(board.text,/STRIKE/);assert.ok(board.width<=board.viewport);
 await win.webContents.executeJavaScript(`document.querySelector('#review-back-personal').click()`);await settle();
 state=await win.webContents.executeJavaScript("({text:document.body.innerText,polygons:document.querySelectorAll('.review-radar-data').length,width:document.documentElement.scrollWidth,viewport:innerWidth})");
 assert.match(state.text,/全角色 · 最近 3 局/);assert.match(state.text,/放弃 1 局/);assert.equal(state.polygons,1);assert.ok(state.width<=state.viewport);
 assert.doesNotMatch(state.text,/烟测选手/);
 win.setSize(1400,1050);await settle();
 dashboard={...dashboard,axes:dashboard.axes.map((a,i)=>i===0?{...a,value:null}:a)};
 win.webContents.send('review:changed',dashboard);await settle();
 state=await win.webContents.executeJavaScript("({text:document.body.innerText,polygons:document.querySelectorAll('.review-radar-data').length})");
 assert.equal(state.polygons,0);assert.ok(state.text.includes('等待'+dashboard.axes[0].label+'数据'));assert.doesNotMatch(state.text,/再完成 0 局/);
 clearTimeout(timer);win.destroy();console.log('Universal review, three result states, unknown axes and responsive renderer passed: '+output);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(timer);app.exit(1);});
