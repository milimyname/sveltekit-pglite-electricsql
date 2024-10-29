import { sql } from 'drizzle-orm'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { exit } from 'node:process'
import * as readline from 'node:readline'
import { promisify } from 'node:util'
import { pipeline } from 'stream/promises'
import { db } from '../db/index.ts'
import { dictionaryEntries, examples } from '../db/schema.ts'

const execAsync = promisify(exec)

const TEMP_DIR = './temp'

const TATOEBA_SENTENCES_URL = 'https://downloads.tatoeba.org/exports/sentences.tar.bz2' // Note: Using .gz instead
const TATOEBA_LINKS_URL = 'https://downloads.tatoeba.org/exports/links.tar.bz2'
const SENTENCES_PATH = `${TEMP_DIR}/sentences.csv`
const LINKS_PATH = `${TEMP_DIR}/links.csv`

// Add performance monitoring
let startTime = Date.now()

interface TatoebaSentence {
  id: string
  lang: string
  text: string
}

async function downloadAndExtractFile(url: string, outputPath: string) {
  console.log(`Downloading from ${url}...`)
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  // First save the tar.bz2 file
  const tempPath = `${outputPath}.tar.bz2`
  const tempStream = fs.createWriteStream(tempPath)
  await pipeline(response.body, tempStream)

  console.log(`Extracting to ${outputPath}...`)

  try {
    // Extract using system tar command
    await execAsync(`tar -xjf "${tempPath}" -C "${TEMP_DIR}"`)
  } catch (error) {
    console.error('Error during extraction:', error)
    throw new Error(`Failed to extract file: ${error.message}`)
  }

  // Clean up temp file
  await fsPromises.unlink(tempPath)

  console.log('Extraction complete')
}

async function downloadTatoebaFiles() {
  console.log('Downloading Tatoeba files...')

  try {
    // Create temp directory if it doesn't exist
    await fsPromises.mkdir(TEMP_DIR, { recursive: true })

    // Download and extract sentences
    await downloadAndExtractFile(TATOEBA_SENTENCES_URL, SENTENCES_PATH)

    // Download and extract links
    await downloadAndExtractFile(TATOEBA_LINKS_URL, LINKS_PATH)

    // Verify files exist
    await Promise.all([fsPromises.access(SENTENCES_PATH), fsPromises.access(LINKS_PATH)])

    console.log('All Tatoeba files downloaded and extracted successfully')
  } catch (error) {
    console.error('Error downloading Tatoeba files:', error)
    throw error
  }
}

// Add a Set to track processed sentence pairs
const processedPairs = new Set<string>()

// Helper function to create a unique key for sentence pairs
function createSentencePairKey(japanese: string, english: string): string {
  return `${japanese}|||${english}`
}

