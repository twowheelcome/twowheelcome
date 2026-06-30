// One-time backfill of host_locations.location_district for rows created before the
// district column existed. Reverse-geocodes the ROUNDED (public, ~1km) coords via Nominatim
// — never touches the owner-only precise coords in host_location_coords. District is coarser
// than the already-public coords, so nothing precise is derived.
//
// Needs the service role key (RLS-bypass to write district on every owner's row). It is read
// from the environment — never hardcode it:
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-district.mjs        # dry run (no writes)
//   SUPABASE_SERVICE_ROLE_KEY=... APPLY=1 node scripts/backfill-district.mjs # actually writes
//
// Nominatim allows ~1 req/s; the script paces itself and sends a descriptive User-Agent.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://igrmxzvnadqckxjachdc.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.env.APPLY === '1'

if (!KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.')
  process.exit(2)
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

function districtFromAddress(a) {
  if (!a) return ''
  // Only genuine sub-city areas; Nominatim's district/borough map to "okres …" (county) in CZ.
  const d = (a.suburb || a.neighbourhood || a.quarter || a.city_district || '').trim()
  return /^okres\b/i.test(d) ? '' : d
}

async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    { headers: { 'User-Agent': 'twowheelcome-district-backfill/1.0 (petr.manych@gmail.com)' } }
  )
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const d = await res.json()
  return districtFromAddress(d.address)
}

const { data: rows, error } = await sb
  .from('host_locations')
  .select('id, location_lat, location_lng, location_city, location_country, location_district')
  .or('location_district.is.null,location_district.eq.')

if (error) { console.error('Query failed:', error.message); process.exit(1) }

console.log(`${rows.length} location(s) without a district.${APPLY ? '' : ' (dry run — no writes)'}`)

let filled = 0, empty = 0, failed = 0
for (const r of rows) {
  try {
    const district = await reverseGeocode(r.location_lat, r.location_lng)
    const where = `${r.location_city || '?'}, ${r.location_country || '?'}`
    if (!district) { empty++; console.log(`  – ${where}: no district from geocoder`); }
    else {
      console.log(`  ✓ ${where}: "${district}"`)
      if (APPLY) {
        const { error: upErr } = await sb.from('host_locations').update({ location_district: district }).eq('id', r.id)
        if (upErr) { failed++; console.log(`    ! update failed: ${upErr.message}`); }
        else filled++
      } else filled++
    }
  } catch (e) {
    failed++; console.log(`  ! ${r.id}: ${e.message}`)
  }
  await sleep(1100) // respect Nominatim's ~1 req/s policy
}

console.log(`\nDone. district found: ${filled}, none: ${empty}, failed: ${failed}.${APPLY ? '' : '\nRe-run with APPLY=1 to write.'}`)
