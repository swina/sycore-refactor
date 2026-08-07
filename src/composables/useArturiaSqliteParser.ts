import initSqlJs, { type Database } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { mapStandardEntries } from './useStandardJsonParser'

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null
function loadSqlJs() {
  sqlJsPromise ??= initSqlJs({ locateFile: () => sqlWasmUrl })
  return sqlJsPromise
}

// p.idx (the playlist's own position) becomes bankmsb so each playlist
// round-trips to a distinct MIDI bank; s.idx (song position within the
// playlist) becomes pc.
const QUERY = `
  SELECT p.name AS playlist_name, pid.name AS preset,
         p.idx AS bankmsb, s.idx AS pc
  FROM Playlists_V2 p
  JOIN Playlist_Presets s ON p.key_id = s.song_key
  JOIN Preset_Id pid ON s.preset_key = pid.key_id
  JOIN Instruments i ON pid.instrument_key = i.key_id
  ORDER BY p.name, s.idx
`



interface RawEntry {
  pc: number
  name: string
  bankmsb: number
}

/**
 * Run the playlist/preset query against an open Arturia db.db3 database and
 * group the rows by playlist name. In-memory only — never writes to disk.
 */
function exportArturiaPlaylists(db: Database): Record<string, RawEntry[]> {
  let res
  try {
    res = db.exec(QUERY)
  } catch {
    throw new Error('Arturia might have updated their database schema — query failed.')
  }
  if (!res.length) throw new Error('No playlists or songs found in the database.')

  const { columns, values } = res[0]
  const grouped: Record<string, RawEntry[]> = {}
  for (const row of values) {
    const r: any = Object.fromEntries(columns.map((c, i) => [c, row[i]]))
    const playlistName = String(r.playlist_name)
    ;(grouped[playlistName] ??= []).push({
      pc: Number(r.pc) + 1, // 0-indexed song position -> 1-128 range
      name: String(r.preset),
      bankmsb: Number(r.bankmsb),
    })
  }
  return grouped
}

/**
 * Parse an Arturia Analog Lab db.db3 SQLite database (picked via a file
 * input — the browser equivalent of "prompt for the db location") into one
 * preset bank per playlist, normalized through useStandardJsonParser's
 * shared mapping logic.
 *
 * Returns: { [playlistName]: preset[] }
 * Throws on invalid file / unexpected schema.
 */
export async function parseArturiaSqlite(file: File): Promise<Record<string, any[]>> {
  const SQL = await loadSqlJs()
  let db: Database
  try {
    db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('Not a valid SQLite database.')
  }

  try {
    const playlists = exportArturiaPlaylists(db)
    const banks: Record<string, any[]> = {}
    for (const [name, entries] of Object.entries(playlists)) {
      banks[name] = mapStandardEntries(entries)
    }
    return banks
  } finally {
    db.close()
  }
}
