import { NextRequest, NextResponse } from 'next/server';
import { adminDb as db } from '@/lib/firebase-admin'; // Use Admin SDK for server-side reliability
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const bid = searchParams.get('bid'); // Blast ID

    if (!url) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    // Fire and forget (optional: could await if strict consistency is needed)
    if (bid) {
        console.log(`[Tracking] Processing click for BID: ${bid}`);
        try {
            await db.collection('email_blasts').doc(bid).update({
                clickCount: FieldValue.increment(1)
            });
            console.log(`[Tracking] Successfully incremented click count for: ${bid}`);
        } catch (error) {
            console.error(`[Tracking] FAILED to track click for ${bid}:`, error);
            // Don't block the user if tracking fails
        }
    } else {
        console.warn('[Tracking] No BID found in URL');
    }

    // Redirect to the actual destination
    return NextResponse.redirect(url);
}
