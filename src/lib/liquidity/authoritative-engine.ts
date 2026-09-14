/**
 * SINGLE AUTHORITATIVE LIQUIDITY INTELLIGENCE ENGINE
 *
 * One pipeline owns observation, Sentinel psychology, formation memory,
 * evidence events, trajectory, lifecycle, ranking, qualification and scan.
 * UI code must only consume EngineSnapshot and never reimplement these rules.
 */
export const WINDOWS = [10, 20, 30, 60, 120, 240, 500, 1000] as const;
export type Side = 'OVER' | 'UNDER';
export type Lifecycle =
  | 'NO_LIQUIDITY' | 'FORMING' | 'BUILDING' | 'MATURE'
  | 'EXHAUSTION_WATCH' | 'EXHAUSTION_CONFIRMED' | 'DELIVERY'
  | 'DELIVERY_ACCELERATING' | 'ABSORBING' | 'RELEASE_WATCH' | 'RELEASE'
  | 'RIPE' | 'CONFIRMED' | 'CONFLICTED' | 'BLOCKED' | 'INVALIDATED';
export type TrajectoryDirection = 'STRENGTHENING' | 'STABLE' | 'WEAKENING' | 'REVERSING' | 'CONFLICTED';

export interface Tick { d: number; q?: number; t?: number }
export interface Psychology {
  green: number; secondGreen: number; red: number; secondRed: number;
  purple: number | null; pct: number[]; pressure: number[];
  winners: number[]; losers: number[]; valid: boolean;
  outcome: 'BOOTSTRAP' | 'ACCEPT' | 'WATCH' | 'REJECT'; reasons: string[];
}
export interface EvidenceEvent {
  id: string; at: number; tick: number; type: string; message: string;
  dimension: 'FORMATION' | 'RESERVOIR' | 'EXHAUSTION' | 'DELIVERY' | 'MIGRATION' | 'ABSORPTION' | 'RELEASE' | 'RANK' | 'QUALIFICATION' | 'CONFLICT' | 'LIFECYCLE';
  strength: number;
}
export interface Trajectory {
  direction: TrajectoryDirection; scoreSlope: number; reservoirTrend: number;
  exhaustionTrend: number; deliveryTrend: number; migrationTrend: number;
  absorptionTrend: number; evidenceMomentum: number; persistence: number;
  acceleration: number; consistency: number; lastMeaningfulChange: number;
}
export interface Formation {
  id: string; generation: number; market: string; contract: string; side: Side; barrier: number;
  birthAt: number; birthTick: number; lastAt: number; lastTick: number; ageTicks: number;
  phase: Lifecycle; previousPhase: Lifecycle | null; phaseEnteredAt: number;
  psychology: Psychology; reservoirDigits: number[]; dominantDigits: number[];
  reservoirScore: number; exhaustionScore: number; deliveryScore: number; migrationScore: number;
  absorptionScore: number; releaseScore: number; confirmationScore: number; conflictScore: number;
  evidenceQuality: number; evidencePersistence: number; structuralCoherence: number;
  trajectory: Trajectory; evidence: EvidenceEvent[]; vetoes: string[];
  history: Array<{tick:number;at:number;phase:Lifecycle;score:number;reservoir:number;exhaustion:number;delivery:number;migration:number}>;
  rank: number; previousRank: number | null; rankChange: number; timeAtRank: number;
  qualified: boolean; qualificationReason: string;
  active: boolean;
}
export interface RankedFormation extends Formation { rankScore: number; whyRanked: string[] }
export interface ScanSnapshot {
  id: string; scannedAt: number; rank1: RankedFormation | null; bestQualified: RankedFormation | null;
  candidates: RankedFormation[]; override: boolean; overrideReason: string;
}
export interface EngineSnapshot {
  formations: RankedFormation[]; scanned: ScanSnapshot | null; scanHistory: ScanSnapshot[];
  eventFeed: EvidenceEvent[]; updatedAt: number; version: number;
}

