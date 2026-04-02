export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const res = await fetch('https://api.bling.com.br/Api/v3/contatos?limite=100', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
