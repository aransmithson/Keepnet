import { Env,jsonResponse,errorResponse,corsHeaders } from './_types';
import { requireAuth } from './_auth';
import { ApiError,apiError,prepareSession,prepareCatch,sessionRow,catchRow,checkRecordOwner,checkCatchParent } from './_journal';

export const onRequestOptions: PagesFunction<Env> = async()=>new Response(null,{headers:corsHeaders});
export const onRequestPost: PagesFunction<Env> = async context=>{
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const db=context.env.DB,body=await context.request.json() as any;
    if(body.user?.id && body.user.id!==auth.user.id)return errorResponse('Cannot synchronize another account journal',403);
    const sessions=Array.isArray(body.sessions)?body.sessions:[],catches=Array.isArray(body.catches)?body.catches:[];
    if(sessions.length>50 || catches.length>100)throw new ApiError('Send up to 50 sessions and 100 catches per sync batch',413);
    const downloadOnly=body.mode==='download' || body.replace===true;
    const savedSessionIds:string[]=[],savedCatchIds:string[]=[],deletedCatchIds:string[]=[];
    if(!downloadOnly){
      const preparedSessions=sessions.map((s:any)=>prepareSession(db,s,auth.user));
      const preparedCatches=catches.map((c:any)=>prepareCatch(db,c,auth.user));
      // Validate every ownership relationship before executing any write.
      for(const record of preparedSessions)await checkRecordOwner(db,'sessions',record.id,auth.user.id);
      const incomingParents=new Set(preparedSessions.map(record=>record.id));
      const liveCatches=[] as typeof preparedCatches;
      for(const record of preparedCatches){
        await checkRecordOwner(db,'catches',record.id,auth.user.id);
        const deletion=await db.prepare('SELECT user_id FROM catch_deletions WHERE catch_id = ?').bind(record.id).first<any>();
        if(deletion){if(deletion.user_id!==auth.user.id)throw new ApiError('Cannot change another account journal',403);deletedCatchIds.push(record.id);continue;}
        if(!incomingParents.has(record.sessionId))await checkCatchParent(db,record.sessionId,auth.user.id);
        liveCatches.push(record);
      }
      const writes=[...preparedSessions.map(record=>record.statement),...liveCatches.map(record=>record.statement)];
      if(writes.length)await db.batch(writes);
      savedSessionIds.push(...preparedSessions.map(record=>record.id));savedCatchIds.push(...liveCatches.map(record=>record.id));
    }
    // Membership is authoritative server state; journal sync cannot grant or change it.
    const sRes=await db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC').bind(auth.user.id).all();
    const cRes=await db.prepare('SELECT * FROM catches WHERE user_id = ? ORDER BY caught_at DESC').bind(auth.user.id).all();
    const sub=await db.prepare('SELECT tier,applied_coupon,expires_at FROM user_subscriptions WHERE user_id = ?').bind(auth.user.id).first<any>();
    const deletions=await db.prepare('SELECT catch_id FROM catch_deletions WHERE user_id = ?').bind(auth.user.id).all();
    const owner=auth.user.is_admin===1;
    const active=sub?.tier==='premium' && (!sub.expires_at || Date.parse(sub.expires_at)>Date.now());
    return jsonResponse({success:true,savedSessionIds,savedCatchIds,deletedCatchIds:[...new Set([...deletedCatchIds,...(deletions.results||[]).map((row:any)=>row.catch_id)])],
      remoteSessions:(sRes.results||[]).map(sessionRow),remoteCatches:(cRes.results||[]).map(catchRow),
      remoteSubscription:{tier:owner || active?'premium':'lite',appliedCoupon:owner?'OWNER_VIP':sub?.applied_coupon || null,expiresAt:owner?null:sub?.expires_at || null}});
  }catch(err){return apiError(err,'Sync failed');}
};