const clamp=(x:number,a=0,b=100)=>Math.max(a,Math.min(b,x));
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const dist=(ds:number[])=>{const c=Array(10).fill(0);for(const d of ds)if(d>=0&&d<10)c[d]++;const n=Math.max(1,ds.length);return c.map(x=>x/n)};
const entropy=(p:number[])=>-p.reduce((s,x)=>s+(x>0?x*Math.log2(x):0),0)/Math.log2(10);
const jsd=(a:number[],b:number[])=>{const m=a.map((x,i)=>(x+b[i])/2);const kl=(x:number[],y:number[])=>x.reduce((s,v,i)=>s+(v>0?v*Math.log2(v/Math.max(y[i],1e-9)):0),0);return Math.max(0,(kl(a,m)+kl(b,m))/2)};
const ewma=(a:number[],lambda=.2)=>{if(!a.length)return 0;let z=a[0];for(let i=1;i<a.length;i++)z=lambda*a[i]+(1-lambda)*z;return z};
const slope=(a:number[])=>{if(a.length<4)return 0;const n=a.length,m=mean(a),mx=(n-1)/2,den=a.reduce((s,_,i)=>s+(i-mx)**2,0)||1;return a.reduce((s,y,i)=>s+(i-mx)*(y-m),0)/den};
const rate=(ds:number[],d:number,w:number)=>{const x=ds.slice(-w);return x.filter(v=>v===d).length/Math.max(1,x.length)};
const change=(a:number[])=>{if(a.length<12)return 0;const h=Math.floor(a.length/2),a1=mean(a.slice(0,h)),a2=mean(a.slice(h)),v=mean(a.map(x=>(x-mean(a))**2));return clamp(Math.abs(a2-a1)/(Math.sqrt(v)+1e-6)*18)};
const now=()=>Date.now();

export function sentinelPsychology(ds:number[],side:Side,barrier:number):Psychology{
  const x=ds.slice(-1000),p=dist(x),h=Math.max(1,Math.floor(x.length/2));
  const first=dist(x.slice(0,h)),second=dist(x.slice(h));
  const pressure=p.map((_,d)=>(second[d]??0)-(first[d]??0));
  const order=[0,1,2,3,4,5,6,7,8,9].sort((a,b)=>p[b]-p[a]||a-b);
  const green=order[0],secondGreen=order[1],red=order[9],secondRed=order[8];
  let purple:number|null=null,best=.005;for(let d=0;d<10;d++)if(pressure[d]>best){best=pressure[d];purple=d}
  const winners=[...Array(10).keys()].filter(d=>side==='OVER'?d>barrier:d<barrier),losers=[...Array(10).keys()].filter(d=>!winners.includes(d));
  const reasons:string[]=[];const bars=[green,secondGreen,red,secondRed,...(purple===null?[]:[purple])];
  if(bars.filter(d=>losers.includes(d)).length>2)reasons.push('3+ Sentinel bars are on the losing side');
  if(losers.includes(red))reasons.push(`Red d${red} is losing-side`);
  if(losers.includes(secondRed))reasons.push(`2nd Red d${secondRed} is losing-side`);
  if(losers.includes(secondGreen))reasons.push(`2nd Green d${secondGreen} is losing-side`);
  if(purple!==null&&losers.includes(purple))reasons.push(`Purple d${purple} is losing-side`);
  if(losers.includes(green)) { if(p[green]<.105) reasons.push(`Green d${green} below 10.5% exhaustion threshold`); else if(pressure[green]>.005) reasons.push(`Green d${green} is still increasing`); }
  else { if(side==='UNDER'&&green%2===0)reasons.push(`UNDER Green d${green} must be odd`); if(side==='OVER'&&green%2!==0)reasons.push(`OVER Green d${green} must be even`); }
  if(!losers.includes(red)){if(side==='UNDER'&&(red%2!==1&&red!==8)){};if(side==='UNDER'&&(red%2!==0||red===8))reasons.push(`UNDER Red d${red} must be even and never 8`);if(side==='OVER'&&(red%2===0||red===1))reasons.push(`OVER Red d${red} must be odd and never 1`)}
  if(side==='UNDER'&&p[9]>=.105&&pressure[9]>.005)reasons.push('UNDER d9 is elevated and still increasing');
  if(side==='OVER'&&p[0]>=.105&&pressure[0]>.005)reasons.push('OVER d0 is elevated and still increasing');
  const valid=x.length>=1000&&reasons.length===0;
  return {green,secondGreen,red,secondRed,purple,pct:p,pressure,winners,losers,valid,outcome:x.length<1000?'BOOTSTRAP':valid?'ACCEPT':reasons.length<=1?'WATCH':'REJECT',reasons};
}

