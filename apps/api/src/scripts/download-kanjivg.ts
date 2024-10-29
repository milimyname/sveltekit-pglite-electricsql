import { eq } from 'drizzle-orm'
import { XMLParser } from 'fast-xml-parser'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { exit } from 'node:process'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { db } from '../db/index.ts'
import { kanjiEntries } from '../db/schema.ts'

const KANJIVG_URL =
  'https://github.com/KanjiVG/kanjivg/releases/download/r20240807/kanjivg-20240807.xml.gz'
const TEMP_DIR = './temp'
const KANJIVG_PATH = `${TEMP_DIR}/kanjivg.xml`

interface KanjiVGData {
  [kanji: string]: {
    strokes: string[]
    groups: StrokeGroup[]
  }
}

interface StrokeGroup {
  element: string
  strokes: string[]
  groups?: StrokeGroup[]
}

async function downloadAndExtract() {
  await fsPromises.mkdir(TEMP_DIR, { recursive: true })

  console.log('Downloading KanjiVG data...')
  const response = await fetch(KANJIVG_URL)

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  const tempPath = `${KANJIVG_PATH}.gz`
  const fileStream = fs.createWriteStream(tempPath)
  await pipeline(response.body, fileStream)

  console.log('Extracting...')
  const gunzip = createGunzip()
  const input = fs.createReadStream(tempPath)
  const output = fs.createWriteStream(KANJIVG_PATH)

  await pipeline(input, gunzip, output)
  await fsPromises.unlink(tempPath)
}

async function parseKanjiVG(): Promise<KanjiVGData> {
  console.log('Parsing KanjiVG data...')

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    isArray: (name) => ['kanji', 'g', 'path'].includes(name),
    preserveOrder: false,
    trimValues: true,
    parseTagValue: true,
    allowBooleanAttributes: true,
  })

  const xmlContent = await fsPromises.readFile(KANJIVG_PATH, 'utf-8')
  console.log('XML file loaded, size:', xmlContent.length)

  const result = parser.parse(xmlContent)
  const kanjiData: KanjiVGData = {}

  // Debug the parsed structure
  console.log('Parsed structure keys:', Object.keys(result))

  const kanjiElements = result.kanjivg?.kanji || result.kanji || []

  if (!kanjiElements || kanjiElements.length === 0) {
    throw new Error('No kanji elements found in XML')
  }

  console.log(`Found ${kanjiElements.length} kanji elements`)

  for (const entry of kanjiElements) {
    // Get the kanji character from the element attribute
    const kanjiElement = entry.g?.[0]?.['@_kvg:element']

    if (!kanjiElement) {
      console.log('Skipping entry without kanji element:', entry['@_id'])
      continue
    }

    // Skip variant entries
    if (entry.g?.[0]?.['@_kvg:variant'] === 'true') {
      console.log('Skipping variant:', kanjiElement)
      continue
    }

    const strokes: string[] = []
    const groups: StrokeGroup[] = []

    function processGroup(element: any) {
      if (!element) return

      // Process paths (strokes)
      if (element.path) {
        const paths = Array.isArray(element.path) ? element.path : [element.path]
        paths.forEach((p: any) => {
          const strokeData = p['@_d']
          if (strokeData) strokes.push(strokeData)
        })
      }

      // Process groups recursively
      if (element.g) {
        const gElements = Array.isArray(element.g) ? element.g : [element.g]
        gElements.forEach((g: any) => {
          processGroup(g)
          const group = extractStrokeGroups(g)
          if (group.strokes.length > 0 || (group.groups && group.groups.length > 0)) {
            groups.push(group)
          }
        })
      }
    }

    // Start processing from the root group
    processGroup(entry)

    // Only add if we found strokes
    if (strokes.length > 0) {
      kanjiData[kanjiElement] = { strokes, groups }
      if (Object.keys(kanjiData).length % 100 === 0) {
        console.log(`Processed ${Object.keys(kanjiData).length} kanji...`)
      }
    }
  }

  // Log some sample data for verification
  const sampleKanji = Object.keys(kanjiData)[0]
  if (sampleKanji) {
    console.log('\nSample kanji data:', {
      kanji: sampleKanji,
      strokeCount: kanjiData[sampleKanji].strokes.length,
      firstStroke: kanjiData[sampleKanji].strokes[0],
    })
  }

  console.log(`Successfully processed ${Object.keys(kanjiData).length} kanji`)
  return kanjiData
}

