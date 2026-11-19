import { handle, DAY } from '../docs/js/engine.js';
import { buildSeed } from '../docs/js/seed.js';
let state=null; const store={load:async()=>state?JSON.parse(JSON.stringify(state)):null,save:async s=>{state=JSON.parse(JSON.stringify(s));}};
const ctx={store,env:{},fetch:async()=>({ok:false}),demo:true,siteBase:'https://x.test/app',seed:buildSeed,autoSeed:true};
let n=0,f=0; const t=(name,c)=>{n++; if(!c){f++;console.log('FAIL',name);}};
const call=async(method,path,body,token,query)=>handle(ctx,{method,path,query:query||{},body:body||{},headers:token?{authorization:'Bearer '+token}:{},ip:'1.1.1.1'});
let r=await call('POST','/api/business/login',{email:'owner@brewandbean.demo',password:'demo1234'}); const tok=r.body.token; t('login',!!tok);
r=await call('GET','/api/business/analytics',null,tok); t('analytics',r.status===200&&!r.body.locked&&r.body.series.days.length===30&&Object.keys(r.body.series.perLocation).length===2);
t('totals after',r.body.totals.after>0&&r.body.totals.before>r.body.totals.after);
r=await call('GET','/api/business/staff',null,tok); t('staff list',r.body.staff.length===5&&r.body.staff.some(s=>s.redemptions>0));
r=await call('POST','/api/business/staff',{name:'Tess',method:'qr'},tok); t('invite qr',r.status===201&&r.body.invitePath.includes('invite='));
const inv=r.body.invitePath.split('invite=')[1];
r=await call('POST','/api/business/staff',{name:'X',method:'email',contact:'bad'},tok); t('invite bad email',r.status===400);
r=await call('POST','/api/staff/accept',{invite:inv,preview:true}); t('preview',r.body.businessName==='Brew & Bean');
r=await call('POST','/api/staff/accept',{invite:inv}); const st=r.body.token; t('accept',!!st);
r=await call('POST','/api/staff/accept',{invite:inv}); t('invite single use',r.status===404);
r=await call('GET','/api/staff/me',null,st); t('staff me',r.status===200);
// find a live deal pass: claim one
r=await call('GET','/api/deals'); const deal=r.body.deals.find(d=>d.biz.name==='Brew & Bean'&&d.type==='percent');
r=await call('POST','/api/claim',{dealId:deal.id,consumerId:'tester'}); const code=r.body.pass.code;
r=await call('POST','/api/staff/redeem',{code,preview:true},st); t('needs amount',r.status===400&&r.body.needsAmount);
r=await call('POST','/api/staff/redeem',{code,before:40,preview:true},st); t('preview calc',r.body.after===Math.round(40*(1-(deal.upgrade?deal.value:deal.value)/100)*100)/100,);
r=await call('POST','/api/staff/redeem',{code,before:40},st); t('redeem',r.status===200);
r=await call('POST','/api/staff/redeem',{code,before:40},st); t('double redeem blocked',r.status===400);
r=await call('GET','/api/business/staff',null,tok); const tess=r.body.staff.find(s=>s.name==='Tess'); t('tess stats',tess.redemptions===1&&tess.before===40&&tess.after<40);
r=await call('POST','/api/business/staff/'+tess.id,{action:'suspend'},tok); r=await call('POST','/api/staff/redeem',{code,before:40},st); t('suspended staff blocked',r.status===401);
// locations
r=await call('POST','/api/business/locations',{name:'Airport',address:'1 Airport Rd',lat:40.7,lng:-73.9},tok); t('add location',r.status===201&&r.body.locations.length===3);
// free biz cannot
r=await call('POST','/api/business/login',{email:'owner@sunnybakery.demo',password:'demo1234'}); const ftok=r.body.token;
r=await call('POST','/api/business/locations',{name:'B',address:'2 Road Street',lat:40,lng:-73},ftok); t('free no locations',r.status===403);
r=await call('GET','/api/business/analytics',null,ftok); t('free locked',r.body.locked);
for(let i=0;i<2;i++) r=await call('POST','/api/business/staff',{name:'Person'+i,method:'qr'},ftok);
r=await call('POST','/api/business/staff',{name:'Third',method:'qr'},ftok); t('free staff cap 2',r.status===400);
// advice
r=await call('POST','/api/business/advice',{},tok); t('advice rules',r.body.source==='rules'&&r.body.tips.length>0);
r=await call('POST','/api/business/advice',{},ftok); t('advice pro only',r.status===403);
// reset flow
r=await call('POST','/api/business/forgot',{email:'owner@sunnybakery.demo'}); t('forgot demo link',!!r.body.demoLink);
const rt=r.body.demoLink.split('reset=')[1];
r=await call('POST','/api/business/forgot',{email:'nobody@x.com'}); t('forgot generic',r.status===200&&!r.body.demoLink);
r=await call('POST','/api/business/reset',{token:rt,password:'short'}); t('weak pw',r.status===400);
r=await call('POST','/api/business/reset',{token:rt,password:'newpass123'}); t('reset ok',r.status===200);
r=await call('POST','/api/business/reset',{token:rt,password:'newpass456'}); t('reset single use',r.status===400);
r=await call('POST','/api/business/login',{email:'owner@sunnybakery.demo',password:'newpass123'}); t('login new',r.status===200);
r=await call('GET','/api/business/me',null,ftok); t('old token revoked',r.status===401);
// admin
r=await call('POST','/api/admin/forgot',{}); const at=r.body.demoLink.split('reset=')[1]; t('admin forgot',!!at);
r=await call('POST','/api/admin/password-reset',{token:at,password:'adminpass1'}); t('admin reset',r.status===200);
r=await call('POST','/api/admin/login',{username:'Admin',password:'Admin'}); t('old admin pw rejected',r.status===401);
r=await call('POST','/api/admin/login',{username:'Admin',password:'adminpass1'}); const atok=r.body.token; t('new admin pw',!!atok&&r.body.usingDefaults===false);
r=await call('GET','/api/admin/stats',null,atok); t('stats',r.body.awaiting===1&&r.body.spottedSuggested===2&&r.body.spottedLive===1&&r.body.liveDeals>0);
r=await call('GET','/api/admin/businesses',null,atok,{awaiting:'1'}); t('awaiting filter',r.body.businesses.length===1&&r.body.businesses[0].status==='pending');
r=await call('GET','/api/admin/deals',null,atok,{live:'1'}); t('admin live deals',r.body.deals.length>0&&r.body.deals.every(d=>d.live));
r=await call('GET','/api/admin/tips',null,atok,{status:'pending'}); t('admin tips',r.body.tips.length===2&&r.body.tips[0].spotterName);
r=await call('GET','/api/admin/businesses/'+(await call('GET','/api/admin/businesses',null,atok)).body.businesses[0].id,null,atok); t('admin detail team',!!r.body.team);
r=await call('POST','/api/tips',{name:'Cafe Z',note:'Nice deal here',spotterName:'Lee',contact:'lee@x.com'}); t('tip needs consent',r.status===400);
r=await call('POST','/api/tips',{name:'Cafe Z',note:'Nice deal here'}); t('tip needs spotter',r.status===400);
r=await call('POST','/api/tips',{name:'Cafe Z',note:'Nice deal here',spotterName:'Lee',contact:'lee@x.com',consent:true}); t('tip ok',r.status===200);
r=await call('GET','/api/deals'); t('public tips hide contact',r.body.tips.every(x=>x.spotter&&!x.contact)&&r.body.tips.length===1);