function transition(ds:number[],from:number[],to:number[]){
  const calc=(x:number[])=>{let n=0,h=0;for(let i=0;i<x.length-1;i++)if(from.includes(x[i])){n++;if(to.includes(x[i+1]))h++}return n?h/n:0};
  const recent=calc(ds.slice(-500)),baseline=calc(ds.slice(-1000,-500));return {recent,baseline,delta:recent-baseline,strength:clamp((recent-baseline)*700)};
}
function windowSeries(ds:number[],d:number,w=20){const x=ds.slice(-Math.min(ds.length,Math.max(120,w*6)));const out:number[]=[];for(let i=w;i<=x.length;i++)out.push(rate(x.slice(0,i),d));return out.slice(-60)}

function deriveFormation(market:string,ds:number,raw:number[],side:Side,barrier:number,old:Formation|undefined,at:number):Formation{
  const p=sentinelPsychology(raw,side,barrier), reservoir=[p.red,p.secondRed].filter(d=>p.winners.includes(d)), dominant=[p.green,p.secondGreen];
  const temporal=(d:number)=>{const r20=rate(raw,d,20),r60=rate(raw,d,60),r120=rate(raw,d,120),r240=rate(raw,d,240),r500=rate(raw,d,500);const s=windowSeries(raw,d),es=ewma(s)-r120;return {r20,r60,r120,r240,r500,slope:slope(s),es,cp:change(s),div:r20-r500}}
  const td=(d:number)=>temporal(d);
  const reservoirScore=reservoir.length?clamp(mean(reservoir.map(d=>clamp(45+(.10-p.pct[d])*900)))*.65+(reservoir.length===2?35:10)):0;
  const exhaustion=clamp(mean(dominant.map(d=>{const x=td(d);return clamp(50-x.slope*7000+Math.max(0,-x.es)*3000+x.cp*.45)})));
  const delivery=reservoir.length?clamp(mean(reservoir.map(d=>{const x=td(d);return clamp(35+(x.r20-x.r60)*7000+(x.r60-x.r120)*4000+Math.max(0,x.es)*3000+x.cp*.2)}))):0;
  const tr=transition(raw,dominant,reservoir),purpleAligned=p.purple!==null&&reservoir.includes(p.purple);
  const migration=clamp(tr.strength*.8+(purpleAligned?35:0));
  const h20=entropy(dist(raw.slice(-20))),h120=entropy(dist(raw.slice(-120))),h500=entropy(dist(raw.slice(-500)));
  const ev=h20-h120,ea=(h20-h120)-(h120-h500),div=jsd(dist(raw.slice(-20)),dist(raw.slice(-500)));
  const absorption=clamp(delivery*.45+exhaustion*.3+migration*.25);
  const conflict=clamp((p.valid?0:45)+(p.outcome==='WATCH'?12:0)+Math.max(0,45-migration)*.35);
  const release=clamp(exhaustion*.35+delivery*.35+migration*.2+absorption*.1);
  const confirmation=clamp(reservoirScore*.16+exhaustion*.20+delivery*.24+migration*.16+absorption*.14+clamp(div*220)*.1);
  const vetoes=[...p.reasons];if(!reservoir.length)vetoes.push('No Sentinel-valid winning-side Red/2nd-Red reservoir');
  const rawEvidence=[reservoirScore,exhaustion,delivery,migration,absorption,release].filter(x=>x>=60).length;
  const evidenceQuality=clamp(rawEvidence*16+(p.valid?25:0)+(purpleAligned?10:0));
  const structuralCoherence=clamp((p.valid?45:0)+Math.min(25,reservoir.length*12)+Math.min(20,Math.max(0,exhaustion+delivery+migration-120)/4));
  const previousScore=old?.confirmationScore??confirmation;
  const scoreDelta=confirmation-previousScore;
  const phaseCandidate=()=>{
    if(!p.valid&&p.outcome==='REJECT')return 'BLOCKED' as Lifecycle;
    if(conflict>=82)return 'CONFLICTED' as Lifecycle;
    if(confirmation<25&&reservoirScore<35)return 'NO_LIQUIDITY' as Lifecycle;
    if(exhaustion>=82&&delivery>=82&&migration>=68&&release>=78)return 'RELEASE' as Lifecycle;
    if(release>=76&&exhaustion>=75&&delivery>=70)return 'RELEASE_WATCH' as Lifecycle;
    if(absorption>=72&&delivery>=65)return 'ABSORBING' as Lifecycle;
    if(delivery>=80&&migration>=62)return 'DELIVERY_ACCELERATING' as Lifecycle;
    if(delivery>=62)return 'DELIVERY' as Lifecycle;
    if(exhaustion>=75)return 'EXHAUSTION_CONFIRMED' as Lifecycle;
    if(exhaustion>=62)return 'EXHAUSTION_WATCH' as Lifecycle;
    if(reservoirScore>=72&&evidenceQuality>=55)return 'MATURE' as Lifecycle;
    if(reservoirScore>=52)return 'BUILDING' as Lifecycle;
    if(reservoirScore>=35)return 'FORMING' as Lifecycle;
    return 'NO_LIQUIDITY' as Lifecycle;
  };
  let phase=phaseCandidate();
  // Score alone never upgrades a formation to a terminal state.
  const matureEvidence=(old?.ageTicks??0)>=12&&evidenceQuality>=55&&structuralCoherence>=55&&reservoirScore>=65;
  if(phase==='MATURE'&&!matureEvidence)phase='BUILDING';
  if(phase==='RELEASE_WATCH'&&!(matureEvidence&&exhaustion>=70&&delivery>=62))phase='EXHAUSTION_WATCH';
  if(phase==='RELEASE'&&!(matureEvidence&&exhaustion>=82&&delivery>=82&&migration>=68))phase='RELEASE_WATCH';
  if(phase==='CONFIRMED')phase='RIPE';
  if(old&&old.active){
    const order:Lifecycle[]=['NO_LIQUIDITY','FORMING','BUILDING','MATURE','EXHAUSTION_WATCH','EXHAUSTION_CONFIRMED','DELIVERY','DELIVERY_ACCELERATING','ABSORBING','RELEASE_WATCH','RELEASE','RIPE','CONFIRMED'];
    const oi=order.indexOf(old.phase),ni=order.indexOf(phase);
    const down=oi>=0&&ni>=0&&ni<oi;
    // Hysteresis: regress only after meaningful deterioration, never a single tick.
    if(down && Math.abs(scoreDelta)<10 && evidenceQuality>=old.evidenceQuality*.75)phase=old.phase;
  }
  const ageTicks=old?old.ageTicks+Math.max(1,raw.length-old.lastTick):1;
  const birthAt=old?.birthAt??(raw[0]!==undefined&&old?.birthAt?old.birthAt:at);
  const hist=[...(old?.history??[]),{tick:raw.length,at,phase,score:confirmation,reservoir:reservoirScore,exhaustion,delivery,migration}].slice(-120);
  const scores=(key:keyof typeof hist[number])=>hist.map(h=>Number(h[key])).slice(-30);
  const scoreS=slope(scores('score')),rt=slope(scores('reservoir')),et=slope(scores('exhaustion')),dt=slope(scores('delivery')),mt=slope(scores('migration'));
  const priorTraj=old?.trajectory;
  const direction:TrajectoryDirection=conflict>=70?'CONFLICTED':scoreS>1.5?'STRENGTHENING':scoreS<-1.5?'WEAKENING':(priorTraj?.direction==='STRENGTHENING'&&scoreS<0)?'REVERSING':'STABLE';
  const trajectory={direction,scoreSlope:scoreS,reservoirTrend:rt,exhaustionTrend:et,deliveryTrend:dt,migrationTrend:mt,absorptionTrend:old?absorption-old.absorptionScore:0,evidenceMomentum:evidenceQuality-(old?.evidenceQuality??evidenceQuality),persistence:clamp(Math.min(ageTicks,100)/100*55+Math.min(hist.length,30)/30*45),acceleration:scoreS-(priorTraj?.scoreSlope??scoreS),consistency:clamp(100-(Math.abs(scoreS)*8)),lastMeaningfulChange:Math.abs(scoreDelta)>=5?at:(old?.trajectory.lastMeaningfulChange??at)};
  const qualified=p.valid&&matureEvidence&&exhaustion>=65&&delivery>=62&&migration>=55&&conflict<60&&vetoes.length===0;
  const qualificationReason=qualified?'All hard structural gates currently pass':vetoes[0]||(!matureEvidence?'Insufficient formation maturation/evidence persistence':exhaustion<65?'Dominant exhaustion not established':delivery<62?'Observed reservoir delivery not established':migration<55?'Migration support insufficient':'Conflict or structural gate active');
  const id=old?.id??`${market}:${side}${barrier}:G1`;
  return {id,generation:old?.generation??1,market,contract:`${side} ${barrier}`,side,barrier,birthAt,birthTick:old?.birthTick??raw.length,lastAt:at,lastTick:raw.length,ageTicks,phase,previousPhase:old?.phase??null,phaseEnteredAt:old?.phase===phase?(old.phaseEnteredAt??at):at,psychology:p,reservoirDigits:reservoir,dominantDigits:dominant,reservoirScore,exhaustionScore:exhaustion,deliveryScore:delivery,migrationScore:migration,absorptionScore:absorption,releaseScore:release,confirmationScore:confirmation,conflictScore:conflict,evidenceQuality,evidencePersistence:trajectory.persistence,structuralCoherence,trajectory,evidence:old?.evidence??[],vetoes,history:hist,rank:0,previousRank:old?.rank??null,rankChange:0,timeAtRank:old?.rank===old?.rank?(old?.timeAtRank??0):0,qualified,qualificationReason,active:phase!=='INVALIDATED'};
}

