import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization' }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const { searchParams } = new URL(request.url);
  const pagina = parseInt(searchParams.get('pagina') || '1', 10);
  const limite = parseInt(searchParams.get('limite') || '100', 10);

  try {
    const blingRes = await fetch(
      `https://api.bling.com.br/Api/v3/produtos?pagina=${pagina}&limite=${limite}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    if (!blingRes.ok) {
      const errText = await blingRes.text();
      return NextResponse.json({ ok: false, error: errText }, { status: blingRes.status });
    }

    const json = await blingRes.json();
    const products: any[] = json.data || [];

    if (products.length > 0) {
      const batch = adminDb.batch();
      for (const p of products) {
        const ref = adminDb.collection('catalogo_produtos').doc(String(p.id));
        batch.set(ref, {
          blingId: p.id,
          nome: p.nome || '',
          codigo: p.codigo || '',
          preco: typeof p.preco === 'number' ? p.preco : parseFloat(p.preco) || 0,
          tipo: p.tipo || 'P',
          situacao: p.situacao || 'A',
          unidade: p.unidade || '',
          categoria: p.categoria?.descricao || '',
          pesoLiquido: typeof p.pesoLiquido === 'number' ? p.pesoLiquido : parseFloat(p.pesoLiquido) || 0,
          syncedAt: new Date().toISOString(),
        }, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      count: products.length,
      hasMore: products.length === limite,
      pagina,
    });
  } catch (err: any) {
    console.error('[catalog/sync] error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
