'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Customer } from '@/types';

export type SearchResult = {
    id: string;
    type: 'Customer' | 'Task' | 'Deal' | 'Company';
    title: string;
    subtitle: string;
    url?: string;
    matchField?: string;
};

// Define context type
export type SearchUserContext = {
    role: string;
    team: string; // 'AEC' | 'MFG'
    uid: string;
};

export async function searchGlobal(query: string, userContext: SearchUserContext): Promise<SearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    const cleanQuery = query.toLowerCase().trim();
    // Use userContext directly
    // console.log(`[Action: searchGlobal] Searching for: "${cleanQuery}" with context: ${JSON.stringify(userContext)}`);

    try {
        const { role, team, uid } = userContext;

        // 1. Prepare filtering data
        let teamSalesIds: string[] = [];

        if (role === 'Leader') {
            const salesSnapshot = await adminDb.collection('users')
                .where('role', '==', 'Sales')
                .where('team', '==', team)
                .select('uid')
                .get();
            teamSalesIds = salesSnapshot.docs.map(d => d.id);
        }

        // 2. Fetch all customers (Optimized fields)
        const snapshot = await adminDb.collection('customers')
            .select('name', 'email', 'company', 'phone', 'team', 'assignedSalesId', 'jobTitle')
            .get();

        const results: SearchResult[] = [];

        // 3. Iterate and Filter
        for (const doc of snapshot.docs) {
            const data = doc.data() as Partial<Customer>;

            // --- Security / Role Filtering ---
            let hasAccess = false;

            if (role === 'Superadmin') {
                hasAccess = true;
            } else if (role === 'Leader') {
                if (data.team === team) {
                    hasAccess = true;
                } else if (data.assignedSalesId && teamSalesIds.includes(data.assignedSalesId)) {
                    hasAccess = true;
                }
            } else if (role === 'Sales') {
                if (data.assignedSalesId === uid) hasAccess = true;
            } else {
                hasAccess = false;
            }

            // Skip strictly
            if (!hasAccess) continue;

            // --- Text Search Filtering ---
            const name = data.name?.toLowerCase() || '';
            const email = data.email?.toLowerCase() || '';
            const company = data.company?.toLowerCase() || '';
            const phone = data.phone?.toLowerCase() || '';
            const custTeam = data.team?.toLowerCase() || '';

            let isMatch = false;
            let matchDetails = '';

            // Priority 1: Name
            if (name.includes(cleanQuery)) {
                isMatch = true;
                matchDetails = data.email || '';
            }
            // Priority 2: Company
            else if (company.includes(cleanQuery)) {
                isMatch = true;
                matchDetails = `Company: ${data.company}`;
            }
            // Priority 3: Email
            else if (email.includes(cleanQuery)) {
                isMatch = true;
                matchDetails = `Email: ${data.email}`;
            }
            // Priority 4: Phone
            else if (phone.includes(cleanQuery)) {
                isMatch = true;
                matchDetails = `Phone: ${data.phone}`;
            }
            // Priority 5: Division/Team
            else if (custTeam.includes(cleanQuery)) {
                isMatch = true;
                matchDetails = `Team: ${data.team}`;
            }

            if (isMatch) {
                results.push({
                    id: doc.id,
                    type: 'Customer',
                    title: data.name || 'No Name',
                    subtitle: matchDetails,
                    url: `/dashboard?view=customer-manager&id=${doc.id}`,
                    matchField: isMatch && company.includes(cleanQuery) ? 'company' : 'other'
                });
            }
        }

        // --- Post-Processing for Companies ---
        const companiesFound: Record<string, number> = {};

        // We iterate ALL docs (snapshot) again context-free? No, standard filter loop is fine.
        // We'll add a separate loop or integrated logic.

        // Integrated Logic:
        // We can't rely on 'results' because it's capped at 20.
        // We need 'real' count.

        // Let's recalculate simply:
        snapshot.docs.forEach(doc => {
            const d = doc.data() as Partial<Customer>;

            // Re-apply security
            let hasAccess = false;
            if (role === 'Superadmin') hasAccess = true;
            else if (role === 'Leader' && (d.team === team || (d.assignedSalesId && teamSalesIds.includes(d.assignedSalesId)))) hasAccess = true;
            else if (role === 'Sales' && d.assignedSalesId === uid) hasAccess = true;

            if (!hasAccess) return;

            const cName = d.company?.trim();
            if (cName && cName.toLowerCase().includes(cleanQuery)) {
                companiesFound[cName] = (companiesFound[cName] || 0) + 1;
            }
        });

        // Add Company Results
        const companyResults: SearchResult[] = Object.entries(companiesFound).map(([compName, count]) => ({
            id: `comp-${compName}`,
            type: 'Company' as any, // Cast to any to satisfy type if not updated yet
            title: compName,
            subtitle: `${count} People Found`,
            url: `/dashboard?view=customer-manager&search=${encodeURIComponent(compName)}` // Open filter
        })).slice(0, 5); // Limit companies

        // Merge: Companies first, then Customers
        return [...companyResults, ...results].slice(0, 20);

    } catch (error) {
        console.error("[Action: searchGlobal] Error:", error);
        return [];
    }
}
