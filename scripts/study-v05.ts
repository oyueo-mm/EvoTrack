import {mkdirSync,writeFileSync} from 'node:fs';
import {V05_MAPS} from '../src/core/v05-maps';
import {DEFAULT_CONFIG,type PolicyData,type TrackMap} from '../src/core/types';
import {Simulator} from '../src/core/environment';
import {actionOf} from '../src/learning/network';
import {PPOTrainer,initTensorflow,tensorMemory} from '../src/learning/ppo';
import {curriculumStages,curriculumPass} from '../src/learning/curriculum';
await initTensorflow();
const mask=(env:Simulator)=>{const observe=env.observe.bind(env);env.observe=()=>{const o=observe();o.fill(0,12);return o;};};
function evaluate(policy:PolicyData,map:TrackMap,ablate=false){
 const results=[101,202,303].map(seed=>{const e=new Simulator(map,900);if(ablate)mask(e);e.reset(seed);while(!e.done)e.step(actionOf(policy,e.observe()));return e.getMetrics();});
 return {successRate:results.filter(r=>r.success).length/3,progress:results.reduce((a,r)=>a+r.progress,0)/3,reward:results.reduce((a,r)=>a+r.reward,0)/3,results};
}
const runs=[];
for(const id of ['b-v5-elevator','b-v5-crumble','b-v5-mixed'])for(const variant of ['full-observation','masked-motion','curriculum'])for(const seed of [17,42,89]){
 const target=V05_MAPS.find(m=>m.id===id)!,stages=variant==='curriculum'?curriculumStages(target):[target],config={...DEFAULT_CONFIG,seed,horizon:900,rollout:256,epochs:4,minibatch:64};
 const trainer=new PPOTrainer(stages[0],config);if(variant==='masked-motion')mask(trainer.environment);
 let stage=0,passes=0,firstSuccess:number|null=null,best:any=null;const history=[];const start=performance.now();
 for(let i=0;i<128;i++){
  const r=trainer.run();if((i+1)%5===0||i===127){
   const e=evaluate(trainer.getPolicy(),target,variant==='masked-motion');
   if(!best||e.successRate>best.successRate||e.successRate===best.successRate&&e.progress>best.progress)best=e;
   if(e.successRate>0&&firstSuccess===null)firstSuccess=trainer.totalSamples;
   history.push({update:trainer.updates,samples:trainer.totalSamples,evaluation:e,diagnostics:r.diagnostics});
   if(variant==='curriculum'){
    const current=evaluate(trainer.getPolicy(),stages[stage]);passes=curriculumPass(current)?passes+1:0;
    if(passes>=2&&stage<stages.length-1){stage++;passes=0;trainer.changeEnvironment(stages[stage]);}
   }
  }
 }
 const record={id,variant,seed,config,samples:trainer.totalSamples,elapsedMs:performance.now()-start,firstSuccess,best,final:evaluate(trainer.getPolicy(),target,variant==='masked-motion'),stage:stages[stage].id,history};runs.push(record);trainer.dispose();console.log(JSON.stringify({id,variant,seed,best:best.successRate,progress:best.progress,stage:record.stage}));
}
const map=V05_MAPS[6],long=new PPOTrainer(map,{...DEFAULT_CONFIG,horizon:900,rollout:256,epochs:2});const memory=[];
for(let i=0;i<512;i++){long.run();if(i%32===0)memory.push({update:long.updates,samples:long.totalSamples,...tensorMemory()});}
long.dispose();mkdirSync('docs/results',{recursive:true});writeFileSync('docs/results/v05-new-environments.json',JSON.stringify({note:'Preliminary 3-seed v5-only study, 32768 transitions each. Masked-motion zeros six motion/platform observations during both training and evaluation. Separate from legacy comparisons. Curriculum uses sequential single environments.',runs,longRun:{samples:512*256,memory,afterDispose:tensorMemory()}},null,2));
