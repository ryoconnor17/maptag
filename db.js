import { supabase } from './supabaseClient'

// ─────────────────────────────────────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all players, each with their scores array nested in.
 * Returns: Player[]  where Player = { id, name, scores: Score[] }
 *          Score = { id, date, value }
 */
export async function fetchPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, scores(id, date, value)')
    .order('created_at', { ascending: true })
    .order('date', { referencedTable: 'scores', ascending: true })

  if (error) throw error

  // Normalise: guarantee scores is always an array
  return (data ?? []).map(p => ({
    ...p,
    scores: (p.scores ?? []).sort((a, b) => a.date.localeCompare(b.date)),
  }))
}

/**
 * Insert a new player row.
 * Returns the created player (without scores yet).
 */
export async function createPlayer(name) {
  const { data, error } = await supabase
    .from('players')
    .insert({ name })
    .select('id, name')
    .single()

  if (error) throw error
  return { ...data, scores: [] }
}

/**
 * Delete a player and all their scores (scores cascade on DB side).
 */
export async function deletePlayer(playerId) {
  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', playerId)

  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────────
// Scores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a score for a player on a given date.
 * If a score already exists for that player+date it is replaced.
 * Returns the upserted score row.
 */
export async function upsertScore(playerId, date, value) {
  const { data, error } = await supabase
    .from('scores')
    .upsert(
      { player_id: playerId, date, value },
      { onConflict: 'player_id,date' }   // unique constraint on the table
    )
    .select('id, date, value')
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a single score row by its id.
 */
export async function deleteScore(scoreId) {
  const { error } = await supabase
    .from('scores')
    .delete()
    .eq('id', scoreId)

  if (error) throw error
}
