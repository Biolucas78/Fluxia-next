import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

interface OFXTransaction {
  date: string;
  amount: number;
  memo: string;
  fitid: string;
  type: 'income' | 'expense';
}

function parseOFXDate(raw: string): string {
  // OFX dates: 20240115 or 20240115120000[-03:00]
  const clean = String(raw).substring(0, 8);
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return new Date().toISOString().split('T')[0];
}

function parseOFXContent(text: string): OFXTransaction[] {
  // OFX é um formato SGML — tentar converter para XML-like antes do parser
  // Remove headers antes do <OFX>
  const ofxStart = text.indexOf('<OFX>');
  if (ofxStart === -1) return [];
  let xmlPart = text.slice(ofxStart);

  // Adiciona fechamento de tags SGML que não têm fechamento
  const sgmlTags = ['OFXHEADER', 'DATA', 'VERSION', 'SECURITY', 'ENCODING', 'CHARSET', 'COMPRESSION', 'OLDFILEUID', 'NEWFILEUID'];
  const selfClosing = ['TRNTYPE', 'DTPOSTED', 'TRNAMT', 'FITID', 'MEMO', 'NAME', 'DTSTART', 'DTEND', 'BALAMT', 'DTASOF', 'CURDEF', 'ACCTID', 'ACCTTYPE', 'BANKID'];

  // Para OFX SGML puro (sem XML), tentar parsing simples via regex
  const transactions: OFXTransaction[] = [];
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = stmtTrnRegex.exec(xmlPart)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}>([^<\n\r]*)`, 'i').exec(block);
      return m ? m[1].trim() : '';
    };

    const amtStr = get('TRNAMT').replace(',', '.');
    const amount = parseFloat(amtStr) || 0;
    const dtPosted = get('DTPOSTED') || get('DTAVAIL') || '';
    const memo = get('MEMO') || get('NAME') || '';
    const fitid = get('FITID') || '';
    const trnType = get('TRNTYPE').toUpperCase();

    if (!dtPosted && !fitid) continue;

    transactions.push({
      date:   parseOFXDate(dtPosted),
      amount: Math.abs(amount),
      memo:   memo,
      fitid:  fitid,
      type:   amount < 0 || trnType === 'DEBIT' ? 'expense' : 'income',
    });
  }

  // Fallback: tentar XML parser
  if (transactions.length === 0) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xmlPart);
      const stmtList =
        parsed?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS?.BANKTRANLIST?.STMTTRN ||
        parsed?.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS?.BANKTRANLIST?.STMTTRN || [];
      const list = Array.isArray(stmtList) ? stmtList : [stmtList];
      for (const t of list) {
        if (!t) continue;
        const amount = parseFloat(String(t.TRNAMT || 0).replace(',', '.')) || 0;
        transactions.push({
          date:   parseOFXDate(String(t.DTPOSTED || '')),
          amount: Math.abs(amount),
          memo:   String(t.MEMO || t.NAME || ''),
          fitid:  String(t.FITID || ''),
          type:   amount < 0 ? 'expense' : 'income',
        });
      }
    } catch {}
  }

  return transactions;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo .OFX enviado.' }, { status: 400 });

    const text = await file.text();
    const transactions = parseOFXContent(text);

    if (transactions.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhuma transação encontrada no arquivo OFX.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, transactions, total: transactions.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
