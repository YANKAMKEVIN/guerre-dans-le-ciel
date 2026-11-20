// Critiques automatiques : des pilotes jouent le jeu et rendent un rapport chiffré.
// Usage : cd tests && npm install && node critiques.js [nom...]
// Critiques : visee, moyen, debutant, perf, lisibilite, interface, son. Sans argument, toutes.
// Le rapport est écrit dans tests/out/rapport.json, les captures dans tests/out/.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(__dirname,'out');
fs.mkdirSync(OUT,{recursive:true});
const THREE_DIR=path.join(__dirname,'node_modules','three');
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}html,body{height:100%}</style></head><body>'
  +fs.readFileSync(path.join(ROOT,'index.html'),'utf8')+'</body></html>';

async function open(browser,{w=480,h=270,diff=1}={}){
  const p=await browser.newPage({viewport:{width:w,height:h}});const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/Failed to load|GPU stall/.test(m.text()))errs.push(m.text().slice(0,200));});
  await p.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>r.fulfill({body:fs.readFileSync(path.join(THREE_DIR,r.request().url().split('three@0.160.0/')[1])),contentType:'application/javascript'}));
  await p.route('https://fonts.googleapis.com/**',r=>r.abort());
  await p.route(/http:\/\/jeu\.local\/.+/,r=>{const f=path.join(ROOT,decodeURIComponent(r.request().url().split('/').pop()));fs.existsSync(f)?r.fulfill({body:fs.readFileSync(f)}):r.abort();});
  await p.route('http://jeu.local/',r=>r.fulfill({body:html,contentType:'text/html'}));
  await p.goto('http://jeu.local/');
  await p.waitForFunction(()=>!document.getElementById('play').disabled,null,{timeout:90000});
  await p.evaluate(d=>__dbg.setDiff(d),diff);
  await p.click('#play');
  return {p,errs};
}

// pilote générique : vise la cible la plus proche ; options de « niveau » du joueur
const PILOT=`window.__pilot=function(o){const D=__dbg;let last={},hist=[],t0=D.time;window.__plog={waves:{},dmg:0,hpMin:100,lastHp:100,deadAt:null,ticks:0};
  return setInterval(()=>{const P=D.P,L=window.__plog;if(D.state!=='play'){if(D.state==='dead'&&L.deadAt===null)L.deadAt=D.time-t0;return;}L.ticks++;
    if(P.hp<L.lastHp)L.dmg+=L.lastHp-P.hp;L.lastHp=P.hp;L.hpMin=Math.min(L.hpMin,P.hp);
    const key=D.phase==='boss'||D.phase==='bossdying'?'dragon':'vague '+D.wave;if(!L.waves[key])L.waves[key]={start:D.time-t0};L.waves[key].end=D.time-t0;
    let tgt=null,best=1e9;const pos=P.pos;
    for(const d of D.demons){const dd=d.g.position.distanceTo(pos);if(dd<best){best=dd;tgt=d.g.position;}}
    if(D.dragon.alive&&D.dragon.dying<0)for(const h of D.dragon.heads)if(h.alive){const dd=h.g.position.distanceTo(pos);if(dd<best){best=dd;tgt=h.g.position;}}
    // retard de réaction : on vise la position d'il y a o.delay secondes
    hist.push({t:D.time,p:tgt?tgt.clone():null});while(hist.length>2&&hist[1].t<D.time-o.delay)hist.shift();const seen=hist[0].p;
    let sx=0,sy=0,fire=false;
    if(seen){const dx=seen.x-pos.x,dy=seen.y-pos.y,dz=seen.z-pos.z,dist=Math.hypot(dx,dy,dz)||1;
      let err=Math.atan2(-dx,-dz)-P.yaw;err=Math.atan2(Math.sin(err),Math.cos(err));err+=(Math.random()-.5)*o.noise;
      const pt=Math.asin(Math.max(-1,Math.min(1,dy/dist)))+(Math.random()-.5)*o.noise;
      sx=Math.max(-1,Math.min(1,-err*2.5));sy=Math.max(-1,Math.min(1,-(pt-P.pitch)*2.5));if(dist<110)sx=sx>0?1:-1;
      fire=!!D.lockT&&Math.random()<o.fireRate;
      if(o.judge&&D.lockT&&(D.demons.filter(d=>d.g.position.distanceTo(pos)<420).length>=2||D.dragon.alive))D.judge();}
    if(o.dodge)for(const f of D.fires)if(f.life>0&&f.m.position.distanceTo(pos)<90){D.dodge();break;}
    D.input(sx*.85,sy*.85,fire);},60);};`;

