const PROFILE_KEY='ncp:profiles';
const DATES_KEY='ncp:daily:dates';
const PUZZLES=new Set(['2x2','3x3','4x4','5x5','6x6','7x7','pyraminx','megaminx','skewb']);
const GLOBALS=new Set(['coins','streak','totalSolves','trainingTime']);

export default{
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'';
    const cors=corsHeaders(origin,env);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try{
      const url=new URL(request.url);
      if(request.method==='GET'&&url.pathname==='/health')return json({ok:true},200,cors);
      if(request.method==='GET'&&url.pathname==='/leaderboard')return await getLeaderboard(url,env,cors);
      if(request.method==='GET'&&url.pathname==='/dates')return await getDates(env,cors);
      if(request.method==='POST'&&url.pathname==='/publish')return await publish(request,env,cors);
      return json({error:'Not found'},404,cors);
    }catch(error){console.error(error);return json({error:'Internal server error'},500,cors);}
  }
};

async function publish(request,env,cors){
  const token=bearer(request);if(!token)return json({error:'Authentication required'},401,cors);
  const account=await verifyFirebaseToken(token,env);if(!account?.localId)return json({error:'Invalid Firebase token'},401,cors);
  const uid=account.localId;
  const limited=await redis(env,['SET',`ncp:rate:${uid}`,'1','EX','8','NX']);
  if(limited===null)return json({error:'Too many updates'},429,cors);
  const body=await request.json();validatePayload(body);
  const nickname=safeText(body.nickname||account.displayName||account.email?.split('@')[0]||'Cuber',32);
  const titleId=body.titleId===null?null:safeText(body.titleId||'',64);
  const profile=JSON.stringify({nickname,titleId,updatedAt:Date.now()});
  const commands=[['HSET',PROFILE_KEY,uid,profile]];
  for(const key of GLOBALS){const score=finiteScore(body.global?.[key],key);commands.push(['ZADD',`ncp:board:${key}`,score,uid]);}
  for(const puzzle of PUZZLES){
    const stats=body.puzzles?.[puzzle]||{};
    addOptional(commands,`ncp:board:pb:${puzzle}`,stats.pb,uid);
    for(const avg of['ao5','ao12','ao50','ao100'])addOptional(commands,`ncp:board:best:${puzzle}:${avg}`,stats.best?.[avg],uid);
    for(const avg of['ao5','ao12','ao100'])addOptional(commands,`ncp:board:current:${puzzle}:${avg}`,stats.current?.[avg],uid);
  }
  for(const item of(body.daily||[]).slice(-120)){
    if(!validDate(item.date)||!PUZZLES.has(item.puzzle)||!validTime(item.score))continue;
    commands.push(['ZADD',`ncp:board:daily:${item.date}:${item.puzzle}`,'NX',Number(item.score),uid]);
    commands.push(['ZADD',DATES_KEY,Date.parse(`${item.date}T00:00:00Z`),item.date]);
  }
  await pipeline(env,commands);
  return json({ok:true},200,cors);
}

async function getLeaderboard(url,env,cors){
  const board=url.searchParams.get('board')||'coins';if(!validBoard(board))return json({error:'Invalid board'},400,cors);
  const limit=Math.min(20,Math.max(1,Number(url.searchParams.get('limit'))||5));
  const offset=Math.max(0,Math.min(10000,Number(url.searchParams.get('offset'))||0));
  const key=`ncp:board:${board}`,descending=GLOBALS.has(board);
  const args=['ZRANGE',key,offset,offset+limit-1];if(descending)args.push('REV');args.push('WITHSCORES');
  const [total,raw]=await Promise.all([redis(env,['ZCARD',key]),redis(env,args)]);
  const pairs=[];for(let i=0;i<(raw||[]).length;i+=2)pairs.push({uid:String(raw[i]),score:Number(raw[i+1])});
  const profiles=pairs.length?await redis(env,['HMGET',PROFILE_KEY,...pairs.map(x=>x.uid)]):[];
  const rows=pairs.map((entry,index)=>{let profile={};try{profile=JSON.parse(profiles?.[index]||'{}');}catch(_){}return{rank:offset+index+1,nickname:profile.nickname||'Cuber',titleId:profile.titleId||null,score:entry.score};});
  return json({rows,total:Number(total)||0},200,cors);
}

async function getDates(env,cors){const dates=await redis(env,['ZRANGE',DATES_KEY,0,364,'REV']);return json({dates:dates||[]},200,cors);}

function validatePayload(body){if(!body||typeof body!=='object'||!body.global||!body.puzzles)throw new Error('Invalid payload');}
function finiteScore(value,key){const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error(`Invalid ${key}`);const max=key==='coins'?1e12:key==='trainingTime'?1e15:1e9;if(n>max)throw new Error(`Invalid ${key}`);return n;}
function validTime(value){const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=86400;}
function addOptional(commands,key,value,uid){if(validTime(value))commands.push(['ZADD',key,Number(value),uid]);else commands.push(['ZREM',key,uid]);}
function validDate(value){return /^20\d{2}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(String(value));}
function validBoard(board){if(GLOBALS.has(board))return true;if(/^pb:/.test(board))return PUZZLES.has(board.slice(3));let match=board.match(/^(best|current):([^:]+):(ao5|ao12|ao50|ao100)$/);if(match)return PUZZLES.has(match[2])&&(match[1]!=='current'||match[3]!=='ao50');match=board.match(/^daily:(20\d{2}-\d{2}-\d{2}):([^:]+)$/);return!!match&&validDate(match[1])&&PUZZLES.has(match[2]);}
function safeText(value,max){return String(value).replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,max)||'Cuber';}
function bearer(request){const value=request.headers.get('Authorization')||'';return value.startsWith('Bearer ')?value.slice(7):null;}

async function verifyFirebaseToken(idToken,env){
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken})});
  if(!response.ok)return null;const data=await response.json();return data.users?.[0]||null;
}
async function redis(env,command){const base=String(env.UPSTASH_REDIS_REST_URL).replace(/\/$/,'');const response=await fetch(base,{method:'POST',headers:{Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command)});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||`Upstash HTTP ${response.status}`);return data.result;}
async function pipeline(env,commands){const base=String(env.UPSTASH_REDIS_REST_URL).replace(/\/$/,'');const response=await fetch(`${base}/pipeline`,{method:'POST',headers:{Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(commands)});const data=await response.json();if(!response.ok)throw new Error(`Upstash pipeline HTTP ${response.status}`);for(const item of data)if(item.error)throw new Error(item.error);return data.map(x=>x.result);}
function corsHeaders(origin,env){const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());const accepted=allowed.includes(origin)?origin:allowed[0]||'*';return{'Access-Control-Allow-Origin':accepted,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json; charset=utf-8'};}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers});}
