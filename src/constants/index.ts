export const TOP_LEVEL_DOMAIN = 'localhost'
export const TEMP_ZIPS_DIR = 'temp_zips'
export const MAX_FILE_SIZE = 250 * 1024 * 1024

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMIT_MAX = 100

export const SYNC_CRON_PATTERN = '0 */2 * * * *'

export const MANAGED_DB_PORT_START = Number(process.env.MANAGED_DB_PORT_START || 15432)
export const MANAGED_DB_PORT_END = Number(process.env.MANAGED_DB_PORT_END || 15462)
export const MANAGED_DB_EXTERNAL_HOST = process.env.MANAGED_DB_EXTERNAL_HOST || 'localhost'
export const MANAGED_DB_NETWORK = process.env.MANAGED_DB_NETWORK || 'cloudisy_net'
export const MANAGED_DB_DEFAULT_IMAGE = process.env.MANAGED_DB_DEFAULT_IMAGE || 'postgres:16-alpine'
export const MANAGED_DB_MIN_RAM_MB = Number(process.env.MANAGED_DB_MIN_RAM_MB || 256)
export const MANAGED_DB_MAX_RAM_MB = Number(process.env.MANAGED_DB_MAX_RAM_MB || 8192)
export const MANAGED_DB_MIN_STORAGE_MB = Number(process.env.MANAGED_DB_MIN_STORAGE_MB || 1024)
export const MANAGED_DB_MAX_STORAGE_MB = Number(process.env.MANAGED_DB_MAX_STORAGE_MB || 102400)
