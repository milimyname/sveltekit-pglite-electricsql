import { sql } from 'drizzle-orm'
import { XMLParser } from 'fast-xml-parser'
import { v4 as uuid } from 'uuid'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { exit } from 'node:process'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import { db } from '../db/index.js'
import { dictionaryEntries, meanings } from '../db/schema.ts'
import type { JMDictEntry, WordFrequency } from '../types/jmdict.d.ts'

const JMDICT_URL = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const TEMP_DIR = './temp'
const DOWNLOAD_PATH = `${TEMP_DIR}/JMdict_e.gz`
const XML_PATH = `${TEMP_DIR}/JMdict_e.xml`

// Add performance monitoring
let startTime = Date.now()
let lastLogged = startTime
const PROGRESS_INTERVAL = 10000 // Log every 10 seconds

async function downloadDictionary() {
  // Create temp directory
  await fsPromises.mkdir(TEMP_DIR, { recursive: true })

  try {
    console.log('Downloading JMdict...')
    const response = await fetch(JMDICT_URL)

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
    }

    // Check if the response is actually a gzip file
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/x-gzip')) {
      throw new Error('Downloaded file is not a gzip archive')
    }

    // Save compressed file
    const fileStream = fs.createWriteStream(DOWNLOAD_PATH)
    await pipeline(response.body, fileStream)

    // Decompress
    console.log('Extracting JMdict...')
    const gunzip = createGunzip()
    const sourceStream = fs.createReadStream(DOWNLOAD_PATH)
    const outputStream = fs.createWriteStream(XML_PATH)

    await pipeline(sourceStream, gunzip, outputStream)
    console.log('Extraction complete')
  } catch (error) {
    console.error('Error importing dictionary:', error)
  }
}

async function processDictionary() {
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) =>
      ['ent_seq', 'k_ele', 'r_ele', 'sense', 'gloss', 'pos', 'keb', 'reb'].includes(name),
  })

  console.log('Reading JMdict XML...')
  const xmlContent = await fsPromises.readFile(XML_PATH, 'utf-8')

  console.log('Parsing JMdict XML...')
  const result = parser.parse(xmlContent)
  const entries = result.JMdict.entry

  // Process in batches to avoid memory issues
  const BATCH_SIZE = 5000
  const totalEntries = entries.length
  let processedEntries = 0

  console.log(`Starting to process ${totalEntries} entries...`)
  startTime = Date.now() // Reset start time before processing begins

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    await processBatch(batch)

    processedEntries += batch.length
    logProgress(processedEntries, totalEntries)
  }

  // Final progress update
  console.log('\nProcessing completed:')
  logProgress(totalEntries, totalEntries)
}

async function processBatch(entries: JMDictEntry[]) {
  // Prepare all data for batch insertion
  const dictionaryValues: any[] = []
  const meaningValues: any[] = []

  for (const entry of entries) {
    const kanji = entry.k_ele?.map((k) => k.keb[0]) || []
    const reading = entry.r_ele.map((r) => r.reb[0])
    const pos = entry.sense.flatMap((s) => s.pos || [])
    const { frequency, isCommon } = getWordFrequencyInfo(entry)

    dictionaryValues.push({
      id: uuid(),
      kanji: kanji.join('|'),
      reading: reading.join('|'),
      pos,
      jlptLevel: mapToJLPT(frequency),
      isCommon,
    })

    // Prepare meanings with the known entry ID
    const entryMeanings = entry.sense.flatMap((s) => s.gloss)
    meaningValues.push(
      ...entryMeanings.map((meaning, priority) => ({
        entryId: dictionaryValues[dictionaryValues.length - 1].id,
        meaning,
        priority,
      }))
    )
  }

  // Perform batch inserts within a transaction
  await db.transaction(async (tx) => {
    // Batch insert dictionary entries
    if (dictionaryValues.length > 0) {
      await tx.insert(dictionaryEntries).values(dictionaryValues).onConflictDoNothing()
    }

    // Batch insert meanings using chunks to avoid statement size limits
    const CHUNK_SIZE = 1000
    for (let i = 0; i < meaningValues.length; i += CHUNK_SIZE) {
      const chunk = meaningValues.slice(i, i + CHUNK_SIZE)
      if (chunk.length > 0) {
        await tx.insert(meanings).values(chunk).onConflictDoNothing()
      }
    }
  })
}

function getWordFrequencyInfo(entry: JMDictEntry): WordFrequency {
  const priorityTags = [
    ...(entry.k_ele?.flatMap((k) => k.ke_pri || []) || []),
    ...(entry.r_ele?.flatMap((r) => r.re_pri || []) || []),
  ]

  // Get nf number if exists
  const nfTag = priorityTags.find((tag) => tag.startsWith('nf'))
  const frequency = nfTag ? parseInt(nfTag.slice(2)) : null

  return {
    frequency,
    isNewsRanked: priorityTags.some((tag) => tag.startsWith('news')),
    isIchiRanked: priorityTags.some((tag) => tag.startsWith('ichi')),
    isCommon: priorityTags.some((tag) =>
      ['news1', 'news2', 'ichi1', 'ichi2', 'spec1', 'spec2', 'gai1'].includes(tag)
    ),
  }
}

// JLPT level could be roughly mapped based on frequency:
function mapToJLPT(frequency: number | null): string | null {
  if (!frequency) {
    return null
  }

  if (frequency <= 5) {
    return 'N5'
  } // Most frequent
  if (frequency <= 10) {
    return 'N4'
  }
  if (frequency <= 15) {
    return 'N3'
  }
  if (frequency <= 25) {
    return 'N2'
  }
  if (frequency <= 35) {
    return 'N1'
  }
  return null
}

async function cleanup() {
  await fsPromises.rm(TEMP_DIR, { recursive: true, force: true })
}

async function clearTables() {
  try {
    // Alternative method using raw SQL if the above doesn't work
    // await db.execute(sql`TRUNCATE TABLE meanings CASCADE;`)
    // await db.execute(sql`TRUNCATE TABLE dictionary_entries CASCADE;`)
    await db.execute(sql`TRUNCATE TABLE examples CASCADE;`)

    console.log('Successfully cleared all tables')
  } catch (error) {
    console.error('Error clearing tables:', error)
    throw error
  }
}

function logProgress(processed: number, total: number) {
  const now = Date.now()
  if (now - lastLogged >= PROGRESS_INTERVAL) {
    const elapsedSeconds = (now - startTime) / 1000
    const entriesPerSecond = processed / elapsedSeconds
    const percentComplete = ((processed / total) * 100).toFixed(2)
    const estimatedTotal = total / entriesPerSecond
    const remainingSeconds = estimatedTotal - elapsedSeconds

    console.log(
      `Progress: ${percentComplete}% (${processed}/${total} entries)\n` +
        `Speed: ${entriesPerSecond.toFixed(2)} entries/second\n` +
        `Estimated time remaining: ${(remainingSeconds / 60).toFixed(2)} minutes`
    )

    lastLogged = now
  }
}

// Also update your main function to clear tables first:
async function main() {
  startTime = Date.now()
  try {
    console.log('Starting dictionary import...')

    // Clear tables first
    // console.log('Clearing existing tables...')
    // await clearTables()

    console.log('Downloading dictionary...')
    await downloadDictionary()

    console.log('Processing dictionary...')
    await processDictionary()

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\nDictionary import completed successfully in ${totalTime} seconds`)
  } catch (error) {
    console.error('Error importing dictionary:', error)
    exit(1)
  } finally {
    // await cleanup()
  }
}

main()
