/* Achievements, daily tasks, rewards and inventory. Catalog lives in progression-data.js. */
(function () {
    const STORAGE_KEY = 'progressionStateV1';
    const DAY_MS = 86400000;

    class ProgressionSystem {
        constructor(timer, settingsManager) {
            this.timer = timer;
            this.settingsManager = settingsManager;
            this.catalog = window.PROGRESSION_CATALOG;
            this.state = this._load();
            this._timer = null;
            this.sessionStartedAt = Date.now();
        }

        _defaultState() {
            return { version: 1, rewardLedger: {}, inventoryLedger: {}, unlocked: {}, events: {}, frozenDays: {}, activeBoostUntil: 0, daily: null, updatedAt: 0 };
        }
        _load() { return { ...this._defaultState(), ...(AppStorage.getJSON(STORAGE_KEY, {}) || {}) }; }
        _save(push = true) {
            this.state.updatedAt = Date.now();
            AppStorage.setJSON(STORAGE_KEY, this.state);
            if (push) window.AppSync?.pushProgressionNow?.();
            this.render();
        }
        exportState() { return JSON.parse(JSON.stringify(this.state)); }
        clearLocalState() { this.state=this._defaultState();AppStorage.setJSON(STORAGE_KEY,this.state);this.ensureDaily();this.render(); }
        mergeCloudState(remote) {
            if (!remote) return;
            const local = this.state;
            const merged = { ...this._defaultState(), ...(Number(remote.updatedAt) > Number(local.updatedAt) ? remote : local) };
            merged.rewardLedger = { ...(remote.rewardLedger || {}), ...(local.rewardLedger || {}) };
            merged.inventoryLedger = { ...(remote.inventoryLedger || {}), ...(local.inventoryLedger || {}) };
            merged.unlocked = { ...(remote.unlocked || {}), ...(local.unlocked || {}) };
            merged.events = { ...(remote.events || {}), ...(local.events || {}) };
            merged.frozenDays = { ...(remote.frozenDays || {}), ...(local.frozenDays || {}) };
            merged.activeBoostUntil = Math.max(Number(remote.activeBoostUntil)||0,Number(local.activeBoostUntil)||0);
            if (remote.daily?.date === local.daily?.date) {
                const currentOwner=window.CubeAuth?.getCurrentUser?.()?.uid;
                if(currentOwner&&remote.daily?.ownerId===currentOwner&&local.daily?.ownerId!==currentOwner) merged.daily=remote.daily;
                else if(currentOwner&&local.daily?.ownerId===currentOwner&&remote.daily?.ownerId!==currentOwner) merged.daily=local.daily;
                else merged.daily = Number(remote.daily.updatedAt || 0) > Number(local.daily.updatedAt || 0) ? remote.daily : local.daily;
                const sameAssignment=remote.daily?.ownerId===local.daily?.ownerId&&JSON.stringify(remote.daily?.ids||[])===JSON.stringify(local.daily?.ids||[]);
                if(sameAssignment){
                    merged.daily.completed = { ...(remote.daily.completed || {}), ...(local.daily.completed || {}) };
                    merged.daily.rewarded = { ...(remote.daily.rewarded || {}), ...(local.daily.rewarded || {}) };
                    merged.daily.bonusClaimed = !!(remote.daily.bonusClaimed || local.daily.bonusClaimed);
                }
            } else if (remote.daily && (!local.daily || remote.daily.date > local.daily.date)) merged.daily = remote.daily;
            this.state = merged;
            AppStorage.setJSON(STORAGE_KEY, merged);
            this.ensureDaily();
            this.scheduleEvaluation('cloud');
        }

        get coins() { return Object.values(this.state.rewardLedger || {}).reduce((n, x) => n + Number(x.amount || 0), 0); }
        get inventory() {
            const out = { freezes: 0, coinBoosters: 0, dnfInsurance: 0 };
            Object.values(this.state.inventoryLedger || {}).forEach(x => { if (x.type in out) out[x.type] += Number(x.amount || 0); });
            return out;
        }
        getFrozenDays() { return new Set(Object.keys(this.state.frozenDays || {})); }
        isBoostActive() { return Number(this.state.activeBoostUntil) > Date.now(); }
        _rewardAmount(amount) { return Number(amount) * (this.isBoostActive() ? 2 : 1); }
        _lang() { return getLang() === 'ru' ? 'ru' : 'en'; }
        _text(obj) { return obj?.[this._lang()] || obj?.en || obj?.ru || ''; }
        _dateKey(date = new Date()) {
            return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        }
        _identity() {
            const signedIn=window.CubeAuth?.getCurrentUser?.()?.uid;
            if(signedIn)return signedIn;
            let device=AppStorage.getRaw('progressionDeviceId');
            if(!device){device=`guest_${Math.random().toString(36).slice(2)}`;AppStorage.setRaw('progressionDeviceId',device);}
            return device;
        }
        _allSolves() {
            const rows = [];
            Object.values(this.timer?.sessions || {}).forEach(session => (session.solves || []).forEach(s => rows.push({
                ...s, discipline: session.discipline || '3x3', effective: s.dnf ? Infinity : Number(s.time || 0) + Number(s.penalty || 0)
            })));
            return rows.filter(s => Number(s.timestamp) > 0).sort((a,b) => a.timestamp - b.timestamp);
        }
        _byDiscipline(solves = this._allSolves()) {
            const map = {};
            solves.forEach(s => (map[s.discipline] = map[s.discipline] || []).push(s));
            return map;
        }
        _average(window) {
            if (window.length < 3) return null;
            const dnfs = window.filter(s => s.dnf).length;
            if (dnfs >= 2) return null;
            const times = window.map(s => s.dnf ? Infinity : s.effective).sort((a,b)=>a-b).slice(1,-1);
            return times.some(x=>!Number.isFinite(x)) ? null : times.reduce((a,b)=>a+b,0)/times.length;
        }
        _rolling(solves, count) {
            const out=[];
            for(let i=count-1;i<solves.length;i++) out.push({ index:i, value:this._average(solves.slice(i-count+1,i+1)), solves:solves.slice(i-count+1,i+1) });
            return out.filter(x=>x.value!==null);
        }
        _bestAvg(solves,count) { const v=this._rolling(solves,count).map(x=>x.value); return v.length?Math.min(...v):null; }
        _metrics() {
            const solves=this._allSolves(), byDisc=this._byDiscipline(solves), valid=solves.filter(s=>Number.isFinite(s.effective));
            const dayCounts={}; solves.forEach(s=>dayCounts[this._dateKey(new Date(s.timestamp))]=(dayCounts[this._dateKey(new Date(s.timestamp))]||0)+1);
            const active=[...new Set([...Object.keys(dayCounts),...Object.keys(this.state.frozenDays||{})])].sort(); let streak=0,bestStreak=0,run=0,prev=null;
            active.forEach(k=>{const d=new Date(`${k}T12:00:00`);run=prev&&Math.round((d-prev)/DAY_MS)===1?run+1:1;bestStreak=Math.max(bestStreak,run);prev=d;});
            const streakDays=new Set(active);let cursor=new Date();cursor.setHours(12,0,0,0);if(!streakDays.has(this._dateKey(cursor)))cursor.setDate(cursor.getDate()-1);while(streakDays.has(this._dateKey(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
            const counts=Object.fromEntries(Object.entries(byDisc).map(([k,v])=>[k,v.length]));
            const disciplines=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
            return { solves,byDisc,valid,total:solves.length,pb:valid.length?Math.min(...valid.map(s=>s.effective)):null,
                bestAo5:Math.min(...Object.values(byDisc).map(x=>this._bestAvg(x,5)).filter(x=>x!==null),Infinity),
                bestAo12:Math.min(...Object.values(byDisc).map(x=>this._bestAvg(x,12)).filter(x=>x!==null),Infinity),
                bestAo100:Math.min(...Object.values(byDisc).map(x=>this._bestAvg(x,100)).filter(x=>x!==null),Infinity),
                dayCounts,streak,bestStreak,counts,disciplines,mainDiscipline:disciplines[0]||null,secondaryDiscipline:disciplines[1]||null };
        }
        _snapshot(m=this._metrics()) {
            const currentSession=this.timer?.sessions?.[this.timer.currentSessionId], current=currentSession?.solves||[];
            const days=Object.values(m.dayCounts); const byDisc={};
            Object.entries(m.byDisc).forEach(([d,s])=>byDisc[d]={pb:Math.min(...s.filter(x=>Number.isFinite(x.effective)).map(x=>x.effective),Infinity),bestAo5:this._bestAvg(s,5),bestAo12:this._bestAvg(s,12),bestAo100:this._bestAvg(s,100)});
            return { createdAt:Date.now(),pb:m.pb,bestAo5:Number.isFinite(m.bestAo5)?m.bestAo5:null,bestAo12:Number.isFinite(m.bestAo12)?m.bestAo12:null,bestAo100:Number.isFinite(m.bestAo100)?m.bestAo100:null,
                currentAo5:this._bestAvg(current.map(s=>({...s,effective:s.dnf?Infinity:Number(s.time||0)+Number(s.penalty||0)})),5),
                ao12:this._bestAvg(current.map(s=>({...s,effective:s.dnf?Infinity:Number(s.time||0)+Number(s.penalty||0)})),12),
                ao100:this._bestAvg(current.map(s=>({...s,effective:s.dnf?Infinity:Number(s.time||0)+Number(s.penalty||0)})),100),
                dailyAverage:days.length?days.reduce((a,b)=>a+b,0)/days.length:0,yesterdayCount:m.dayCounts[this._dateKey(new Date(Date.now()-DAY_MS))]||0,
                mainDiscipline:m.mainDiscipline,secondaryDiscipline:m.secondaryDiscipline,disciplineCount:m.disciplines.length,byDisc };
        }
        _eligible(task,s) { return (task.requires||[]).every(r=>({pb:s.pb,ao12:s.ao12,ao100:s.ao100,bestAo5:s.bestAo5,bestAo100:s.bestAo100,dailyAverage:s.dailyAverage,yesterdayCount:s.yesterdayCount,mainDiscipline:s.mainDiscipline,secondaryDiscipline:s.secondaryDiscipline,currentAo5:s.currentAo5,threeDisciplines:s.disciplineCount>=3}[r] ?? false)); }
        _seeded(seed) { let h=2166136261;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return()=>((h=Math.imul(h^(h>>>15),1|h))>>>0)/4294967296; }
        ensureDaily() {
            const date=this._dateKey(),uid=this._identity(); if(this.state.daily?.date===date&&this.state.daily?.ownerId===uid)return;
            this._maybeUseStreakFreeze(date);
            const snapshot=this._snapshot(), eligible=this.catalog.daily.filter(x=>this._eligible(x,snapshot));
            const rnd=this._seeded(`${uid}:${date}`), pool=[...eligible]; for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
            this.state.daily={date,ownerId:uid,ids:pool.slice(0,3).map(x=>x.id),snapshot,completed:{},rewarded:{},bonusClaimed:false,firstSolveAt:null,openSessionStart:Date.now(),deletedCount:0,updatedAt:Date.now()};
            this._save();
        }
        _maybeUseStreakFreeze(todayKey) {
            if(this.inventory.freezes<1)return false;
            const today=this._dateFromKey(todayKey),yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
            const before=new Date(yesterday);before.setDate(before.getDate()-1);
            const yesterdayKey=this._dateKey(yesterday),beforeKey=this._dateKey(before),activity=this._metrics().dayCounts;
            if(activity[yesterdayKey]||this.state.frozenDays?.[yesterdayKey]||(!activity[beforeKey]&&!this.state.frozenDays?.[beforeKey]))return false;
            this.state.frozenDays={...(this.state.frozenDays||{}),[yesterdayKey]:Date.now()};
            this._grantInventory(`freezeUsed:${yesterdayKey}`,'freezes',-1);
            this.state.events.freezeUsed=Date.now();
            this._toast(this._lang()==='ru'?'❄️ Заморозка автоматически спасла стрик':'❄️ A freeze automatically saved your streak');
            return true;
        }
        _dateFromKey(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d);}

        init() {
            this.ensureDaily(); this.evaluate(true);
            window.addEventListener('timerdatachange',e=>{if(e.detail?.type==='delete'&&this.state.daily)this.state.daily.deletedCount++;this.scheduleEvaluation(e.detail?.type||'data');});
            window.addEventListener('progressionevent',e=>this.recordEvent(e.detail?.type));
            this._bindUI(); this.render(); this._scheduleMidnightReset();
        }
        _scheduleMidnightReset() {
            clearTimeout(this._midnightTimer);
            const next=new Date();next.setHours(24,0,0,100);
            this._midnightTimer=setTimeout(()=>{this.ensureDaily();this.evaluate(false);this._scheduleMidnightReset();},Math.max(1000,next-Date.now()));
        }
        scheduleEvaluation() { clearTimeout(this._timer);this._timer=setTimeout(()=>this.evaluate(false),80); }
        recordEvent(type) { if(!type)return;this.state.events[type]=Date.now();this.evaluate(false); }
        _claim(id,amount,label) { if(this.state.rewardLedger[id])return false;const awarded=this._rewardAmount(amount);this.state.rewardLedger[id]={amount:awarded,baseAmount:amount,multiplier:awarded/amount,at:Date.now()};this._toast(`+${awarded} 🪙 · ${label}`);return true; }
        _grantInventory(id,type,amount=1) { if(this.state.inventoryLedger[id])return false;this.state.inventoryLedger[id]={type,amount,at:Date.now()};return true; }
        purchaseItem(type) {
            const products={freezes:{price:1000},dnfInsurance:{price:600},coinBoosters:{price:800}},product=products[type];
            if(!product||this.coins<product.price){this._toast(this._lang()==='ru'?'Недостаточно монет':'Not enough coins');return false;}
            const id=`purchase:${type}:${Date.now()}:${Math.random().toString(36).slice(2,7)}`;
            this.state.rewardLedger[id]={amount:-product.price,at:Date.now(),kind:'purchase'};
            this._grantInventory(id,type,1);this.state.events.shopPurchase=Date.now();this._save();this.scheduleEvaluation('shopPurchase');
            const names=this._lang()==='ru'?{freezes:'Заморозка куплена',dnfInsurance:'Страховка DNF куплена',coinBoosters:'Удвоитель монет куплен'}:{freezes:'Streak Freeze purchased',dnfInsurance:'DNF Insurance purchased',coinBoosters:'Coin Doubler purchased'};
            this._toast(names[type]||'✓','success');return true;
        }
        activateCoinBooster() {
            if(this.inventory.coinBoosters<1||this.isBoostActive())return false;
            const id=`boosterUsed:${Date.now()}`;this._grantInventory(id,'coinBoosters',-1);this.state.activeBoostUntil=Date.now()+86400000;this._toast(this._lang()==='ru'?'⚡ Удвоитель активирован на 24 часа':'⚡ Coin doubler active for 24 hours');this._save();return true;
        }
        useDnfInsurance() {
            if(this.inventory.dnfInsurance<1){this._toast(this._lang()==='ru'?'🛡️ Нужна страховка DNF из магазина':'🛡️ You need DNF insurance from the shop');return false;}
            this._grantInventory(`insuranceUsed:${Date.now()}:${Math.random().toString(36).slice(2,7)}`,'dnfInsurance',-1);this._toast(this._lang()==='ru'?'🛡️ Штраф исправлен — страховка использована':'🛡️ Penalty corrected — insurance used');this._save();return true;
        }

        _achievementDone(a,m) {
            const p=a.condition.split(':');
            if(p[0]==='total')return m.total>=+p[1]; if(p[0]==='single')return m.pb!==null&&m.pb<+p[1]; if(p[0]==='streak')return m.bestStreak>=+p[1];
            if(p[0]==='coins')return this.coins>=+p[1]; if(p[0]==='event')return !!this.state.events[p[1]]; if(p[0]==='disciplines')return m.disciplines.length>=+p[1];
            if(p[0]==='dayCount')return Math.max(0,...Object.values(m.dayCounts))>=+p[1];
            if(p[0]==='ao')return Object.values(m.byDisc).some(s=>s.length>=+p[1]);
            if(p[0]==='avg')return Object.values(m.byDisc).some(s=>this._bestAvg(s,+p[1])!==null&&this._bestAvg(s,+p[1])<+p[2]);
            if(p[0]==='aoDisciplines')return Object.values(m.byDisc).filter(s=>s.length>=+p[1]).length>=+p[2];
            if(p[0]==='cleanStreak'){let run=0,best=0;m.solves.forEach(s=>{run=(!s.dnf&&!s.penalty)?run+1:0;best=Math.max(best,run);});return best>=+p[1];}
            if(p[0]==='night')return m.solves.filter(s=>{const h=new Date(s.timestamp).getHours();return h>=+p[1]&&h<+p[2];}).length>=+p[3];
            if(p[0]==='equalPair')return m.solves.some((s,i)=>i&&Number.isFinite(s.effective)&&Math.round(s.effective*100)===Math.round(m.solves[i-1].effective*100));
            if(p[0]==='focus'){const n=+p[1],d=+p[2];for(let i=n-1;i<m.valid.length;i++){const w=m.valid.slice(i-n+1,i+1),avg=w.reduce((a,b)=>a+b.effective,0)/n;if(w.every(x=>Math.abs(x.effective-avg)<=d))return true;}return false;}
            return false;
        }
        evaluate(retro=false) {
            this.ensureDaily(); const m=this._metrics(); let changed=false;
            this.catalog.achievements.forEach(a=>{if(!this.state.unlocked[a.id]&&this._achievementDone(a,m)){this.state.unlocked[a.id]=Date.now();changed=this._claim(`achievement:${a.id}`,a.reward,this._text(a.name))||changed;}});
            const day=this.state.daily, today=m.solves.filter(s=>this._dateKey(new Date(s.timestamp))===day.date);
            if(today.length&&!day.firstSolveAt){day.firstSolveAt=today[0].timestamp;changed=true;}
            day.ids.forEach(id=>{const task=this.catalog.daily.find(x=>x.id===id);if(!task||day.completed[id])return;const result=this._dailyResult(id,today,day.snapshot,m,day);if(result.done){day.completed[id]=Date.now();changed=this._claim(`daily:${day.date}:${id}`,100,this._text(task.name))||changed;day.rewarded[id]=true;}});
            if(day.ids.length===3&&day.ids.every(id=>day.completed[id])&&!day.bonusClaimed){day.bonusClaimed=true;this._grantInventory(`dailyBonus:${day.date}`,'freezes',1);this._toast(this._lang()==='ru'?'❄️ Идеальный день: +1 заморозка':'❄️ Perfect day: +1 freeze');changed=true;}
            if(changed){day.updatedAt=Date.now();this._save();}else{AppStorage.setJSON(STORAGE_KEY,this.state);this.render();}
        }
        _dailyResult(id,s,b,m,d) {
            const clean=s.filter(x=>!x.dnf), finite=s.filter(x=>Number.isFinite(x.effective)), n=s.length, last=(k)=>s.slice(-k), countWhere=fn=>s.filter(fn).length;
            const rolling=(k)=>this._rolling(s,k), anyAvg=(k,fn)=>rolling(k).some(x=>fn(x.value,x.solves)), consecutive=(k,fn)=>{for(let i=k-1;i<s.length;i++)if(s.slice(i-k+1,i+1).every(fn))return true;return false;};
            const target=(current,total)=>({done:current>=total,current:Math.min(current,total),target:total}); let done=false,current=0,total=1;
            switch(id){
              case'd01':current=countWhere(x=>x.effective<b.pb+.5);total=3;break; case'd02':done=finite.some(x=>x.effective<b.pb-.009);break;
              case'd03':done=anyAvg(5,v=>v<b.ao12);break;case'd04':done=anyAvg(5,v=>v<b.bestAo5);break;case'd05':done=anyAvg(12,v=>v<b.ao100);break;case'd06':done=anyAvg(5,v=>v<b.ao100-1.5);break;case'd07':done=anyAvg(5,v=>v<b.bestAo5);break;
              case'd08':done=consecutive(5,x=>x.effective<b.ao100);break;case'd09':done=finite.some(x=>x.effective<b.pb+.2);break;case'd10':done=anyAvg(100,v=>v<b.bestAo100);break;
              case'd11':total=Math.ceil(b.dailyAverage*1.2);current=n;break;case'd12':current=n;total=300;break;case'd13':current=n;total=500;break;
              case'd14':done=s.some((x,i)=>i>=99&&x.timestamp-s[i-99].timestamp<=5400000);break;case'd15':current=d.firstSolveAt?countWhere(x=>x.timestamp<=d.firstSolveAt+1800000):0;total=50;break;
              case'd16':current=countWhere(x=>x.timestamp>=this.sessionStartedAt);total=100;break;case'd17':current=n;total=Math.max(1,b.yesterdayCount*2);break;
              case'd18':current=countWhere(x=>new Date(x.timestamp).getHours()>=18);total=150;break;case'd19':current=countWhere(x=>new Date(x.timestamp).getHours()<12);total=50;break;
              case'd20':current=Math.floor(finite.reduce((a,x)=>a+x.effective,0)/60);total=40;break;case'd21':done=anyAvg(5,(v,w)=>Math.max(...w.map(x=>x.effective))-Math.min(...w.map(x=>x.effective))<1.5);break;
              case'd22':done=consecutive(10,x=>Math.abs(x.effective-b.ao100)<=1);break;case'd23':done=anyAvg(12,(v,w)=>w.every(x=>!x.dnf&&!x.penalty));break;
              case'd24':done=consecutive(3,(x,i,w)=>i===0||Math.abs(x.effective-w[i-1].effective)<.3);break;case'd25':current=n&&!s.some(x=>x.dnf)?n:0;total=50;break;
              case'd26':done=rolling(5).some(x=>{const before=s[x.index-5],baseline=this._average(s.slice(0,x.index+1).slice(-12));return !!before&&x.solves[0].timestamp-before.timestamp>=10800000&&baseline!==null&&x.value<baseline;});break;
              case'd27':done=consecutive(20,x=>x.effective<b.ao100+2);break;case'd28':done=anyAvg(12,(v,w)=>Math.max(...w.map(x=>x.effective))-Math.min(...w.map(x=>x.effective))<1);break;
              case'd29':current=Math.max(0,n-(d.deletedCount||0));total=100;break;case'd30':{const recent=this._average(last(5)),first=this._average(s.slice(0,5));done=n>=10&&recent!==null&&first!==null&&recent<first;break;}
              case'd31':current=countWhere(x=>x.discipline===b.mainDiscipline);total=150;break;case'd32':current=countWhere(x=>x.discipline===b.secondaryDiscipline);total=50;break;
              case'd33':current=Object.values(this._byDiscipline(s)).filter(x=>x.length>=12).length;total=3;break;case'd34':done=s.some(x=>x.discipline!==b.mainDiscipline&&x.effective<(b.byDisc[x.discipline]?.pb??Infinity));break;
              case'd35':current=countWhere(x=>x.discipline==='2x2');total=100;break;case'd36':current=countWhere(x=>['4x4','5x5','6x6','7x7'].includes(x.discipline));total=20;break;
              case'd37':done=s.some((x,i)=>i>=74&&x.timestamp-s[i-74].timestamp<=3600000);break;case'd38':done=s.some((x,i)=>i>=9&&s.slice(i-9,i+1).every((y,j,w)=>j===0||y.timestamp-w[j-1].timestamp<=120000));break;
              case'd39':done=countWhere(x=>x.discipline==='3x3')>=25&&countWhere(x=>x.discipline==='2x2')>=25&&(countWhere(x=>x.discipline==='pyraminx')>=25||countWhere(x=>x.discipline==='4x4')>=25);break;
              case'd40':current=Math.floor(finite.filter(x=>['4x4','5x5'].includes(x.discipline)).reduce((a,x)=>a+x.effective,0)/60);total=30;break;
              case'd41':done=!!s[0]&&s[0].effective<b.ao100;break;case'd42':done=s.some((x,i)=>i&&s[i-1].penalty===2&&x.effective<b.currentAo5);break;
              case'd43':done=s.some((x,i)=>s[i-1]?.dnf&&s.slice(i,i+10).length===10&&s.slice(i,i+10).every(y=>!y.dnf&&!y.penalty&&y.effective<b.ao100));break;
              case'd44':current=rolling(5).filter(x=>x.value<b.ao12).length;total=3;break;case'd45':current=countWhere(x=>new Date(x.timestamp).getHours()<4);total=30;break;
              case'd46':current=countWhere(x=>{const h=new Date(x.timestamp).getHours();return h>=12&&h<15;});total=50;break;
              case'd47':done=s.some((x,i)=>i>=4&&s.slice(i-4,i+1).every((y,j,w)=>j===0||y.effective<w[j-1].effective));break;
              case'd48':done=rolling(100).some(x=>x.solves.filter(y=>y.dnf).length<=2);break;case'd49':done=finite.some(x=>Math.abs(x.effective-b.ao100)<=.05);break;
              case'd50':done=rolling(12).some(x=>{const dt=new Date(x.solves[11].timestamp);return dt.getHours()===23&&dt.getMinutes()>=50;});break;
            }
            if(total>1)return target(current,total);return{done,current:done?1:0,target:1};
        }

        _bindUI() {
            DOM('progressionClose')?.addEventListener('click',()=>DOM('progressionOverlay')?.classList.remove('visible'));
            DOM('progressionOverlay')?.addEventListener('click',e=>{if(e.target.id==='progressionOverlay')e.currentTarget.classList.remove('visible');});
            DOM('fireMenuAchievements')?.addEventListener('click',()=>this.open('achievements'));
            DOM('fireMenuShop')?.addEventListener('click',()=>this.openShop());
            DOM('shopClose')?.addEventListener('click',()=>DOM('shopOverlay')?.classList.remove('visible'));
            DOM('shopOverlay')?.addEventListener('click',e=>{if(e.target.id==='shopOverlay')e.currentTarget.classList.remove('visible');});
            DOM('shopItemsGrid')?.addEventListener('click',e=>{const buy=e.target.closest('[data-buy-item]'),use=e.target.closest('[data-use-item]');if(buy)this.requestPurchase(buy.dataset.buyItem);if(use?.dataset.useItem==='coinBoosters')this.activateCoinBooster();});
            DOM('shopConfirmCancel')?.addEventListener('click',()=>this.cancelPurchaseConfirmation());
            DOM('shopConfirmBuy')?.addEventListener('click',()=>this.confirmPurchase());
            DOM('shopConfirmOverlay')?.addEventListener('click',e=>{if(e.target.id==='shopConfirmOverlay')this.cancelPurchaseConfirmation();});
            document.querySelectorAll('[data-progression-tab]').forEach(b=>b.addEventListener('click',()=>this.open(b.dataset.progressionTab)));
        }
        requestPurchase(type){
            const products={freezes:{price:1000,icon:'❄️'},dnfInsurance:{price:600,icon:'🛡️'},coinBoosters:{price:800,icon:'⚡'}},product=products[type];if(!product)return;
            const ru=this._lang()==='ru',names=ru?{freezes:'Заморозка ударного режима',dnfInsurance:'Страховка от DNF',coinBoosters:'Удвоитель монет'}:{freezes:'Streak Freeze',dnfInsurance:'DNF Insurance',coinBoosters:'Coin Doubler'};
            this.pendingPurchaseType=type;
            const set=(id,value)=>{if(DOM(id))DOM(id).textContent=value};
            set('shopConfirmIcon',product.icon);set('shopConfirmTitle',ru?'Подтвердить покупку':'Confirm purchase');
            set('shopConfirmText',ru?`Купить «${names[type]}» за ${product.price.toLocaleString('ru-RU')} монет?`:`Buy “${names[type]}” for ${product.price.toLocaleString('en-US')} coins?`);
            set('shopConfirmCancel',ru?'Отмена':'Cancel');set('shopConfirmBuy',ru?'Купить':'Buy');
            DOM('shopConfirmOverlay')?.classList.add('visible');
        }
        cancelPurchaseConfirmation(){this.pendingPurchaseType=null;DOM('shopConfirmOverlay')?.classList.remove('visible');}
        confirmPurchase(){const type=this.pendingPurchaseType;this.cancelPurchaseConfirmation();if(type)this.purchaseItem(type);}
        open(tab='achievements') { this.ensureDaily();this.activeTab=tab;DOM('progressionOverlay')?.classList.add('visible');this.render(); }
        openShop(){this.ensureDaily();DOM('shopOverlay')?.classList.add('visible');this.renderShop();}
        renderShop(){
            const root=DOM('shopOverlay');if(!root)return;const ru=this._lang()==='ru',inv=this.inventory;
            const text=ru?{title:'Магазин',skins:'Скины',effects:'Эффекты',items:'Предметы',titles:'Титулы',soon:'Скоро',owned:'В инвентаре',buy:'Купить',use:'Активировать',active:'Удвоитель активен до',freeze:['Заморозка ударного режима','Автоматически спасает стрик, если пропущен один день. Замороженный день становится синим и не засчитывается в идеальную неделю.'],insurance:['Страховка от DNF','Одноразово позволяет исправить DNF или +2. Сгорает сразу после исправления штрафа.'],booster:['Удвоитель монет','После активации удваивает награды за достижения и задания дня в течение 24 часов.']}:{title:'Shop',skins:'Skins',effects:'Effects',items:'Items',titles:'Titles',soon:'Soon',owned:'In inventory',buy:'Buy',use:'Activate',active:'Coin doubler active until',freeze:['Streak Freeze','Automatically saves your streak after one missed day. The frozen day is blue and prevents a perfect week.'],insurance:['DNF Insurance','Lets you correct one DNF or +2. Consumed immediately when the penalty is corrected.'],booster:['Coin Doubler','After activation, doubles achievement and daily-task rewards for 24 hours.']};
            const set=(id,v)=>{if(DOM(id))DOM(id).textContent=v};set('shopTitle',text.title);set('shopSkinsTab',text.skins);set('shopEffectsTab',text.effects);set('shopItemsTab',text.items);set('shopTitlesTab',text.titles);set('shopItemsTitle',text.items);['shopSkinsSoon','shopEffectsSoon','shopTitlesSoon'].forEach(id=>set(id,text.soon));
            set('shopCoins',this.coins);set('shopFreezes',inv.freezes);set('shopBoosters',inv.coinBoosters);set('shopInsurance',inv.dnfInsurance);
            const boost=DOM('shopActiveBoost');boost?.classList.toggle('hidden',!this.isBoostActive());if(boost&&this.isBoostActive())boost.textContent=`⚡ ${text.active} ${new Intl.DateTimeFormat(ru?'ru-RU':'en-US',{dateStyle:'short',timeStyle:'short'}).format(new Date(this.state.activeBoostUntil))}`;
            const cards=[['freezes','❄️',text.freeze,1000,inv.freezes],['dnfInsurance','🛡️',text.insurance,600,inv.dnfInsurance],['coinBoosters','⚡',text.booster,800,inv.coinBoosters]];
            DOM('shopItemsGrid').innerHTML=cards.map(([type,icon,copy,price,owned])=>`<article class="shop-item-card"><div class="shop-item-icon">${icon}</div><h4>${copy[0]}</h4><p>${copy[1]}</p><div class="shop-item-owned">${text.owned}: ${owned}</div><div class="shop-item-actions"><button class="shop-buy-btn" data-buy-item="${type}" ${this.coins<price?'disabled':''}>${text.buy} · ${price} 🪙</button>${type==='coinBoosters'?`<button class="shop-use-btn" data-use-item="${type}" ${owned<1||this.isBoostActive()?'disabled':''}>${text.use}</button>`:''}</div></article>`).join('');
        }
        render() {
            const root=DOM('progressionOverlay');if(!root)return;const lang=this._lang(),inv=this.inventory;
            const labels=lang==='ru'?{title:'Прогресс',ach:'Достижения',daily:'Задачи дня',coins:'Монеты',freeze:'Заморозки',boost:'Бустеры x2',dnf:'Страховки DNF',locked:'Не выполнено',done:'Получено',perfect:'Выполните все 3 задания и получите заморозку'}:{title:'Progress',ach:'Achievements',daily:'Daily Tasks',coins:'Coins',freeze:'Freezes',boost:'x2 Boosters',dnf:'DNF Insurance',locked:'Locked',done:'Claimed',perfect:'Complete all 3 tasks to earn a freeze'};
            DOM('progressionTitle').textContent=labels.title;DOM('progressionAchievementsTab').textContent=labels.ach;DOM('progressionDailyTab').textContent=labels.daily;
            DOM('progressionCoins').textContent=this.coins;DOM('progressionFreezes').textContent=inv.freezes;DOM('progressionBoosters').textContent=inv.coinBoosters;DOM('progressionDnfInsurance').textContent=inv.dnfInsurance;
            root.querySelectorAll('.progression-wallet small').forEach((el,i)=>el.textContent=[labels.coins,labels.freeze,labels.boost,labels.dnf][i]);
            document.querySelectorAll('[data-progression-tab]').forEach(b=>b.classList.toggle('active',b.dataset.progressionTab===(this.activeTab||'achievements')));
            const achPanel=DOM('progressionAchievements'),dayPanel=DOM('progressionDaily');achPanel.classList.toggle('hidden',(this.activeTab||'achievements')!=='achievements');dayPanel.classList.toggle('hidden',this.activeTab!=='daily');
            achPanel.innerHTML=this.catalog.achievements.map(a=>{const unlocked=!!this.state.unlocked[a.id];return`<article class="achievement-card ${unlocked?'unlocked':''}"><div class="achievement-icon">${unlocked?'🏆':'🔒'}</div><div class="achievement-copy"><h3>${this._text(a.name)}</h3><p>${this._text(a.description)}</p><span>${unlocked?labels.done:labels.locked}</span></div><strong>+${a.reward} 🪙</strong></article>`;}).join('');
            const m=this._metrics(),today=m.solves.filter(s=>this._dateKey(new Date(s.timestamp))===this.state.daily.date);
            dayPanel.innerHTML=`<p class="daily-perfect-hint">❄️ ${labels.perfect}</p>`+this.state.daily.ids.map(id=>{const a=this.catalog.daily.find(x=>x.id===id),r=this._dailyResult(id,today,this.state.daily.snapshot,m,this.state.daily),done=!!this.state.daily.completed[id],pct=Math.min(100,Math.round(r.current/r.target*100));return`<article class="daily-task-card ${done?'completed':''}"><div><span>${done?'✓':'◆'}</span><h3>${this._text(a.name)}</h3><p>${this._text(a.description)}</p></div><strong>+100 🪙</strong><div class="daily-task-progress"><i style="width:${pct}%"></i></div><small>${r.current} / ${r.target}</small></article>`;}).join('');
            if(DOM('shopOverlay')?.classList.contains('visible'))this.renderShop();
        }
        _toast(text,kind='info') {
            let el=DOM('progressionToast');
            if(!el){el=document.createElement('div');el.id='progressionToast';el.className='progression-toast';el.innerHTML='<span class="progression-toast-icon"></span><span class="progression-toast-copy"><strong>Next Cube Pro</strong><span></span></span>';document.body.appendChild(el);}
            const icons={success:'✓',info:'✨'},icon=/❄️/.test(text)?'❄️':/🛡️/.test(text)?'🛡️':/⚡/.test(text)?'⚡':/🪙/.test(text)?'🪙':icons[kind]||icons.info;
            el.dataset.kind=kind;el.querySelector('.progression-toast-icon').textContent=icon;el.querySelector('.progression-toast-copy span').textContent=text;
            el.classList.remove('visible');void el.offsetWidth;el.classList.add('visible');clearTimeout(this._toastTimer);this._toastTimer=setTimeout(()=>el.classList.remove('visible'),3800);
        }
    }
    window.ProgressionSystem=ProgressionSystem;
})();
