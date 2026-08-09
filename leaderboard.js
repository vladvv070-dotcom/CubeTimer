/* Global leaderboard client. The write token stays inside the Cloudflare Worker. */
(function(){
    'use strict';
    const API_URL='https://nextcubepro-leaderboard-api.vladvv070.workers.dev';
    const PAGE_SIZE=5;
    const PUZZLES=['2x2','3x3','4x4','5x5','6x6','7x7','pyraminx','megaminx','skewb'];
    const I18N={
        ru:{menu:'Таблица лидеров',title:'Таблица лидеров',rating:'Рейтинг',puzzle:'Головоломка',average:'Среднее',date:'Дата',player:'Игрок',result:'Результат',empty:'В этом рейтинге пока никого нет',loading:'Загрузка рейтинга…',offline:'Таблица лидеров временно недоступна',setup:'Сначала укажите адрес Cloudflare Worker в leaderboard.js',login:'Войдите в аккаунт, чтобы отправить свой результат',groups:{coins:'По монетам',streak:'Ударный режим',totalSolves:'Всего сборок',trainingTime:'Время в таймере',pb:'Лучшие единичные (PB Single)',best:'Лучшие средние',current:'Текущие средние',daily_today:'Скрамбл дня — сегодня',daily_archive:'Зал славы — архив'},contexts:{coins:'Глобальный рейтинг по балансу монет',streak:'Текущая непрерывная серия тренировок',totalSolves:'Все сохранённые сборки аккаунта',trainingTime:'Промежутки между сборками до 10 минут',pb:'Лучший единичный результат',best:'Лучшее среднее за всю историю',current:'Среднее последних сборок',daily_today:'Засчитывается только первая попытка сегодняшнего скрамбла',daily_archive:'Первая попытка выбранного скрамбла дня'},units:{coins:' монет',days:' дн.',solves:' сборок'}},
        en:{menu:'Leaderboard',title:'Leaderboard',rating:'Rating',puzzle:'Puzzle',average:'Average',date:'Date',player:'Player',result:'Result',empty:'No players in this rating yet',loading:'Loading leaderboard…',offline:'Leaderboard is temporarily unavailable',setup:'Set your Cloudflare Worker URL in leaderboard.js first',login:'Sign in to publish your result',groups:{coins:'Coins',streak:'Streak',totalSolves:'Total Solves',trainingTime:'Time in Timer',pb:'PB Single',best:'Best Averages',current:'Current Averages',daily_today:'Daily Scramble — Today',daily_archive:'Hall of Fame — Archive'},contexts:{coins:'Global ranking by coin balance',streak:'Current uninterrupted training streak',totalSolves:'All saved solves on the account',trainingTime:'Time gaps between solves up to 10 minutes',pb:'Best single result',best:'Best average in full history',current:'Average of the latest solves',daily_today:'Only the first attempt at today’s scramble counts',daily_archive:'First attempt at the selected daily scramble'},units:{coins:' coins',days:' days',solves:' solves'}}
    };

    class LeaderboardClient{
        constructor(){this.group='coins';this.puzzle='3x3';this.average='ao5';this.date='';this.page=0;this.dates=[];this.publishTimer=null;}
        t(){return I18N[(window.getLang?.()||document.documentElement.lang)==='ru'?'ru':'en'];}
        el(id){return document.getElementById(id);}
        configured(){return !API_URL.includes('YOUR-SUBDOMAIN');}
        init(){
            this._bind();this.translate();this._renderFilters();
            window.addEventListener('languagechange',()=>{this.translate();this._renderFilters();if(this.visible())this.load();});
            window.addEventListener('firebase-auth-state',()=>this.schedulePublish(1400));
            window.addEventListener('sync-status',e=>{if(e.detail?.state==='synced')this.schedulePublish(900);});
            window.addEventListener('timerdatachange',()=>this.schedulePublish(1800));
        }
        _bind(){
            this.el('fireMenuLeaderboard')?.addEventListener('click',()=>this.open());
            this.el('leaderboardClose')?.addEventListener('click',()=>this.close());
            this.el('leaderboardOverlay')?.addEventListener('click',e=>{if(e.target.id==='leaderboardOverlay')this.close();});
            this.el('leaderboardGroup')?.addEventListener('change',e=>{this.group=e.target.value;this.page=0;this._renderFilters();this.load();});
            this.el('leaderboardPuzzle')?.addEventListener('change',e=>{this.puzzle=e.target.value;this.page=0;this.load();});
            this.el('leaderboardAverage')?.addEventListener('change',e=>{this.average=e.target.value;this.page=0;this.load();});
            this.el('leaderboardDate')?.addEventListener('change',e=>{this.date=e.target.value;this.page=0;this.load();});
            this.el('leaderboardPrev')?.addEventListener('click',()=>{if(this.page){this.page--;this.load();}});
            this.el('leaderboardNext')?.addEventListener('click',()=>{this.page++;this.load();});
            document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.visible())this.close();});
        }
        visible(){return this.el('leaderboardOverlay')?.classList.contains('visible');}
        open(){
            this.el('fireMenuDropdown')?.classList.remove('visible');
            this.el('leaderboardOverlay')?.classList.add('visible');
            this.translate();this._renderFilters();this.load();this.schedulePublish(50);
        }
        close(){this.el('leaderboardOverlay')?.classList.remove('visible');}
        translate(){const t=this.t(),set=(id,v)=>{if(this.el(id))this.el(id).textContent=v;};set('leaderboardMenuLabel',t.menu);set('leaderboardTitle',t.title);set('leaderboardGroupLabel',t.rating);set('leaderboardPuzzleLabel',t.puzzle);set('leaderboardAverageLabel',t.average);set('leaderboardDateLabel',t.date);set('leaderboardPlayerLabel',t.player);set('leaderboardResultLabel',t.result);}
        _setOptions(select,items,value){if(!select)return;select.innerHTML=items.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('');}
        _renderFilters(){
            const t=this.t();
            this._setOptions(this.el('leaderboardGroup'),Object.entries(t.groups),this.group);
            this._setOptions(this.el('leaderboardPuzzle'),PUZZLES.map(p=>[p,this._puzzleName(p)]),this.puzzle);
            const averages=this.group==='current'?['ao5','ao12','ao100']:['ao5','ao12','ao50','ao100'];
            if(!averages.includes(this.average))this.average='ao5';
            this._setOptions(this.el('leaderboardAverage'),averages.map(v=>[v,v.replace('ao','Ao')]),this.average);
            this._setOptions(this.el('leaderboardDate'),this.dates.map(d=>[d,this._formatDate(d)]),this.date);
            const puzzleNeeded=['pb','best','current','daily_today','daily_archive'].includes(this.group);
            this.el('leaderboardPuzzleField')?.classList.toggle('hidden',!puzzleNeeded);
            this.el('leaderboardAverageField')?.classList.toggle('hidden',!['best','current'].includes(this.group));
            this.el('leaderboardDateField')?.classList.toggle('hidden',this.group!=='daily_archive');
            if(this.el('leaderboardContext'))this.el('leaderboardContext').textContent=t.contexts[this.group]||'';
        }
        _puzzleName(p){return ({'2x2':'2x2x2','3x3':'3x3x3','4x4':'4x4x4','5x5':'5x5x5','6x6':'6x6x6','7x7':'7x7x7',pyraminx:'Pyraminx',megaminx:'Megaminx',skewb:'Skewb'}[p]||p);}
        _formatDate(key){const [y,m,d]=key.split('-').map(Number);return new Intl.DateTimeFormat(this.t()===I18N.ru?'ru-RU':'en-US',{year:'numeric',month:'long',day:'numeric'}).format(new Date(y,m-1,d));}
        board(){if(['coins','streak','totalSolves','trainingTime'].includes(this.group))return this.group;if(this.group==='pb')return`pb:${this.puzzle}`;if(this.group==='best'||this.group==='current')return`${this.group}:${this.puzzle}:${this.average}`;const date=this.group==='daily_today'?this._dateKey(new Date()):this.date;return`daily:${date}:${this.puzzle}`;}
        async load(){
            const list=this.el('leaderboardList'),status=this.el('leaderboardStatus');if(!list)return;
            if(!this.configured()){list.innerHTML=`<div class="leaderboard-empty">${this.t().setup}</div>`;this._pageState(0);return;}
            if(this.group==='daily_archive'&&!this.dates.length){await this.loadDates();if(!this.date)this.date=this.dates[0]||'';this._renderFilters();if(!this.date){list.innerHTML=`<div class="leaderboard-empty">${this.t().empty}</div>`;return;}}
            list.innerHTML=Array.from({length:5},()=>'<div class="leaderboard-row leaderboard-skeleton"></div>').join('');status?.classList.add('hidden');
            try{
                const url=new URL(`${API_URL}/leaderboard`);url.searchParams.set('board',this.board());url.searchParams.set('limit',PAGE_SIZE);url.searchParams.set('offset',this.page*PAGE_SIZE);
                const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();this.renderRows(data.rows||[]);this._pageState(data.total||0);
            }catch(error){console.error('Leaderboard load failed',error);list.innerHTML=`<div class="leaderboard-empty">${this.t().offline}</div>`;if(status){status.textContent=String(error.message||error);status.classList.remove('hidden');}this._pageState(0);}
        }
        async loadDates(){try{const response=await fetch(`${API_URL}/dates`);if(response.ok){const data=await response.json();this.dates=data.dates||[];this.date=this.date||this.dates[0]||'';}}catch(_){} }
        renderRows(rows){const list=this.el('leaderboardList');if(!rows.length){list.innerHTML=`<div class="leaderboard-empty">${this.t().empty}</div>`;return;}list.innerHTML=rows.map(row=>{const title=window.progression?.getTitle?.(row.titleId);const titleMarkup=title?window.progression._titleMarkup(title):'';return`<article class="leaderboard-row rank-${row.rank}"><span class="leaderboard-rank">${row.rank}</span><div class="leaderboard-player"><strong class="leaderboard-name">${this.escape(row.nickname||'Cuber')}</strong><span class="leaderboard-user-title">${titleMarkup}</span></div><strong class="leaderboard-result">${this.formatResult(row.score)}</strong></article>`;}).join('');window.progression?.fitTitleElements?.(list);}
        _pageState(total){const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));if(this.page>=pages)this.page=Math.max(0,pages-1);this.el('leaderboardPage').textContent=`${this.page+1} / ${pages}`;this.el('leaderboardPrev').disabled=this.page===0;this.el('leaderboardNext').disabled=this.page+1>=pages;}
        formatResult(score){const n=Number(score)||0,t=this.t();if(this.group==='coins')return`${Math.round(n).toLocaleString()}${t.units.coins}`;if(this.group==='streak')return`${Math.round(n)}${t.units.days}`;if(this.group==='totalSolves')return`${Math.round(n).toLocaleString()}${t.units.solves}`;if(this.group==='trainingTime')return this._duration(n);return this._time(n);}
        _time(seconds){if(!Number.isFinite(seconds))return'—';const m=Math.floor(seconds/60),s=(seconds%60).toFixed(2).padStart(5,'0');return m?`${m}:${s}`:s;}
        _duration(ms){const minutes=Math.round(ms/60000);if(minutes<60)return`${minutes} min`;const hours=Math.floor(minutes/60),rest=minutes%60;return`${hours} h ${rest} min`;}
        schedulePublish(delay=1200){clearTimeout(this.publishTimer);this.publishTimer=setTimeout(()=>this.publish(),delay);}
        async publish(){
            if(!this.configured()||!window.timer||!window.CubeAuth?.getCurrentUser?.())return false;
            try{const token=await window.CubeAuth.getIdToken();const payload=this.metrics();const response=await fetch(`${API_URL}/publish`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`HTTP ${response.status}`);if(this.visible())this.load();return true;}catch(error){console.error('Leaderboard publish failed',error);return false;}
        }
        metrics(){
            const all=[];Object.values(window.timer.sessions||{}).forEach(session=>(session.solves||[]).forEach(s=>all.push({...s,discipline:session.discipline||'3x3',effective:s.dnf?Infinity:Number(s.time||0)+Number(s.penalty||0)})));
            all.sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));const by={};all.forEach(s=>(by[s.discipline]||(by[s.discipline]=[])).push(s));
            let trainingMs=0;for(let i=1;i<all.length;i++){const gap=Number(all[i].timestamp)-Number(all[i-1].timestamp);if(gap>0&&gap<=600000)trainingMs+=gap;}
            const puzzleMetrics={};for(const puzzle of PUZZLES){const solves=by[puzzle]||[],valid=solves.filter(s=>Number.isFinite(s.effective));const best={},current={};for(const count of[5,12,50,100])best[`ao${count}`]=this._bestAverage(solves,count);for(const count of[5,12,100])current[`ao${count}`]=solves.length>=count?this._average(solves.slice(-count)):null;puzzleMetrics[puzzle]={pb:valid.length?Math.min(...valid.map(s=>s.effective)):null,best,current};}
            const dailyMap=new Map();all.filter(s=>s.dailyChallenge&&Number(s.timestamp)>0).forEach(s=>{const date=s.dailyChallengeDate||this._dateKey(new Date(s.timestamp)),puzzle=s.dailyChallengePuzzle||s.discipline,key=`${date}:${puzzle}`;if(!dailyMap.has(key))dailyMap.set(key,s);});
            const daily=[...dailyMap.entries()].slice(-120).map(([key,s])=>{const split=key.indexOf(':');return{date:key.slice(0,split),puzzle:key.slice(split+1),score:Number.isFinite(s.effective)?s.effective:null};}).filter(x=>x.score!==null);
            const streak=window.timer._calculateStreakMetrics?.().current||0,user=window.CubeAuth.getCurrentUser(),local=AppStorage.getJSON('authUser')||{};
            return{nickname:local.nickname||user.displayName||user.email?.split('@')[0]||'Cuber',titleId:window.progression?.state?.equippedTitle||null,global:{coins:window.progression?.coins||0,streak,totalSolves:all.length,trainingTime:trainingMs},puzzles:puzzleMetrics,daily};
        }
        _average(solves){if(solves.length<3)return null;const dnfs=solves.filter(s=>s.dnf).length;if(dnfs>=2)return null;const times=solves.map(s=>s.dnf?Infinity:s.effective).sort((a,b)=>a-b).slice(1,-1);return times.some(x=>!Number.isFinite(x))?null:times.reduce((a,b)=>a+b,0)/times.length;}
        _bestAverage(solves,count){if(solves.length<count)return null;let best=Infinity;for(let i=0;i+count<=solves.length;i++){const value=this._average(solves.slice(i,i+count));if(value!==null)best=Math.min(best,value);}return Number.isFinite(best)?best:null;}
        _dateKey(date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
        escape(value){const node=document.createElement('span');node.textContent=String(value);return node.innerHTML;}
    }
    window.addEventListener('DOMContentLoaded',()=>{window.leaderboard=new LeaderboardClient();window.leaderboard.init();});
})();
