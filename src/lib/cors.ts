export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
}
