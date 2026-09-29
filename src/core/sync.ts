import { DEFAULT_SETTINGS, SCHEMA_VERSION, emptyData, type AppData } from './types'

// Formato del file di scambio (.amat): lo stesso AppData con un'intestazione.
// Serve per backup manuali e per sincronizzare desktop <-> Android scambiando il file.

export interface ExportFile {
  format: 'amatori'
  exportedAt: string
  data: AppData
}

export function toExportFile(data: AppData): ExportFile {
  return { format: 'amatori', exportedAt: new Date().toISOString(), data }
}

/** Accetta sia un ExportFile sia un AppData "nudo" e restituisce dati validi e completi. */
export function parseDataFile(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('File non valido')
  const obj = raw as Record<string, unknown>
  const data = (obj.format === 'amatori' ? obj.data : obj) as Partial<AppData>
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
    throw new Error('Il file non contiene dati Amatori')
  }
  if ((data.schemaVersion ?? 1) > SCHEMA_VERSION) {
    throw new Error('Il file è stato creato da una versione più recente dell\'app')
  }
  const base = emptyData()
  return {
    schemaVersion: SCHEMA_VERSION,
    season: { ...base.season, ...data.season },
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    metaUpdatedAt: data.metaUpdatedAt ?? base.metaUpdatedAt,
    players: data.players,
    matches: data.matches,
    tournaments: Array.isArray(data.tournaments) ? data.tournaments : [],
    snapshots: Array.isArray(data.snapshots) ? data.snapshots : []
  }
}

interface Versioned {
  id: string
  updatedAt: string
}

function mergeById<T extends Versioned>(a: T[], b: T[]): { list: T[]; added: number; updated: number } {
  const map = new Map(a.map((x) => [x.id, x]))
  let added = 0
  let updated = 0
  for (const item of b) {
    const cur = map.get(item.id)
    if (!cur) {
      map.set(item.id, item)
      added++
    } else if (item.updatedAt > cur.updatedAt) {
      map.set(item.id, item)
      updated++
    }
  }
  return { list: [...map.values()], added, updated }
}

export interface MergeReport {
  players: { added: number; updated: number }
  matches: { added: number; updated: number }
  tournaments: { added: number; updated: number }
  snapshots: { added: number; updated: number }
  settingsFromIncoming: boolean
}

/**
 * Unisce due copie dei dati: per ogni elemento vince la versione modificata più di recente.
 * Le cancellazioni sono "morbide" (deleted: true) così si propagano anche loro.
 */
export function mergeData(local: AppData, incoming: AppData): { data: AppData; report: MergeReport } {
  const p = mergeById(local.players, incoming.players)
  const m = mergeById(local.matches, incoming.matches)
  const t = mergeById(local.tournaments, incoming.tournaments)
  const s = mergeById(local.snapshots, incoming.snapshots)
  const metaFromIncoming = incoming.metaUpdatedAt > local.metaUpdatedAt
  const meta = metaFromIncoming ? incoming : local
  return {
    data: {
      schemaVersion: SCHEMA_VERSION,
      season: meta.season,
      settings: meta.settings,
      metaUpdatedAt: meta.metaUpdatedAt,
      players: p.list,
      matches: m.list,
      tournaments: t.list,
      snapshots: s.list
    },
    report: {
      players: { added: p.added, updated: p.updated },
      matches: { added: m.added, updated: m.updated },
      tournaments: { added: t.added, updated: t.updated },
      snapshots: { added: s.added, updated: s.updated },
      settingsFromIncoming: metaFromIncoming
    }
  }
}
