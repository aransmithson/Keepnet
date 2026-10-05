import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { requireAuth, getAuthenticatedUser, verifyOwnership } from './_auth';
import { ApiError, apiError, catchRow, prepareCatch, checkRecordOwner, checkCatchParent, visibleCatch } from './_journal';

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { headers:corsHeaders });

export const onRequestGet: PagesFunction<Env> = async context => {
  try {
    const db=context.env.DB,url=new URL(context.request.url);
    const userId=sanitizeInput(url.searchParams.get('userId'),64),sessionId=sanitizeInput(url.searchParams.get('sessionId'),64),recordId=sanitizeInput(url.searchParams.get('id'),64);
    const user=await getAuthenticatedUser(context);
    if(recordId) return jsonResponse({success:true,catches:[catchRow(await visibleCatch(db,recordId,user))]});
    let query='SELECT * FROM catches'; const params:string[]=[];
    if(userId){
      if(!user || !verifyOwnership(user,userId)) return errorResponse('Authentication and ownership required',user?403:401);
      query+=' WHERE user_id = ?';params.push(userId);
    }else if(sessionId){
      const session=await db.prepare('SELECT user_id,is_shared,is_confidential FROM sessions WHERE id = ?').bind(sessionId).first<any>();
      if(!session) return jsonResponse({success:true,catches:[]});
      const owner=!!user && verifyOwnership(user,session.user_id);
      if(!owner && (session.is_shared!==1 || session.is_confidential===1)) return errorResponse('Session not found or private',404);
      query+=' WHERE session_id = ?';params.push(sessionId);
      if(!owner) query+=' AND is_shared = 1 AND is_confidential = 0';
    }else{query+=' WHERE is_shared = 1 AND is_confidential = 0';}
    query+=' ORDER BY caught_at DESC';if(!userId && !sessionId)query+=' LIMIT 200';
    const {results}=await db.prepare(query).bind(...params).all();
    return jsonResponse({success:true,catches:(results || []).map(catchRow)});
  }catch(err){return apiError(err,'Failed to fetch catches');}
};

export const onRequestPost: PagesFunction<Env> = async context => {
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const db=context.env.DB,body=await context.request.json();const entries=Array.isArray(body)?body:[body];
    if(entries.length>50)throw new ApiError('Send up to 50 catches per batch',413);
    const prepared=entries.map(c=>prepareCatch(db,c,auth.user));
    const deletedCatchIds:string[]=[];const saved= [] as typeof prepared;
    for(const record of prepared){
      await checkRecordOwner(db,'catches',record.id,auth.user.id);
      const deletion=await db.prepare('SELECT user_id FROM catch_deletions WHERE catch_id = ?').bind(record.id).first<any>();
      if(deletion){if(deletion.user_id!==auth.user.id)throw new ApiError('Cannot change another account journal',403);deletedCatchIds.push(record.id);continue;}
      await checkCatchParent(db,record.sessionId,auth.user.id);saved.push(record);
    }
    if(saved.length)await db.batch(saved.map(record=>record.statement));
    return jsonResponse({success:true,count:saved.length,savedCatchIds:saved.map(record=>record.id),deletedCatchIds});
  }catch(err){return apiError(err,'Failed to save catches');}
};

export const onRequestDelete: PagesFunction<Env> = async context => {
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const db=context.env.DB,catchId=sanitizeInput(new URL(context.request.url).searchParams.get('id'),64);
    if(!catchId)throw new ApiError('Catch ID is required');
    const existing=await db.prepare('SELECT user_id FROM catches WHERE id = ?').bind(catchId).first<any>();
    const tombstone=await db.prepare('SELECT user_id FROM catch_deletions WHERE catch_id = ?').bind(catchId).first<any>();
    if((existing && !verifyOwnership(auth.user,existing.user_id)) || (tombstone && !verifyOwnership(auth.user,tombstone.user_id)))throw new ApiError('Cannot delete another account catch',403);
    // Also tombstone never-uploaded local catches so a delayed upload cannot resurrect them.
    const ownerId=existing?.user_id || tombstone?.user_id || auth.user.id;
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO catch_deletions (catch_id,user_id,deleted_at)
        SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM catches WHERE id=? AND user_id!=?)`)
        .bind(catchId,ownerId,new Date().toISOString(),catchId,ownerId),
      db.prepare('DELETE FROM catch_comments WHERE catch_id = ? AND EXISTS(SELECT 1 FROM catch_deletions WHERE catch_id=? AND user_id=?)').bind(catchId,catchId,ownerId),
      db.prepare('DELETE FROM catch_likes WHERE catch_id = ? AND EXISTS(SELECT 1 FROM catch_deletions WHERE catch_id=? AND user_id=?)').bind(catchId,catchId,ownerId),
      db.prepare('DELETE FROM catches WHERE id = ? AND user_id = ?').bind(catchId,ownerId),
    ]);
    const deleted=await db.prepare('SELECT user_id FROM catch_deletions WHERE catch_id = ?').bind(catchId).first<any>();
    if(deleted?.user_id!==ownerId)throw new ApiError('Cannot delete another account catch',403);
    return jsonResponse({success:true,deletedCatchIds:[catchId]});
  }catch(err){return apiError(err,'Failed to delete catch');}
};