function rankScore(f:Formation){
  // Ranking is deliberately distinct from qualification. A blocked/immature formation
  // can still be rank #1 if it is the strongest observed formation at scan time.
  return clamp(f.confirmationScore*.32+f.evidenceQuality*.18+f.evidencePersistence*.12+f.structuralCoherence*.10+Math.min(100,f.ageTicks)*.08+clamp(50+f.trajectory.scoreSlope*8)*.10+(100-f.conflictScore)*.10);
}
function why(f:Formation,score:number){const a:string[]=[];a.push(`Ranking ${score.toFixed(1)} from formation strength + persistent evidence`);if(f.trajectory.direction!=='STABLE')a.push(`Trajectory ${f.trajectory.direction.toLowerCase()}`);if(f.ageTicks>=20)a.push(`Formation has persisted ${f.ageTicks} ticks`);if(f.exhaustionScore>=65)a.push(`Dominant exhaustion is ${f.exhaustionScore.toFixed(0)}`);if(f.deliveryScore>=62)a.push(`Reservoir delivery is ${f.deliveryScore.toFixed(0)}`);if(f.migrationScore>=55)a.push(`Migration evidence is ${f.migrationScore.toFixed(0)}`);if(f.psychology.purple!==null&&f.reservoirDigits.includes(f.psychology.purple))a.push(`Purple aligns with reservoir d${f.psychology.purple}`);if(f.vetoes.length)a.push(`Qualification remains blocked: ${f.vetoes[0]}`);return a}

