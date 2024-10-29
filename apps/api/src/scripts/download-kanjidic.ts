import { XMLParser } from 'fast-xml-parser'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { db } from '../db/index.ts'
import { kanjiEntries } from '../db/schema.ts'
import { sql } from 'drizzle-orm'

const KANJIDIC_URL = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
const KRADFILE_URL = 'http://www.edrdg.org/kradfile/kradfile.gz'
const TEMP_DIR = './temp'
const KANJIDIC_PATH = `${TEMP_DIR}/kanjidic2.xml`

interface KanjidicEntry {
  literal: string[]
  misc: {
    grade?: string[]
    stroke_count?: string[]
    freq?: string[]
    jlpt?: string[]
  }
  reading_meaning?: {
    rmgroup: {
      meaning?: string[]
      reading?: Array<{
        '#text': string
        '@_r_type': string
      }>
    }
  }
}

async function ensureTempDir() {
  try {
    await fsPromises.mkdir(TEMP_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating temp directory:', error)
    throw error
  }
}

async function downloadAndExtract(url: string, outputPath: string) {
  console.log(`Downloading from ${url}...`)
  const response = await fetch(url)

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  const tempPath = `${outputPath}.gz`
  const fileStream = fs.createWriteStream(tempPath)
  await pipeline(response.body, fileStream)

  console.log('Extracting...')
  const gunzip = createGunzip()
  const input = fs.createReadStream(tempPath)
  const output = fs.createWriteStream(outputPath)

  try {
    await pipeline(input, gunzip, output)
  } finally {
    // Clean up the gzipped file even if extraction fails
    try {
      await fsPromises.unlink(tempPath)
    } catch (error) {
      console.error('Error cleaning up temp file:', error)
    }
  }
}

async function clearTables() {
  try {
    await db.delete(kanjiEntries)
    console.log('Cleared existing kanji entries')
  } catch (error) {
    console.error('Error clearing tables:', error)
    throw error
  }
}

async function processKanji() {
  // Download and parse KANJIDIC2
  await downloadAndExtract(KANJIDIC_URL, KANJIDIC_PATH)

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) =>
      ['literal', 'meaning', 'reading', 'grade', 'stroke_count', 'freq', 'jlpt'].includes(name),
  })

  const xmlContent = await fsPromises.readFile(KANJIDIC_PATH, 'utf-8')
  const result = parser.parse(xmlContent)
  const entries = result.kanjidic2.character

  console.log(`Found ${entries.length} kanji entries`)

  // Process in batches
  const BATCH_SIZE = 500
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    await processKanjiBatch(batch)
    console.log(`Processed ${i + batch.length} of ${entries.length} kanji`)
  }
}

async function processKanjiBatch(entries: KanjidicEntry[]) {
  const values = entries.map((entry) => ({
    kanji: entry.literal[0],
    grade: entry.misc.grade?.[0] ? parseInt(entry.misc.grade[0]) : null,
    jlptLevel: entry.misc.jlpt?.[0] ? `N${entry.misc.jlpt[0]}` : null,
    strokeCount: parseInt(entry.misc.stroke_count?.[0] || '0'),
    meanings: entry.reading_meaning?.rmgroup.meaning || [],
    onReadings:
      entry.reading_meaning?.rmgroup.reading
        ?.filter((r) => r['@_r_type'] === 'ja_on')
        .map((r) => r['#text']) || [],
    kunReadings:
      entry.reading_meaning?.rmgroup.reading
        ?.filter((r) => r['@_r_type'] === 'ja_kun')
        .map((r) => r['#text']) || [],
    frequency: entry.misc.freq?.[0] ? parseInt(entry.misc.freq[0]) : null,
    isJoyo: !!entry.misc.grade?.[0],
  }))

  try {
    await db.transaction(async (tx) => {
      await tx.insert(kanjiEntries).values(values).onConflictDoNothing()
    })
  } catch (error) {
    console.error('Error processing batch:', error)
    throw error
  }
}

async function cleanup() {
  console.log('Cleaning up temporary files...')
  try {
    await fsPromises.rm(TEMP_DIR, { recursive: true, force: true })
    console.log('Cleanup completed')
  } catch (error) {
    console.error('Error during cleanup:', error)
  }
}

async function verifyImport() {
  const count = await db.select({ count: sql<number>`count(*)` }).from(kanjiEntries)

  console.log(`Verified ${count[0].count} kanji entries in database`)
}

// Main import function
async function main() {
  const startTime = Date.now()

  try {
    console.log('Starting kanji dictionary import...')

    // Ensure temp directory exists
    await ensureTempDir()

    // Clear existing data
    // await clearTables()

    // Process kanji
    await processKanji()

    // Verify import
    await verifyImport()

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`Dictionary import completed in ${totalTime} seconds`)
  } catch (error) {
    console.error('Error importing dictionary:', error)
    throw error
  } finally {
    // await cleanup()
  }
}

main()
