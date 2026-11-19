import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer('broadcast.send');
  if (v instanceof NextResponse) return v;
  try {
    return NextResponse.json({ recipients: await getBizStore().listRecipients((await params).id) });
  } catch (e) {
    return bizError(e);
  }
}
