import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const src=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};cache.set(file,mod);
 new Function('module','exports','require',js)(mod,mod.exports,n=>{
  if(n==='./ledger')return load('src/growth/gauPoints/ledger.ts');
  if(n==='./roundContribution')return load('src/growth/gauPoints/roundContribution.ts');
  throw Error(n);
 });return mod.exports;
}
const {createEmptyGauPointLedger,appendGauPointLedgerEntry,getGauPointBalance}=load('src/growth/gauPoints/ledger.ts');
const {applyGauPointRoundTransfer}=load('src/growth/gauPoints/roundTransfer.ts');
const req={campaignId:'C',supporterId:'A',round:2,contributionPercentage:50,upstreamAncestors:['B',null]};
const funded=()=>appendGauPointLedgerEntry(createEmptyGauPointLedger(),{idempotencyKey:'sign',supporterId:'A',kind:'verified_signing',points:1000,referenceId:'sign'}).state;
test('rejects changed recipient after completion',()=>{const s=applyGauPointRoundTransfer(funded(),req).state;assert.throws(()=>applyGauPointRoundTransfer(s,{...req,upstreamAncestors:['C',null]}));});
test('rejects changed percentage after completion',()=>{const s=applyGauPointRoundTransfer(funded(),req).state;assert.throws(()=>applyGauPointRoundTransfer(s,{...req,contributionPercentage:40}));});
test('rejects changed zero-point completion request',()=>{const r={...req,round:1,upstreamAncestors:[null]};const s=applyGauPointRoundTransfer(createEmptyGauPointLedger(),r).state;assert.throws(()=>applyGauPointRoundTransfer(s,{...r,upstreamAncestors:['B']}));});
test('rejects missing share on replay',()=>{const s=applyGauPointRoundTransfer(funded(),req).state;const corrupt={entries:s.entries.filter(e=>!e.idempotencyKey.endsWith(':share:1'))};assert.throws(()=>applyGauPointRoundTransfer(corrupt,req));});
test('pending custody does not increase spendable wallet',()=>{const s=applyGauPointRoundTransfer(funded(),req).state;assert.equal(getGauPointBalance(s,'A'),500);assert.equal(getGauPointBalance(s,'B'),250);});
