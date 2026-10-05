import { Env,jsonResponse,errorResponse,corsHeaders } from '../_types';
import { sanitizeInput } from '../_crypto';
import { requireAuth } from '../_auth';
import { apiError } from '../_journal';

export const onRequestOptions: PagesFunction<Env> = async()=>new Response(null,{headers:corsHeaders});
const COUPONS=new Set(['KEEPNET1M','TRIAL1MONTH','ANGLER30','FISHFREE','PRO1MONTH','KEEPNETPRO','CARP1MONTH','FREETRIAL30','SPECIMEN30']);
const owner=(user:any)=>user.is_admin===1;
const active=(sub:any)=>sub?.tier==='premium' && (!sub.expires_at || Date.parse(sub.expires_at)>Date.now());

export const onRequestGet: PagesFunction<Env> = async context=>{
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const sub=await context.env.DB.prepare('SELECT tier,applied_coupon,expires_at FROM user_subscriptions WHERE user_id = ?').bind(auth.user.id).first<any>();
    const premium=owner(auth.user)||active(sub);
    return jsonResponse({success:true,tier:premium?'premium':'lite',appliedCoupon:owner(auth.user)?'OWNER_VIP':sub?.applied_coupon||null,expiresAt:owner(auth.user)?null:sub?.expires_at||null,isPremium:premium});
  }catch(err){return apiError(err,'Failed to fetch membership');}
};
export const onRequestPost: PagesFunction<Env> = async context=>{
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const db=context.env.DB,body=await context.request.json() as any;
    if(body.userId && body.userId!==auth.user.id)return errorResponse('Cannot change another account membership',403);
    const code=sanitizeInput(body.code,40).toUpperCase();if(!COUPONS.has(code))return errorResponse('Invalid trial coupon code',400);
    const sub=await db.prepare('SELECT tier,applied_coupon,expires_at FROM user_subscriptions WHERE user_id = ?').bind(auth.user.id).first<any>();
    if(owner(auth.user)||active(sub))return errorResponse('Your Premium membership is already active',409);
    const now=new Date().toISOString(),claimId=crypto.randomUUID(),expiresAt=new Date(Date.now()+30*86400000).toISOString();
    // Batch transactions serialize the claim, so concurrent redemptions cannot renew it.
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO trial_claims(user_id,redeemed_at,claim_id)
        SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM user_subscriptions WHERE user_id=? AND tier='premium'
          AND (expires_at IS NULL OR julianday(expires_at)>julianday(?)))`).bind(auth.user.id,now,claimId,auth.user.id,now),
      db.prepare(`INSERT INTO user_subscriptions(id,user_id,tier,applied_coupon,expires_at,updated_at)
        SELECT ?,?,'premium',?,?,? FROM trial_claims WHERE user_id=? AND claim_id=?
        ON CONFLICT(user_id) DO UPDATE SET tier=excluded.tier,applied_coupon=excluded.applied_coupon,expires_at=excluded.expires_at,updated_at=excluded.updated_at
        WHERE user_subscriptions.tier!='premium' OR (user_subscriptions.expires_at IS NOT NULL AND julianday(user_subscriptions.expires_at)<=julianday(?))`)
        .bind(crypto.randomUUID(),auth.user.id,code,expiresAt,now,auth.user.id,claimId,now),
      db.prepare(`INSERT INTO coupon_redemptions(id,user_id,coupon_code,redeemed_at)
        SELECT ?,?,?,? FROM trial_claims WHERE user_id=? AND claim_id=?`).bind(crypto.randomUUID(),auth.user.id,code,now,auth.user.id,claimId),
    ]);
    const claim=await db.prepare('SELECT claim_id FROM trial_claims WHERE user_id = ?').bind(auth.user.id).first<any>();
    if(claim?.claim_id!==claimId)return errorResponse('This account has already used its free trial',409);
    return jsonResponse({success:true,tier:'premium',appliedCoupon:code,expiresAt,message:`Your 30-day Premium trial is active until ${new Date(expiresAt).toLocaleDateString('en-GB')}.`});
  }catch(err){return apiError(err,'Failed to redeem trial');}
};
export const onRequestDelete: PagesFunction<Env> = async context=>{
  try{
    const auth=await requireAuth(context);if(!auth.success)return auth.response;
    const db=context.env.DB,sub=await db.prepare('SELECT tier,applied_coupon,expires_at FROM user_subscriptions WHERE user_id = ?').bind(auth.user.id).first<any>();
    const claim=await db.prepare('SELECT redeemed_at FROM trial_claims WHERE user_id = ?').bind(auth.user.id).first<any>();
    if(owner(auth.user) || (active(sub) && (!sub.expires_at || !claim || !COUPONS.has(sub.applied_coupon))))return errorResponse('Paid membership must be managed through the membership provider',409);
    await db.prepare("UPDATE user_subscriptions SET tier='lite',applied_coupon=NULL,expires_at=NULL,updated_at=? WHERE user_id=?").bind(new Date().toISOString(),auth.user.id).run();
    return jsonResponse({success:true,tier:'lite',appliedCoupon:null,expiresAt:null,message:'Your trial has ended. Your journal is unchanged.'});
  }catch(err){return apiError(err,'Failed to cancel trial');}
};