// ---- v6
r=await call('GET','/api/business/report',null,tok,{kind:'live'}); t('report live asc',r.body.rows.length>0&&r.body.rows.every((x,i,a)=>!i||a[i-1].startsAt<=x.startsAt));
r=await call('GET','/api/business/report',null,tok,{kind:'published'}); t('report published',Array.isArray(r.body.rows));
r=await call('GET','/api/business/report',null,tok,{kind:'saves'}); t('report saves asc',r.body.rows.every((x,i,a)=>!i||a[i-1].savedAt<=x.savedAt)&&r.body.rows.every(x=>typeof x.shared==='boolean'));
r=await call('GET','/api/business/report',null,tok,{kind:'redemptions'}); t('report redemptions desc',r.body.rows.length>0&&r.body.rows.every((x,i,a)=>!i||a[i-1].redemptions>=x.redemptions));
const wk=Date.now()-7*86400000;
const allN=r.body.rows.reduce((n,x)=>n+x.redemptions,0);
r=await call('GET','/api/business/report',null,tok,{kind:'redemptions',from:wk}); const wkN=r.body.rows.reduce((n,x)=>n+x.redemptions,0); t('period narrows',wkN<=allN);
r=await call('GET','/api/business/redemptions',null,tok); t('redemption log has who',r.body.rows.length>0&&r.body.rows.some(x=>x.by==='Owner')&&r.body.rows.some(x=>x.by==='Kai'));
r=await call('GET','/api/business/redemptions',null,tok,{staffId:'owner'}); t('log filter owner',r.body.rows.every(x=>x.by==='Owner'));
// cancel / new phone
r=await call('GET','/api/business/staff',null,tok); const mo=r.body.staff.find(s=>s.name.startsWith('Mo')); t('cancelled stays visible',mo&&mo.status==='cancelled');
const tess2=r.body.staff.find(s=>s.name==='Tess'); 
r=await call('POST','/api/business/staff/'+tess2.id,{action:'reinstate'},tok); t('reinstate',r.status===200);
r=await call('POST','/api/business/staff/'+tess2.id,{action:'new_device'},tok); t('new device link',r.status===200&&r.body.invitePath.includes('invite='));
r=await call('POST','/api/staff/redeem',{code:'X',before:5},st); t('old phone dead after new_device',r.status===401);
const inv2=r.body&&0; 
r=await call('POST','/api/business/staff',{name:'Cam',method:'qr'},tok); const camInv=r.body.invitePath.split('invite=')[1]; const camId=r.body.staff.id;
r=await call('POST','/api/staff/accept',{invite:camInv}); const camTok=r.body.token;
r=await call('POST','/api/business/staff/'+camId,{action:'cancel'},tok); t('cancel ok',r.status===200);
r=await call('GET','/api/staff/me',null,camTok); t('cancelled token dead',r.status===401);
r=await call('POST','/api/business/staff/'+camId,{action:'cancel'},tok); t('double cancel rejected',r.status===400);
// upgrade type
r=await call('GET','/api/business/me',null,tok);
let dr=await call('POST','/api/business/deals',{title:'Upg test',type:'percent',value:10,upgrade:{friendsNeeded:10,upgradedValue:5,upgradedType:'amount'},endsAt:Date.now()+5*86400000},tok); t('percent->$ upgrade, 10 friends ok',dr.status===201||dr.status===200);
dr=await call('POST','/api/business/deals',{title:'Upg bad',type:'percent',value:10,upgrade:{friendsNeeded:11,upgradedValue:20,upgradedType:'percent'},endsAt:Date.now()+5*86400000},tok); t('11 friends rejected',dr.status===400);
dr=await call('POST','/api/business/deals',{title:'Upg same',type:'percent',value:10,upgrade:{friendsNeeded:2,upgradedValue:8,upgradedType:'percent'},endsAt:Date.now()+5*86400000},tok); t('smaller same-type rejected',dr.status===400);
// V7 heart toggle
r=await call('POST','/api/claim',{dealId:deal.id,consumerId:'hearter'}); t('heart saves',r.status===200||r.status===201);
r=await call('GET','/api/passes',null,null,{consumerId:'hearter'}); t('pass in wallet',r.body.passes.length===1);
r=await call('POST','/api/unsave',{dealId:deal.id,consumerId:'hearter'}); t('unheart removes',r.body.removed===true);
r=await call('GET','/api/passes',null,null,{consumerId:'hearter'}); t('wallet empty after unheart',r.body.passes.length===0);
r=await call('POST','/api/unsave',{dealId:deal.id,consumerId:'hearter'}); t('unheart twice is harmless',r.status===200&&r.body.removed===false);
r=await call('POST','/api/claim',{dealId:deal.id,consumerId:'hearter'}); t('can heart again',r.status===200||r.status===201);
r=await call('POST','/api/unsave',{dealId:deal.id,consumerId:'tester'}); t('used pass cannot be unsaved',r.status===400);
// emoji
r=await call('POST','/api/business/profile',{name:'Brew & Bean',blurb:'x',emoji:'👩‍🍳 extra'},tok); r=await call('GET','/api/business/me',null,tok); t('emoji ZWJ kept whole',r.body.business.emoji==='👩‍🍳');
console.log(n-f+'/'+n+' passed'); process.exit(f?1:0);