export class LiquidityIntelligenceEngine {
  private registry=new Map<string,Formation>();
  private events:EvidenceEvent[]=[];
  private scans:ScanSnapshot[]=[];
  private version=0;
  private emit(f:Formation,type:string,message:string,dimension:EvidenceEvent['dimension'],strength:number,at:number,tick:number){const last=f.evidence[f.evidence.length-1];if(last&&last.type===type&&at-last.at<5000)return;const e={id:`${f.id}:${type}:${tick}`,at,tick,type,message,dimension,strength};f.evidence=[...f.evidence,e].slice(-100);this.events=[e,...this.events].slice(0,200)}
  update(marketTicks:Record<string,Tick[]>,at=now()):EngineSnapshot{
    for(const [market,ticks] of Object.entries(marketTicks)){
      const ds=ticks.map(t=>t.d).slice(-1000);if(ds.length<20)continue;
      for(const side of ['OVER','UNDER'] as Side[])for(const barrier of side==='OVER'?[1,2,3,4]:[8,7,6,5]){
        const key=`${market}:${side}${barrier}`;const old=this.registry.get(key);const f=deriveFormation(market,ds,ticks.length,side,barrier,old,at);
        if(!old){this.emit(f,'FORMATION_CREATED',`Formation created from persistent observable evidence`,'FORMATION',45,at,ticks.length)}
        if(f.reservoirScore>=60&&(old?.reservoirScore??0)<60)this.emit(f,'RESERVOIR_FORMED',`Sentinel-valid reservoir reached persistent evidence threshold`,'RESERVOIR',f.reservoirScore,at,ticks.length);
        if(f.exhaustionScore>=65&&(old?.exhaustionScore??0)<65)this.emit(f,'EXHAUSTION_STARTED',`Dominant structure is weakening persistently`,'EXHAUSTION',f.exhaustionScore,at,ticks.length);
        if(f.deliveryScore>=62&&(old?.deliveryScore??0)<62)this.emit(f,'DELIVERY_STARTED',`Observable activity is entering the reservoir`,'DELIVERY',f.deliveryScore,at,ticks.length);
        if(f.migrationScore>=55&&(old?.migrationScore??0)<55)this.emit(f,'MIGRATION_DETECTED',`Dominant-to-reservoir transition has increased`,'MIGRATION',f.migrationScore,at,ticks.length);
        if(f.absorptionScore>=70&&(old?.absorptionScore??0)<70)this.emit(f,'ABSORPTION_STARTED',`Receiving structure is persisting after delivery`,'ABSORPTION',f.absorptionScore,at,ticks.length);
        if(f.releaseScore>=76&&(old?.releaseScore??0)<76)this.emit(f,'RELEASE_WATCH',`Exhaustion, delivery and migration align for release watch`,'RELEASE',f.releaseScore,at,ticks.length);
        if(f.phase!==old?.phase)this.emit(f,'LIFECYCLE_CHANGED',`${old?.phase??'NEW'} → ${f.phase}`,'LIFECYCLE',Math.abs(f.confirmationScore-(old?.confirmationScore??f.confirmationScore)),at,ticks.length);
        if(f.trajectory.direction==='WEAKENING'&&old?.trajectory.direction!=='WEAKENING')this.emit(f,'FORMATION_WEAKENED','Formation trajectory turned persistently weaker','FORMATION',70,at,ticks.length);
        this.registry.set(key,f);
      }
    }
    this.version++;
    return this.snapshot();
  }
  scan(at=now()):EngineSnapshot{
    const all=[...this.registry.values()].filter(f=>f.active&&f.psychology.outcome!=='BOOTSTRAP').map(f=>({...f,rankScore:rankScore(f),whyRanked:why(f,rankScore(f))}));
    all.sort((a,b)=>b.rankScore-a.rankScore||b.ageTicks-a.ageTicks);
    all.forEach((f,i)=>{const old=this.registry.get(f.id);f.previousRank=old?.rank??null;f.rank=i+1;f.rankChange=(old?.rank??(i+1))-f.rank;f.timeAtRank=old?.rank===f.rank?(old?.timeAtRank??0)+1:0;this.registry.set(f.id,f)});
    const candidates=all.slice(0,30) as RankedFormation[];
    const rank1=candidates[0]??null;
    const bestQualified=candidates.find(f=>f.qualified)??null;
    const previous=this.scans[0]?.rank1;
    const override=!!rank1&&!!previous&&rank1.id!==previous.id&&rank1.rankScore>previous.rankScore+8;
    const overrideReason=override?'Materially superior ranking quality with persistent evidence':'Deliberate scan snapshot';
    const scan={id:`scan-${at}`,scannedAt:at,rank1,bestQualified,candidates,override,overrideReason};
    this.scans=[scan,...this.scans].slice(0,30);this.version++;return this.snapshot();
  }
  snapshot():EngineSnapshot{
    const formations=[...this.registry.values()].map(f=>({...f,rankScore:rankScore(f),whyRanked:why(f,rankScore(f))})).sort((a,b)=>b.rankScore-a.rankScore) as RankedFormation[];
    return {formations,scanned:this.scans[0]??null,scanHistory:[...this.scans],eventFeed:[...this.events],updatedAt:now(),version:this.version};
  }
}
