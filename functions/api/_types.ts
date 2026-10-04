export interface Env {
  DB: D1Database;
  PHOTOS?: R2Bucket;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  POSTMARK_SERVER_TOKEN?: string;
  SENDGRID_API_KEY?: string;
  BREVO_API_KEY?: string;
}

export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: corsHeaders,
  });
}