async function runPilot(browser,name,opts,{diff=1,maxMin=25}={}){
  const {p,errs}=await open(browser,{diff});
  await p.evaluate(PILOT);await p.evaluate(o=>{__dbg.fast();__pilot(o);},opts);
  const t0=Date.now();let st;
  while(Date.now()-t0<maxMin*60000){await p.waitForTimeout(10000);
    st=await p.evaluate(()=>({state:__dbg.state,score:__dbg.score,heads:__dbg.dragon.heads.filter(h=>h.alive).length,log:__plog,simTime:__dbg.time}));
    process.stdout.write(`  [${name}] ${st.state} ${Object.keys(st.log.waves).pop()||''} pv min ${Math.round(st.log.hpMin)}\n`);
    if(st.state!=='play')break;}
  await p.screenshot({path:path.join(OUT,name+'-fin.png')});await p.close();
  const w={};for(const [k,v] of Object.entries(st.log.waves))w[k]=Math.round(v.end-v.start)+' s';
  return {issue:st.state==='won'?'victoire':st.state==='dead'?'défaite':'pas fini',duree_jeu_s:Math.round(st.simTime),phases:w,degats_subis:Math.round(st.log.dmg),pv_minimum:Math.round(st.log.hpMin),mort_a_s:st.log.deadAt&&Math.round(st.log.deadAt),score:st.score,tetes_restantes:st.heads,erreurs:errs};
}