function extractStrokeGroups(element: any): StrokeGroup {
  const group: StrokeGroup = {
    element: element['@_kvg:element'] || '',
    strokes: [],
  }

  if (element.path) {
    const paths = Array.isArray(element.path) ? element.path : [element.path]
    group.strokes = paths.map((p: any) => p['@_d']).filter(Boolean)
  }

  if (element.g) {
    const gElements = Array.isArray(element.g) ? element.g : [element.g]
    group.groups = gElements
      .map((g) => extractStrokeGroups(g))
      .filter((g) => g.strokes.length > 0 || (g.groups && g.groups.length > 0))
  }

  return group
}

async function updateKanjiStrokes() {
  console.log('Parsing KanjiVG data...')
  const kanjiVGData = await parseKanjiVG()

  console.log(`Parsed ${Object.keys(kanjiVGData).length} kanji from KanjiVG`)

  if (Object.keys(kanjiVGData).length === 0) {
    throw new Error('No kanji data parsed from KanjiVG')
  }

  // Get all kanji from database
  const savedKanji = await db
    .select({
      id: kanjiEntries.id,
      kanji: kanjiEntries.kanji,
    })
    .from(kanjiEntries)

  console.log(`Found ${savedKanji.length} kanji in database`)

  // Update in batches
  const BATCH_SIZE = 100
  let updatedCount = 0
  let skippedCount = 0

  for (let i = 0; i < savedKanji.length; i += BATCH_SIZE) {
    const batch = savedKanji.slice(i, i + BATCH_SIZE)

    await db.transaction(async (tx) => {
      for (const entry of batch) {
        const vgData = kanjiVGData[entry.kanji]

        if (vgData && vgData.strokes.length > 0) {
          await tx
            .update(kanjiEntries)
            .set({
              strokeOrder: vgData.strokes,
              strokeGroups: vgData.groups,
              strokeCount: vgData.strokes.length, // Also update stroke count
              updatedAt: new Date().toISOString(),
            })
            .where(eq(kanjiEntries.id, entry.id))

          updatedCount++
        } else {
          skippedCount++
        }
      }
    })

    console.log(`Processed ${i + batch.length} of ${savedKanji.length} kanji`)
  }

  console.log(`Updated ${updatedCount} kanji with stroke data`)
  console.log(`Skipped ${skippedCount} kanji (no stroke data found)`)
}

// Helper function to get stroke data for a kanji
async function getKanjiStrokes(kanji: string) {
  return db
    .select({
      kanji: kanjiEntries.kanji,
      strokeOrder: strokeData.strokeOrder,
      strokeGroups: strokeData.strokeGroups,
    })
    .from(kanjiEntries)
    .innerJoin(strokeData, eq(strokeData.kanjiId, kanjiEntries.id))
    .where(eq(kanjiEntries.kanji, kanji))
    .limit(1)
}

// Update validation function
async function validateStrokeData(kanji: string) {
  const data = await db
    .select({
      kanji: kanjiEntries.kanji,
      strokeOrder: kanjiEntries.strokeOrder,
      strokeGroups: kanjiEntries.strokeGroups,
      strokeCount: kanjiEntries.strokeCount,
    })
    .from(kanjiEntries)
    .where(eq(kanjiEntries.kanji, kanji))
    .limit(1)

  if (!data[0]) {
    console.log(`Kanji ${kanji} not found`)
    return false
  }

  const entry = data[0]
  console.log(`Validation for ${kanji}:`)
  console.log('- Number of strokes:', entry.strokeCount)
  console.log('- Actual strokes:', entry.strokeOrder?.length || 0)
  console.log('- Has stroke groups:', !!entry.strokeGroups)
  console.log('- Sample stroke data:', entry.strokeOrder?.[0])

  return entry.strokeOrder?.length > 0
}

// Helper function to get kanji data
async function getKanjiData(kanji: string) {
  return db.select().from(kanjiEntries).where(eq(kanjiEntries.kanji, kanji)).limit(1)
}

async function cleanup() {
  console.log('Cleaning up temporary files...')
  await fsPromises.rm(TEMP_DIR, { recursive: true, force: true })
}

async function main() {
  try {
    // First download and parse KanjiVG data
    // await downloadAndExtract()

    console.log('Starting stroke data update...')
    await updateKanjiStrokes()

    // Validate some common kanji
    const testKanji = ['一', '二', '三', '四', '五', '教']
    for (const kanji of testKanji) {
      await validateStrokeData(kanji)
    }

    // Show a complete example
    const sample = await getKanjiData('教')
    if (sample[0]) {
      console.log('\nComplete data example for 教:')
      console.log(JSON.stringify(sample[0], null, 2))
    }

    console.log('Update completed successfully')
  } catch (error) {
    console.error('Error updating stroke data:', error)
    exit(1)
  } finally {
    // await cleanup()
  }
}

main()
