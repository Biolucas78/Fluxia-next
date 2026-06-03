import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Merge inteligente: campos do Fluxia tem prioridade, nunca apaga dados existentes
function mergeCustomer(existing: any, incoming: any): { data: any; changed: boolean } {
  const merged = { ...existing };
  let changed = false;

  const fieldsFluxiaPriority = ['celular', 'email', 'fantasia', 'nome', 'endereco', 'mostrarNoMapa'];
  const fieldsNeverOverwrite = ['numeroDocumento', 'ie', 'tipo'];
  const fieldsNewOnly = ['cnpj', 'cpf'];

  // Campos que Fluxia tem prioridade (sobrescreve se incoming tiver valor)
  for (const f of fieldsFluxiaPriority) {
    if (incoming[f] !== undefined && incoming[f] !== null && incoming[f] !== '') {
      if (JSON.stringify(merged[f]) !== JSON.stringify(incoming[f])) {
        merged[f] = incoming[f];
        changed = true;
      }
    }
  }

  // Campos que nunca sobrescrevem se ja preenchidos
  for (const f of fieldsNeverOverwrite) {
    if (!merged[f] && incoming[f]) {
      merged[f] = incoming[f];
      changed = true;
    }
  }

  // Campos que só preenchem se vazio
  for (const f of fieldsNewOnly) {
    if (!merged[f] && incoming[f]) {
      merged[f] = incoming[f];
      changed = true;
    }
  }

  // Campos extras nao mapeados
  for (const [k, v] of Object.entries(incoming)) {
    if (!(k in merged) && v !== undefined && v !== null && v !== '') {
      merged[k] = v;
      changed = true;
    }
  }

  return { data: merged, changed };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientData, orderId, propagate = true } = body;

    if (!clientData || !clientData.nome) {
      return NextResponse.json({ ok: false, error: 'nome obrigatorio' }, { status: 400 });
    }

    const docClean = (clientData.numeroDocumento || clientData.cnpj || clientData.cpf || '').replace(/\D/g, '');
    const nome = (clientData.nome || '').trim();

    // ── Buscar cliente existente ──────────────────────────────────────────────
    let existingRef: any = null;
    let existingData: any = null;
    let clientId: string | null = null;

    // 1. Por documento (CNPJ/CPF)
    if (docClean) {
      const snap = await adminDb.collection('bling_customers')
        .where('numeroDocumento', '==', docClean)
        .limit(1).get();
      if (!snap.empty) {
        existingRef = snap.docs[0].ref;
        existingData = snap.docs[0].data();
        clientId = snap.docs[0].id;
      }
    }

    // 2. Por nome exato (fallback)
    if (!existingRef && nome) {
      const snap = await adminDb.collection('bling_customers')
        .where('nome', '==', nome)
        .limit(1).get();
      if (!snap.empty) {
        existingRef = snap.docs[0].ref;
        existingData = snap.docs[0].data();
        clientId = snap.docs[0].id;
      }
    }

    const incoming = {
      nome,
      fantasia: clientData.fantasia || clientData.tradeName || '',
      celular: clientData.celular || clientData.phone || '',
      email: clientData.email || '',
      numeroDocumento: docClean || '',
      tipo: docClean.length === 14 ? 'J' : docClean.length === 11 ? 'F' : (clientData.tipo || 'F'),
      ie: clientData.ie || '',
      endereco: clientData.endereco || clientData.addressDetails ? {
        geral: {
          cep: clientData.endereco?.geral?.cep || clientData.addressDetails?.zip || '',
          uf: clientData.endereco?.geral?.uf || clientData.addressDetails?.state || '',
          municipio: clientData.endereco?.geral?.municipio || clientData.addressDetails?.city || '',
          bairro: clientData.endereco?.geral?.bairro || clientData.addressDetails?.district || '',
          endereco: clientData.endereco?.geral?.endereco || (clientData.addressDetails?.street ? `${clientData.addressDetails.street}, ${clientData.addressDetails.number || ''}` : ''),
          numero: clientData.endereco?.geral?.numero || clientData.addressDetails?.number || '',
          complemento: clientData.endereco?.geral?.complemento || clientData.addressDetails?.complement || '',
        }
      } : undefined,
      fluxiaUpdatedAt: new Date().toISOString(),
    };
    // Remover campos undefined
    Object.keys(incoming).forEach(k => (incoming as any)[k] === undefined && delete (incoming as any)[k]);

    let savedClientId: string;

    if (existingRef && existingData) {
      // Merge com existente
      const { data: merged, changed } = mergeCustomer(existingData, incoming);
      if (changed) {
        await existingRef.update({ ...merged, fluxiaUpdatedAt: new Date().toISOString() });
      }
      savedClientId = clientId!;
    } else {
      // Criar novo
      const newId = `local_${Date.now()}`;
      const newData = { id: newId, ...incoming, createdAt: new Date().toISOString() };
      await adminDb.collection('bling_customers').doc(newId).set(newData);
      savedClientId = newId;
    }

    // ── Vincular clientId ao pedido de origem ─────────────────────────────────
    if (orderId) {
      await adminDb.collection('orders').doc(orderId).update({
        clientId: savedClientId,
        updatedAt: new Date().toISOString(),
      });
    }

    // ── Propagar para todos os pedidos do mesmo cliente ───────────────────────
    let propagated = 0;
    if (propagate) {
      // Campos que propagamos para os pedidos
      const orderUpdates: any = { updatedAt: new Date().toISOString() };
      if (incoming.celular) orderUpdates.phone = incoming.celular;
      if (incoming.email) orderUpdates.email = incoming.email;
      if (incoming.fantasia) orderUpdates.tradeName = incoming.fantasia;
      if (incoming.endereco?.geral) {
        const g = incoming.endereco.geral;
        orderUpdates.addressDetails = {
          street: g.endereco || '',
          number: g.numero || '',
          complement: g.complemento || '',
          district: g.bairro || '',
          city: g.municipio || '',
          state: g.uf || '',
          zip: g.cep || '',
        };
        if (g.endereco) {
          orderUpdates.address = `${g.endereco}${g.numero ? ', ' + g.numero : ''} - ${g.municipio}/${g.uf}`;
        }
      }

      // Buscar pedidos por clientId, CNPJ/CPF ou nome
      const queries: any[] = [];
      if (savedClientId) queries.push(adminDb.collection('orders').where('clientId', '==', savedClientId).get());
      if (docClean) queries.push(adminDb.collection('orders').where('cnpj', '==', docClean).get());
      if (docClean && docClean.length === 11) queries.push(adminDb.collection('orders').where('cpf', '==', docClean).get());
      if (!docClean) queries.push(adminDb.collection('orders').where('clientName', '==', nome).get());

      const snaps = await Promise.all(queries);
      const seen = new Set<string>();
      const batch = adminDb.batch();

      for (const snap of snaps) {
        for (const d of snap.docs) {
          if (seen.has(d.id) || d.id === orderId) continue;
          seen.add(d.id);
          batch.update(d.ref, { ...orderUpdates, clientId: savedClientId });
          propagated++;
        }
      }
      if (propagated > 0) await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      clientId: savedClientId,
      propagated,
      message: `Cliente salvo. ${propagated} pedido(s) atualizado(s).`
    });

  } catch (error: any) {
    console.error('[clientes/atualizar]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
