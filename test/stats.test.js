import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('article views and weekly totals are isolated by source and legacy totals are preserved',()=>{
 const src=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const store={ws_stats:{count:42},ws_weekly:{legacy:42}};
 const context={Date,curMode:'wiki',lsGet:k=>structuredClone(store[k]),lsSet:(k,v)=>store[k]=structuredClone(v),syncActivityDisplay:()=>{}};
 vm.createContext(context);
 vm.runInContext(src.slice(src.indexOf('function todayKey('),src.indexOf('function renderWeekHeatmap(')),context);
 vm.runInContext("bumpStat('wiki');bumpStat('wiki');bumpStat('how');",context);
 assert.equal(store.ws_stats_wiki.count,2);assert.equal(store.ws_stats_how.count,1);
 assert.equal(Object.values(store.ws_weekly_wiki)[0],2);assert.equal(Object.values(store.ws_weekly_how)[0],1);
 assert.equal(store.ws_stats.count,42);
});

test('weekly calendar always aligns Monday through Sunday using local dates',()=>{
 const src=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const NativeDate=Date;
 class Wednesday extends NativeDate {constructor(...args){super(...(args.length?args:[2026,8,16,18,0,0]));}}
 const el={innerHTML:''};
 const context=vm.createContext({Date:Wednesday,curMode:'wiki',curLang:'en',lsGet:()=>({'2026-09-14':2,'2026-09-16':4}),lsSet(){},document:{getElementById:()=>el}});
 vm.runInContext(src.slice(src.indexOf('function todayKey('),src.indexOf('function syncActivityDisplay(')),context);
 vm.runInContext('renderWeekHeatmap("calendar")',context);
 assert.deepEqual([...el.innerHTML.matchAll(/class="week-day-lbl">(.*?)<\/div>/g)].map(x=>x[1]),['M','T','W','T','F','S','S']);
 assert.deepEqual([...el.innerHTML.matchAll(/data-date="(.*?)"/g)].map(x=>x[1]),['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20']);
 assert.match(el.innerHTML,/data-date="2026-09-16"[^]*?lvl-2 today/);
});
test('activity keeps daily totals and weekly squares without streaks or goals',()=>{
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(app,/s\.streak|day streak|next milestone/);
 assert.doesNotMatch(html,/streak-fire|streak-label|streak-progress|🔥/);
 for(const id of ['streakCount','dkStreakCount','weekHeatmap','dkWeekHeatmap'])assert.ok(html.includes('id="'+id+'"'));
});