// Modified insertExamplesBatch with retry logic
async function insertExamplesBatch(
  exampleValues: Array<{
    entryId: string
    japanese: string
    english: string
  }>,
  retryCount = 0
) {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 5000 // 5 seconds

  try {
    if (exampleValues.length === 0) {
      return
    }

    // Use transaction for batch insert
    await db.transaction(async (tx) => {
      const CHUNK_SIZE = 250 // Reduced chunk size
      for (let i = 0; i < exampleValues.length; i += CHUNK_SIZE) {
        const chunk = exampleValues.slice(i, i + CHUNK_SIZE)

        // Validate chunk and remove duplicates
        const validChunk = chunk.filter(
          (example) =>
            example.entryId &&
            example.japanese &&
            example.english &&
            !processedPairs.has(createSentencePairKey(example.japanese, example.english))
        )

        if (validChunk.length > 0) {
          await tx.insert(examples).values(validChunk).onConflictDoNothing()

          // Add to processed pairs after successful insert
          validChunk.forEach((example) => {
            processedPairs.add(createSentencePairKey(example.japanese, example.english))
          })
        }
      }
    })
  } catch (error) {
    console.error('Error inserting examples batch:', error)

    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying batch insert (attempt ${retryCount + 1}/${MAX_RETRIES})...`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      return insertExamplesBatch(exampleValues, retryCount + 1)
    }

    throw error
  }
}

// Also, let's optimize findMatchingEntries to avoid loading all entries repeatedly
const entryCache = new Map<string, Array<{ id: string; kanji: string; reading: string }>>()

// Modified processExamples with early duplicate filtering and better batching
async function processExamples() {
  console.log('Processing Tatoeba examples...')

  // Use a Set for O(1) lookup of processed sentences
  const processedPairs = new Set<string>()
  const processedJapaneseSentences = new Set<string>()

  // First, load dictionary entries (done only once)
  if (entryCache.size === 0) {
    console.log('Loading dictionary entries into cache...')
    const entries = await db
      .select({
        id: dictionaryEntries.id,
        kanji: dictionaryEntries.kanji,
        reading: dictionaryEntries.reading,
      })
      .from(dictionaryEntries)

    entryCache.set('entries', entries)
    console.log(`Cached ${entries.length} dictionary entries`)
  }

  // Create an index of sentences and their translations
  console.log('Building sentence index...')
  const japaneseToEnglish = new Map<string, Set<string>>()

  // First pass: collect only Japanese sentences and their English translations
  const sentencesStream = readline.createInterface({
    input: fs.createReadStream(SENTENCES_PATH),
    crlfDelay: Infinity,
  })

  for await (const line of sentencesStream) {
    const [id, lang, text] = line.split('\t')
    if (lang === 'jpn') {
      japaneseToEnglish.set(id, new Set())
    }
  }

  // Second pass: collect links only for Japanese sentences we care about
  console.log('Processing translation links...')
  const linksStream = readline.createInterface({
    input: fs.createReadStream(LINKS_PATH),
    crlfDelay: Infinity,
  })

  for await (const line of linksStream) {
    const [jpId, engId] = line.split('\t')
    if (japaneseToEnglish.has(jpId)) {
      japaneseToEnglish.get(jpId)?.add(engId)
    }
  }

  // Process in larger batches
  const BATCH_SIZE = 10000
  const exampleValues: Array<{
    entryId: string
    japanese: string
    english: string
  }> = []
  let processedExamples = 0

  // Process sentences in batches
  console.log('Processing sentences and creating examples...')
  const entries = entryCache.get('entries') || []

  for (const [jpId, engIds] of japaneseToEnglish) {
    const jpSentence = await getSentence(jpId)
    if (!jpSentence || processedJapaneseSentences.has(jpSentence.text)) {
      continue
    }

    processedJapaneseSentences.add(jpSentence.text)

    // Find matching entries first
    const matchedEntries = findMatchingEntriesSync(jpSentence.text, entries)
    if (matchedEntries.length === 0) {
      continue
    }

    // Then process translations
    for (const engId of engIds) {
      const engSentence = await getSentence(engId)
      if (!engSentence || engSentence.lang !== 'eng') {
        continue
      }

      const pairKey = createSentencePairKey(jpSentence.text, engSentence.text)
      if (processedPairs.has(pairKey)) {
        continue
      }

      processedPairs.add(pairKey)

      // Add examples for all matched entries
      for (const entryId of matchedEntries) {
        exampleValues.push({
          entryId,
          japanese: jpSentence.text,
          english: engSentence.text,
        })

        if (exampleValues.length >= BATCH_SIZE) {
          await insertExamplesBatch(exampleValues)
          processedExamples += exampleValues.length
          console.log(`Inserted ${processedExamples} examples`)
          exampleValues.length = 0
        }
      }
    }
  }

  // Insert remaining examples
  if (exampleValues.length > 0) {
    await insertExamplesBatch(exampleValues)
    processedExamples += exampleValues.length
  }

  console.log(`Completed processing ${processedExamples} total examples`)
}

// Synchronous version of findMatchingEntries for better performance
function findMatchingEntriesSync(
  japaneseSentence: string,
  entries: Array<{ id: string; kanji: string; reading: string }>
): string[] {
  const matchedEntryIds: string[] = []

  for (const entry of entries) {
    const kanjiWords = entry.kanji.split('|')
    const readingWords = entry.reading.split('|')

    if (
      kanjiWords.some((word) => japaneseSentence.includes(word)) ||
      readingWords.some((word) => japaneseSentence.includes(word))
    ) {
      matchedEntryIds.push(entry.id)
    }
  }

  return matchedEntryIds
}

// Helper function to get sentence by ID (with caching)
const sentenceCache = new Map<string, TatoebaSentence>()
async function getSentence(id: string): Promise<TatoebaSentence | null> {
  if (sentenceCache.has(id)) {
    return sentenceCache.get(id)!
  }

  const sentencesStream = readline.createInterface({
    input: fs.createReadStream(SENTENCES_PATH),
    crlfDelay: Infinity,
  })

  for await (const line of sentencesStream) {
    const [sentenceId, lang, text] = line.split('\t')
    if (sentenceId === id) {
      const sentence = { id: sentenceId, lang, text }
      sentenceCache.set(id, sentence)
      return sentence
    }
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

// Also update your main function to clear tables first:
async function main() {
  startTime = Date.now()
  try {
    console.log('Starting dictionary import...')

    console.log('Clearing existing tables...')
    await clearTables()

    console.log('Downloading Tatoeba...')
    await downloadTatoebaFiles()

    // Then process Tatoeba examples
    console.log('Processing Tatoeba examples...')
    await processExamples()

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\nDictionary import completed successfully in ${totalTime} seconds`)
  } catch (error) {
    console.error('Error importing dictionary:', error)
    exit(1)
  } finally {
    await cleanup()
  }
}

main()
