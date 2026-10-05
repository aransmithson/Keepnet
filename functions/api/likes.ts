import { Env,jsonResponse,corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { requireAuth,getAuthenticatedUser } from './_auth';
import { ApiError,apiError,visibleCatch } from './_journal';

export const onRequestOptions: PagesFunction<Env> = async()=>new Response(null,{headers:corsHeaders});
export const onRequestGet: PagesFunction<Env> = async context=>{
  try{
    const db=context.env.DB,catchId=sanitizeInput(new URL(context.request.url).searchParams.get('catchId'),64);
    const user=await getAuthenticatedUser(context);
    if(catchId){
      await visibleCatch(db,catchId,user);
      const count=await db.prepare('SELECT COUNT(*) AS count FROM catch_likes WHERE catch_id = ?').bind(catchId).first<any>();
      const liked=user?!!await db.prepare('SELECT id FROM catch_likes WHERE catch_id = ? AND user_id = ?').bind(catchId,user.id).first():false;
      return jsonResponse({success:true,catchId,likesCount:Number(count?.count)||0,liked});
    }
    const {results}=await db.prepare(`SELECT l.catch_id,COUNT(*) AS count FROM catch_likes l
      JOIN catches c ON c.id=l.catch_id WHERE c.is_shared=1 AND c.is_confidential=0 GROUP BY l.catch_id`).all();
    const likes:Record<string,number>={};for(const row of results||[])likes[(row as any).catch_id]=Number((row as any).count)||0;
    const likedRows=user?await db.prepare(`SELECT DISTINCT l.catch_id FROM catch_likes l JOIN catches c ON c.id=l.catch_id
      WHERE l.user_id = ? AND (c.user_id = ? OR (c.is_shared=1 AND c.is_confidential=0))`).bind(user.id,user.id).all():{results:[]};
    return jsonResponse({success:true,likes,likedCatchIds:(likedRows.results||[]).map((row:any)=>row.catch_id)});
  }catch(err){return apiError(err,'Failed to fetch likes');}
};
export const onRequestPost: PagesFunction<Env> = async context=>{
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const db=context.env.DB,body=await context.request.json() as any;
    const catchId=sanitizeInput(body.catchId,64);if(!catchId)throw new ApiError('Catch ID is required');
    if(body.action!=='like' && body.action!=='unlike')throw new ApiError('Invalid like action');
    await visibleCatch(db,catchId,auth.user);
    if(body.action==='unlike')await db.prepare('DELETE FROM catch_likes WHERE catch_id = ? AND user_id = ?').bind(catchId,auth.user.id).run();
    else await db.prepare(`INSERT OR IGNORE INTO catch_likes(id,catch_id,user_id,created_at)
      SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM catch_likes WHERE catch_id=? AND user_id=?)`)
      .bind(`${catchId}_${auth.user.id}`,catchId,auth.user.id,new Date().toISOString(),catchId,auth.user.id).run();
    const count=await db.prepare('SELECT COUNT(*) AS count FROM catch_likes WHERE catch_id = ?').bind(catchId).first<any>();
    return jsonResponse({success:true,catchId,likesCount:Number(count?.count)||0,liked:body.action==='like'});
  }catch(err){return apiError(err,'Failed to update like');}
};
