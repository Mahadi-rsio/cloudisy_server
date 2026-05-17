export async function registerSupavisorTenant({
    tenant,
    dbHost,
    dbPort,
    dbDatabase,
    dbUser,
    dbPassword,
    poolSize = 10,
}: {
    tenant: string
    dbHost: string
    dbPort: number
    dbDatabase: string
    dbUser: string
    dbPassword: string
    poolSize?: number
}) {
    const supavisorApiUrl = process.env.SUPAVISOR_API_URL || 'http://supavisor:4000'
    const supavisorAuthToken = process.env.SUPAVISOR_AUTH_TOKEN

    if (!supavisorAuthToken) {
        throw new Error('SUPAVISOR_AUTH_TOKEN is not configured')
    }

    const response = await fetch(`${supavisorApiUrl}/api/tenants/${tenant}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: supavisorAuthToken,
        },
        body: JSON.stringify({
            tenant: {
                db_host: dbHost,
                db_port: dbPort,
                db_database: dbDatabase,
                ip_version: 'auto',
                enforce_ssl: false,
                require_user: true,
                users: [
                    {
                        db_user: dbUser,
                        db_password: dbPassword,
                        pool_size: poolSize,
                        mode_type: 'transaction',
                        is_manager: true,
                    },
                ],
            },
        })
    })

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`Supavisor registration failed (${response.status}): ${body}`)
    }
}

export function buildSupavisorConnectionUrl({
    dbName,
    dbUser,
    dbPassword,
}: {
    dbName: string
    dbUser: string
    dbPassword: string
}) {
    const host = process.env.SUPAVISOR_PUBLIC_HOST || 'localhost'
    const transactionPort = Number(process.env.SUPAVISOR_PUBLIC_TRANSACTION_PORT || 6543)

    return `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${host}:${transactionPort}/${dbName}?sslmode=disable`
}
