import { createHash } from 'crypto';
import { canonicalize } from '../../integration/channel/canonical';
import { CATALOG,compareStrictness } from './catalog';
export const policyDigest=(value)=>`sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
export const STALE_GRACE_MS=86400000;
export const classifyAuthorityCache=({row,now,staleGraceMs=STALE_GRACE_MS})=>{
  if(!row)return 'ABSENT';if(row.status!=='VERIFIED'||!row.body?.values||!Number.isFinite(row.body.exp))return 'INVALID';
  if(now<row.body.exp)return 'FRESH';return now<row.body.exp+staleGraceMs?'STALE':'EXPIRED';
};
/**
 * @param issueLinked 연동 모드 ∧ 연동 이슈(통제용 연동 판정) — 이슈 예외(JIRA_ISSUE 층) 중 **사전 승인(approvalMode)만** 적용하지 않는다
 *   (linked-mode-ux Q140 a 를 s/e/pa/fl 로 좁힘, 2026-10-13). 사전 승인은 워크포스 팀장의 pa 가 정한다.
 *   기록 규칙(작성·수정·삭제 기간, 하루·주 상한 등)은 연동 이슈라도 승인 앱 이슈 예외가 그대로 적용된다(워크포스는 다루지 않는다, Q149).
 *   생략 사실은 keys.approvalMode.ignored 에 남긴다(지원용 정보).
 */
export const mergePolicy=({site={},workforceProject=null,workforceIssue=null,jiraProject={},jiraIssue={},linkedIssue=null,issueLinked=false,now})=>{
  const keys={};const warnings=[];const authorityState={};
  Object.entries(CATALOG).forEach(([key,c])=>{keys[key]={key,value:site.values?.[key]??site[key]??c.default,source:'SITE_DEFAULT',sourceRevision:site.revision??policyDigest(site.values??site),inherited:true,lock:{locked:false},ignored:[]};});
  for(const [source,layer] of [['WORKFORCE_PROJECT',workforceProject],['WORKFORCE_ISSUE',workforceIssue],['JIRA_PROJECT',jiraProject],['JIRA_ISSUE',jiraIssue]]){
    if(!layer)continue;const workforce=source.startsWith('WORKFORCE');
    let effectiveLayer=layer;
    if(source==='JIRA_ISSUE'&&issueLinked){const raw=layer.values??layer;
      if(Object.hasOwn(raw,'approvalMode')){const revision=layer.revision??`${source}:${layer.rev??0}`;
        keys.approvalMode.ignored.push({source,revision,reason:'MANAGED_BY_WORKFORCE'});
        const {approvalMode,...rest}=raw;effectiveLayer=layer.values?{...layer,values:rest}:rest;}}
    const state=workforce?classifyAuthorityCache({row:layer,now}):null;
    if(workforce){authorityState[source]=state;if(!['FRESH','ABSENT'].includes(state))warnings.push({code:state,source});if(['ABSENT','INVALID'].includes(state))continue;}
    const values=workforce?layer.body.values:effectiveLayer.values??effectiveLayer;const revision=layer.revision??`${source}:${layer.srcRev??layer.rev??0}`;
    Object.entries(values).forEach(([key,value])=>{
      const current=keys[key];if(!current||CATALOG[key].siteOnly)return;
      const locked=workforce&&layer.body.locks?.[key]===true;
      if(state==='EXPIRED'&&!locked)return;
      if(current.lock.locked){const comparison=!workforce&&!CATALOG[key].strict?null:compareStrictness(key,value,current.lock.value??current.value);
        if(comparison===null||comparison<0){current.ignored.push({source,revision,reason:comparison===null?'LOCKED':'RELAXES_LOCK'});return;}}
      current.value=value;current.source=source;current.sourceRevision=revision;current.inherited=workforce;
      if(locked)current.lock={locked:true,value,authority:source,sourceRevision:revision,allowTighten:Boolean(CATALOG[key].strict),unavailable:state==='EXPIRED'};
    });
  }
  if(linkedIssue?.active && ['REQUIRED','NOT_REQUIRED'].includes(linkedIssue.body?.pa)){
    keys.approvalMode={...keys.approvalMode,value:linkedIssue.body.pa==='REQUIRED'?'PREAPPROVAL':'CERTIFICATION',source:'LINKED_ISSUE',sourceRevision:`li:${linkedIssue.body.issueId}:${linkedIssue.rev}`,inherited:false,lock:{locked:false}};
  }
  if(linkedIssue?.active&&linkedIssue.body?.wa){keys.periodAutoCloseDays={...keys.periodAutoCloseDays,value:linkedIssue.body.wa.closeDays,source:'LINKED_ISSUE',sourceRevision:`li:${linkedIssue.rev}`};}
  const values=Object.fromEntries(Object.entries(keys).map(([key,entry])=>[key,entry.value]));
  const legacyViolationAction=site.raw?.timesheetViolationAction==='EXTRA_STEP'&&keys.violationAction.source==='SITE_DEFAULT'?'EXTRA_STEP':null;
  return {values,keys,authorityState,warnings,legacyViolationAction,revision:`ep:${policyDigest({values,keys,authorityState})}`};
};
export const aggregateTimesheetPolicy=({entries,resolvedByIssue})=>{
  const limits={dailyMaxSeconds:0,weeklyMaxSeconds:0};const sources={};const conflicts=[];let violationAction='WARN';
  for(const entry of entries){const effective=resolvedByIssue.get(String(entry.issueId));if(!effective){conflicts.push({issueId:entry.issueId,code:'MISSING_POLICY'});continue;}
    if(effective.values.violationAction==='BLOCK')violationAction='BLOCK';
    for(const key of Object.keys(limits)){if(compareStrictness(key,effective.values[key],limits[key])>0){limits[key]=effective.values[key];sources[key]={issueId:entry.issueId,...effective.keys[key]};}}
  }return {limits,sources,conflicts,violationAction};
};