const CRITIQUES={
  // visée et pilotage : vitesse de virage, temps d'inclinaison, temps pour verrouiller et toucher
  async visee(browser){const {p,errs}=await open(browser);await p.waitForTimeout(1500);
    const r=await p.evaluate(async()=>{const D=__dbg,P=D.P,wait=ms=>new Promise(r=>setTimeout(r,ms));const res={};
      // virage à 90° plein régime
      D.input(0,0,false);await wait(400);let y0=P.yaw,t0=D.time;D.input(1,0,false);while(Math.abs(P.yaw-y0)<Math.PI/2&&D.time-t0<10)await wait(16);res.virage_90_s=+(D.time-t0).toFixed(2);
      // inclinaison : temps pour atteindre 63 % de l'angle final
      D.input(0,0,false);await wait(800);t0=D.time;D.input(1,0,false);while(Math.abs(P.roll)<.75*.63&&D.time-t0<5)await wait(16);res.inclinaison_s=+(D.time-t0).toFixed(2);D.input(0,0,false);await wait(800);
      // verrouillage : un démon apparaît à 20° hors de l'axe, le pilote tourne vers lui
      while(!D.demons.length)await wait(100);const d=D.demons[0];const f=P.vel.clone().normalize(),side=new P.pos.constructor(-f.z,0,f.x);
      d.rad=0;d.orbS=0;d.cool=99;d.g.position.copy(P.pos).addScaledVector(f,300).addScaledVector(side,110);d.v.set(0,0,0);
      t0=D.time;let lockAt=null,hitAt=null,hp0=d.hp;
      while(D.time-t0<8&&(lockAt===null||hitAt===null)){const v=d.g.position.clone().sub(P.pos);let e=Math.atan2(-v.x,-v.z)-P.yaw;e=Math.atan2(Math.sin(e),Math.cos(e));
        D.input(Math.max(-1,Math.min(1,-e*2.5)),0,!!D.lockT);if(D.lockT&&lockAt===null)lockAt=D.time-t0;if(d.hp<hp0&&hitAt===null)hitAt=D.time-t0;await wait(16);}
      res.verrouillage_s=lockAt&&+lockAt.toFixed(2);res.premier_impact_s=hitAt&&+hitAt.toFixed(2);D.input(0,0,false);return res;});
    await p.close();return {...r,erreurs:errs};},
  moyen:b=>runPilot(b,'moyen',{delay:0,noise:0,fireRate:1,judge:false,dodge:false}),
  debutant:b=>runPilot(b,'debutant',{delay:.35,noise:.25,fireRate:.6,judge:false,dodge:false}),
  debutant_pelerin:b=>runPilot(b,'debutant_pelerin',{delay:.35,noise:.25,fireRate:.6,judge:false,dodge:false},{diff:0}),
  expert_archange:b=>runPilot(b,'expert_archange',{delay:0,noise:0,fireRate:1,judge:true,dodge:true},{diff:2}),
  // performances : appels de dessin et triangles en vague 1 et contre le Dragon
  async perf(browser){const {p,errs}=await open(browser,{w:1280,h:720});await p.waitForTimeout(4000);
    const m=async()=>p.evaluate(async()=>{const r=__dbg.renderer,w=ms=>new Promise(x=>setTimeout(x,ms));r.info.autoReset=false;await new Promise(requestAnimationFrame);r.info.reset();await new Promise(requestAnimationFrame);const calls=r.info.render.calls,tris=r.info.render.triangles;r.info.autoReset=true;const s=[];for(let i=0;i<20;i++){const t=performance.now();await new Promise(requestAnimationFrame);s.push(performance.now()-t);}
      s.sort((a,b)=>a-b);return {appels:calls,triangles:tris,image_ms_mediane:+s[10].toFixed(1),memoire_textures:r.info.memory.textures,memoire_geometries:r.info.memory.geometries};});
    const vague=await m();await p.evaluate(()=>__dbg.boss());await p.waitForFunction(()=>__dbg.dragon.alive,null,{timeout:120000});await p.waitForTimeout(3000);const dragon=await m();
    await p.close();return {vague_1:vague,dragon,note:'temps d’image mesuré en rendu logiciel (SwiftShader) : seulement comparatif',erreurs:errs};},
  // lisibilité : part de pixels brûlés (quasi blancs) pendant un tir du Dragon, captures clés
  async lisibilite(browser){const {p,errs}=await open(browser,{w:1280,h:720});await p.waitForTimeout(2500);await p.screenshot({path:path.join(OUT,'lisibilite-vague.png')});
    await p.evaluate(()=>__dbg.boss());await p.waitForFunction(()=>__dbg.dragon.alive,null,{timeout:120000});
    const brule=async(file)=>{const buf=await p.screenshot({path:path.join(OUT,file)});return p.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let n=0;
      for(let i=0;i<d.length;i+=4)if(d[i]>245&&d[i+1]>235&&d[i+2]>215)n++;return +(n/(d.length/4)*100).toFixed(1);},buf.toString('base64'));};
    const place=()=>p.evaluate(()=>{const P=__dbg.P,D=__dbg.dragon,f=P.vel.clone().normalize();P.hp=100;D.head.position.copy(P.pos).addScaledVector(f,240);D.head.position.y-=40;D.v.copy(f).multiplyScalar(-20);});
    for(let i=0;i<6;i++){await place();await p.waitForTimeout(250);}const calme=await brule('lisibilite-dragon.png');
    await p.evaluate(()=>__dbg.dragon.heads.forEach(h=>h.cool=.15));for(let i=0;i<3;i++){await place();await p.waitForTimeout(200);}const tir=await brule('lisibilite-tir.png');
    await p.close();return {pixels_brules_dragon_calme_pct:calme,pixels_brules_pendant_tir_pct:tir,erreurs:errs};},
  // interface : chaque point vaut vrai ou faux ; tout doit être vrai
  async interface(browser){const {p,errs}=await open(browser);const ok={};await p.evaluate(()=>__dbg.fast());
    await p.waitForFunction(()=>__dbg.demons.length>0,null,{timeout:60000});
    // invites contextuelles : viser, frapper, esquiver, Jugement, chacune effacée dès le geste réussi
    Object.assign(ok,await p.evaluate(async()=>{const D=__dbg,P=D.P,r={},wait=ms=>new Promise(x=>setTimeout(x,ms)),el=document.getElementById('hint');
      const hint=()=>el.classList.contains('on')?el.textContent:'',until=async(f,s=20)=>{const t0=D.time;while(!f()&&D.time-t0<s)await wait(30);return !!f();};
      const calm=()=>{for(const d of D.demons)d.cool=99;for(const f of D.fires){f.life=0;f.m.visible=false;}P.hp=100;};
      const fwd=()=>P.vel.clone().normalize();
      // les démons sont tenus derrière l'ange, puis l'un d'eux est amené devant
      const hold=setInterval(()=>{calm();D.demons.forEach((d,i)=>{d.g.position.copy(P.pos).addScaledVector(fwd(),window.__front&&i<window.__front?300:-400);d.g.position.x+=i*30;d.v.set(0,0,0);});},16);
      D.input(0,0,false);r.invite_viser=await until(()=>/visez/i.test(hint()));
      window.__front=1;r.invite_frapper=await until(()=>/frappez/i.test(hint()))&&D.tuto.done.aim===true;
      D.input(0,0,true);r.frapper_appris=await until(()=>D.tuto.done.fire===true);D.input(0,0,false);
      window.__front=3;r.invite_jugement=await until(()=>/jugement/i.test(hint()));D.judge();r.jugement_appris=await until(()=>D.tuto.done.judge===true&&!/jugement/i.test(hint()));
      window.__front=0;clearInterval(hold);await wait(200);
      const fb=setInterval(()=>{const f=D.fires[0];f.life=3;f.dmg=0;f.r=3;f.m.visible=true;f.m.position.copy(P.pos).addScaledVector(fwd(),150);f.v.copy(fwd()).multiplyScalar(-1);},16);
      r.invite_esquive=await until(()=>/esquive/i.test(hint())&&el.classList.contains('urgent'));D.dodge();
      r.esquive_apprise=await until(()=>D.tuto.done.dodge===true&&!el.classList.contains('urgent'));clearInterval(fb);D.fires[0].life=0;D.fires[0].m.visible=false;
      return r;}));
    // Lumière basse : barre braise, liseré rouge, musique assourdie ; la part regagnée s'affiche en plus clair
    Object.assign(ok,await p.evaluate(async()=>{const D=__dbg,P=D.P,r={},wait=ms=>new Promise(x=>setTimeout(x,ms)),bar=document.getElementById('hpBar'),dg=document.getElementById('danger'),g=document.getElementById('hpGain');
      const until=async(f,s=20)=>{const t0=D.time;while(!f()&&D.time-t0<s)await wait(30);return !!f();};
      for(const d of D.demons)d.cool=99;P.hp=100;await wait(200);r.lumiere_haute_sans_alerte=!bar.classList.contains('low')&&!dg.classList.contains('on');
      P.hp=22;P.sinceHit=0;r.lumiere_basse_alerte=await until(()=>bar.classList.contains('low')&&dg.classList.contains('on'));
      r.musique_assourdie=!D.AU||await until(()=>D.AU.mlp.frequency.value<3000,6);
      P.sinceHit=6;r.regeneration_visible=await until(()=>g.classList.contains('on')&&parseFloat(g.style.width)>0&&Math.abs(parseFloat(g.style.left)-22)<1.5,6);
      P.hp=80;P.sinceHit=0;r.alerte_levee=await until(()=>!bar.classList.contains('low')&&!dg.classList.contains('on')&&!g.classList.contains('on'));P.hp=100;return r;}));
    // tactile : la recharge se lit sur les boutons ronds (anneau, bouton sombre, éclat au retour)
    Object.assign(ok,await p.evaluate(async()=>{const D=__dbg,P=D.P,r={},wait=ms=>new Promise(x=>setTimeout(x,ms)),tJ=document.getElementById('tJ'),tE=document.getElementById('tE');
      const st=document.getElementById('stage');st.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:7,bubbles:true,clientX:20,clientY:200}));dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:7,bubbles:true}));D.input(0,0,false);
      const until=async(f,s=20)=>{const t0=D.time;while(!f()&&D.time-t0<s)await wait(30);return !!f();},rdy=e=>e.classList.contains('ready');
      P.jCool=0;P.dodgeCool=0;r.tactile_boutons_prets=await until(()=>rdy(tJ)&&rdy(tE))&&!!tJ.querySelector('svg')&&tJ.getAttribute('aria-label')==='Jugement';
      D.judge();D.dodge();r.tactile_recharge_visible=await until(()=>!rdy(tJ)&&!rdy(tE)&&+tJ.style.getPropertyValue('--p')<.5,3);
      P.jCool=.05;P.dodgeCool=.05;r.tactile_eclat_au_retour=await until(()=>rdy(tJ)&&rdy(tE),4)&&tJ.classList.contains('flash')&&tE.classList.contains('flash');
      return r;}));
    await p.close();const rates=Object.keys(ok).filter(k=>ok[k]!==true);return {...ok,rates,erreurs:errs};},
  // son : niveau crête pendant un combat chargé (explosions en série)
  async son(browser){const {p,errs}=await open(browser,{w:640,h:360});await p.waitForTimeout(1500);
    const r=await p.evaluate(async()=>{const A=__dbg.AU,ac=__dbg.ac;if(!A)return {erreur:'audio non initialisé'};const an=ac.createAnalyser();an.fftSize=2048;A.master.connect(an);const b=new Float32Array(2048);let peak=0,sum=0,n=0;
      const iv=setInterval(()=>{an.getFloatTimeDomainData(b);for(const v of b){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}},40);
      for(let i=0;i<8;i++){window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF'}));await new Promise(r=>setTimeout(r,350));}
      await new Promise(r=>setTimeout(r,3000));clearInterval(iv);return {crete_avant_compresseur:+peak.toFixed(2),rms:+Math.sqrt(sum/n).toFixed(3),etat_audio:ac.state};});
    await p.close();return {...r,erreurs:errs};}
};

(async()=>{
  const want=process.argv.slice(2).length?process.argv.slice(2):Object.keys(CRITIQUES);
  const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  const rep={date:new Date().toISOString()};
  for(const k of want){process.stdout.write(`critique « ${k} »…\n`);const t=Date.now();
    try{rep[k]=await CRITIQUES[k](browser);}catch(e){rep[k]={echec:String(e).slice(0,300)};}
    rep[k].temps_reel_s=Math.round((Date.now()-t)/1000);process.stdout.write(JSON.stringify(rep[k])+'\n');
    fs.writeFileSync(path.join(OUT,'rapport.json'),JSON.stringify(rep,null,2));}
  await browser.close();
})();
