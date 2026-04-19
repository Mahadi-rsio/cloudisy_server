import Cloudflare from 'cloudflare';
import 'dotenv/config';

// ── Config ────────────────────────────────────────────────────────────────────

const ZONE_ID = process.env['ZONE_ID']!;
const TARGET = {
    name: 'cloudisy.top',
    type: 'A' as const,
    ttl: 60,
};

// ── Client ────────────────────────────────────────────────────────────────────

const client = new Cloudflare({
    apiToken: process.env['API_TOKEN'],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function listZones() {
    const zones = await client.zones.list();
    console.log('📋 Zones:');
    zones.result.forEach(z => console.log(`   ${z.name} → ${z.id}`));
}

async function findRecord(name: string, type: 'A' | 'CNAME' | 'MX') {
    const { result } = await client.dns.records.list({ zone_id: ZONE_ID, type });

    const record = result.find(r => r.name === name);
    if (!record) throw new Error(`No ${type} record found for "${name}"`);

    console.log(`\n🔍 Found record:`);
    console.log(`   ${record.name} → ${record.content} (TTL: ${record.ttl})`);

    return record;
}

async function updateRecord(id: string, patch: Partial<typeof TARGET> & { content?: string }) {
    const record = await client.dns.records.edit(id, {
        zone_id: ZONE_ID,
        name: TARGET.name,
        type: TARGET.type,
        ...patch,
    });

    console.log(`\n✅ Updated record:`);
    console.log(`   ${record.name} → ${record.content}`);
    console.log(`   TTL: ${record.ttl} | Modified: ${record.modified_on}`);

    return record;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    await listZones();

    const record = await findRecord(TARGET.name, TARGET.type);

    if (record.ttl === TARGET.ttl) {
        console.log(`\n⏭️  TTL already set to ${TARGET.ttl}, no update needed.`);
        return;
    }

    await updateRecord(record.id, {
        content: record.content,
        ttl: TARGET.ttl,
    });
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
