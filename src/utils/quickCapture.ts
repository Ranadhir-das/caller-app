/**
 * Extraction, normalization and association utilities for Vaani Quick Capture.
 * Extracts candidate Indian mobile numbers and associated student names
 * from arbitrary OCR text, structured OCR layout (blocks/lines/bounding boxes),
 * or manual entry.
 */

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface OcrElement {
  text: string;
  boundingBox?: BoundingBox;
  confidence?: number;
}

export interface OcrLine {
  text: string;
  boundingBox?: BoundingBox;
  elements?: OcrElement[];
  confidence?: number;
}

export interface OcrBlock {
  text: string;
  boundingBox?: BoundingBox;
  lines?: OcrLine[];
}

export interface OcrDetailsResult {
  text: string;
  blocks?: OcrBlock[];
}

export interface CandidateLead {
  phone: string; // Exactly 10 digits
  original: string; // The raw matched string from OCR or input
  occurrences: number; // How many times it appeared in the OCR text
  name?: string; // Plausible person name extracted from screenshot
  needsReview?: boolean; // Whether name association or extraction is ambiguous
  confidence?: number; // Optional OCR engine confidence score if provided
}

// Preserve CandidatePhone as alias for full backward compatibility
export type CandidatePhone = CandidateLead;

export interface ExtractionResult {
  candidates: CandidateLead[];
  rawMatchesCount: number;
  uniqueCount: number;
}

/**
 * Normalizes a raw string to an Indian 10-digit mobile number if valid.
 *
 * Rules:
 * 1. Must be a mobile number starting with 6, 7, 8, or 9.
 * 2. Country code +91 or 91 (for 12 digits) is stripped only if the remaining 10 digits pass.
 * 3. 10-digit number starting with 91 (e.g. 9123456789) is retained as 10 digits.
 * 4. Strips spaces, hyphens, parentheses, commas, semicolons, brackets.
 * 5. Rejects invalid lengths/prefixes without truncating digits.
 */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let cleaned = String(raw).trim();
  if (!cleaned) return null;

  // Strip brackets, braces, commas, semicolons
  cleaned = cleaned.replace(/[{}\[\];,\'\"]/g, '').trim();
  // Strip whitespace, hyphens, parentheses
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, '');

  if (!cleaned) return null;

  // Disallow non-digit characters other than leading +
  if (/[^\d+]/.test(cleaned)) return null;

  if (cleaned.startsWith('+')) {
    if (cleaned.startsWith('+91')) {
      const rest = cleaned.slice(3);
      if (/^[6-9]\d{9}$/.test(rest)) {
        return rest;
      }
    }
    return null;
  }

  if (cleaned.includes('+')) return null;

  const len = cleaned.length;

  // Exact 10 digits starting with 6-9
  if (len === 10) {
    if (/^[6-9]\d{9}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  // 12 digits starting with 91 followed by valid 10 digits
  if (len === 12 && cleaned.startsWith('91')) {
    const rest = cleaned.slice(2);
    if (/^[6-9]\d{9}$/.test(rest)) {
      return rest;
    }
    return null;
  }

  return null;
}

// Regex to identify phone numbers in text streams
const PHONE_PATTERN = /(?<![\d+])(?:\+?91[ \t\-.]*)?(?:[6-9]\d{1,4}[ \t\-.]?\d{2,4}[ \t\-.]?\d{2,5})(?!\d)/g;

/**
 * Words and phrases that should NEVER be accepted as a student's person name.
 * Filter obvious non-name text such as headings, course names, phone labels,
 * dates, addresses, UI words, generic roles, and status keywords.
 */
const FORBIDDEN_WORDS = new Set([
  // Phone & communication labels
  'mobile', 'phone', 'telephone', 'tel', 'cell', 'work', 'home', 'sim', 'sim1', 'sim2',
  'whatsapp', 'call', 'caller', 'dialer', 'contact', 'contacts', 'phone number', 'mobile number',

  // Call status, history & chat labels
  'incoming', 'outgoing', 'missed', 'rejected', 'cancelled', 'canceled', 'unanswered',
  'voice call', 'video call', 'audio call', 'conference call', 'call details', 'call history',
  'call log', 'call logs', 'recent calls', 'recents', 'missed call', 'incoming call', 'outgoing call',
  'yesterday', 'today', 'tomorrow', 'last seen', 'online', 'offline', 'typing', 'recording',
  'delivered', 'read', 'sent', 'view once', 'forwarded', 'message', 'messages', 'chat', 'chats',
  'new chat', 'group', 'status', 'photo', 'video', 'audio', 'document', 'sticker',

  // Relative time & duration
  'min ago', 'mins ago', 'hour ago', 'hours ago', 'sec ago', 'secs ago', 'minutes ago', 'seconds ago',
  'duration',

  // Days and months
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'am', 'pm',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
  'october', 'november', 'december',

  // UI headers, navigation & system terms
  'keypad', 'voicemail', 'favorites', 'favourites', 'add to contacts', 'create new contact',
  'edit contact', 'share contact', 'cancel', 'done', 'ok', 'save', 'back', 'next', 'submit',
  'details', 'info', 'more', 'settings', 'profile', 'battery', 'wifi', 'lte', '4g', '5g',
  'volte', 'screenshot', 'gallery', 'photos', 'files', 'search', 'edit', 'delete', 'remove',
  'block', 'unblock', 'mute', 'clear chat',

  // Course names & academic terms
  'mbbs', 'bds', 'btech', 'b.tech', 'b tech', 'be', 'b.e', 'bsc', 'b.sc', 'bsc nursing',
  'gnm', 'gnm nursing', 'pharmacy', 'b.pharm', 'd.pharm', 'mba', 'md', 'ms', 'md/ms', 'md / ms',
  'neet', 'neet ug', 'neet pg', 'jee', 'cet', 'admission', 'admissions', 'counselling',
  'counseling', 'quota', 'management quota', 'nri', 'rank', 'score', 'marks', 'seat', 'seats',
  'intake', 'college', 'university', 'institute', 'school', 'fees', 'fee', 'batch', 'branch',
  'degree', 'diploma', 'engineering', 'medical', 'management', 'others',

  // Generic roles & placeholders
  'student', 'student name', 'candidate', 'candidate name', 'counselor', 'counsellor',
  'telecaller', 'admin', 'agent', 'user', 'unknown', 'null', 'undefined', 'none', 'test', 'demo',

  // Addresses, States & Indian Cities (when standalone)
  'india', 'karnataka', 'maharashtra', 'tamil nadu', 'kerala', 'delhi', 'mumbai',
  'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'pune', 'jaipur',
  'lucknow', 'patna', 'bhopal', 'ranchi', 'chandigarh', 'bihar', 'uttar pradesh',
  'madhya pradesh', 'rajasthan', 'gujarat', 'west bengal', 'odisha', 'punjab', 'haryana',
  'address', 'location', 'city', 'state', 'pincode', 'pin code',
]);

/**
 * Validates and normalizes bounding box coordinates.
 * Returns undefined for malformed or non-geometric coordinates.
 */
export function normalizeBoundingBox(box?: Partial<BoundingBox> | null): BoundingBox | undefined {
  if (!box || typeof box !== 'object') return undefined;
  const left = Number(box.left);
  const top = Number(box.top);
  const right = Number(box.right);
  const bottom = Number(box.bottom);
  if (isNaN(left) || isNaN(top) || isNaN(right) || isNaN(bottom)) return undefined;

  const width = typeof box.width === 'number' && !isNaN(box.width) && box.width > 0 ? box.width : Math.max(0, right - left);
  const height = typeof box.height === 'number' && !isNaN(box.height) && box.height > 0 ? box.height : Math.max(0, bottom - top);

  if (width <= 0 || height <= 0) return undefined;
  return { left, top, right, bottom, width, height };
}

/**
 * Cleans potential person name text by removing phone numbers, labeling prefixes,
 * bullet points, and surrounding non-alphabetic noise.
 */
export function cleanPotentialName(raw: string | null | undefined, phoneToStrip?: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let cleaned = raw.trim();
  if (!cleaned) return '';

  // 1. If specific phone is provided or matched, remove it
  if (phoneToStrip) {
    const escaped = phoneToStrip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`(?:\\+?91[\\s\\-\\.]*)?${escaped}`, 'g'), '');
  }

  // Also strip any other 10-digit or +91 pattern remaining in the string
  cleaned = cleaned.replace(PHONE_PATTERN, '');

  // 2. Strip common prefix patterns like "Name:", "Student Name:", "Candidate:", "WhatsApp Chat with "
  cleaned = cleaned.replace(/^\s*(?:whatsapp\s*chat\s*(?:with)?)\s*[:\-]?\s*/i, '');
  cleaned = cleaned.replace(/^\s*(?:student\s*name|candidate\s*name|student|candidate|lead|name|contact|from|to)\s*[:\-]\s*/i, '');

  // 3. Strip leading course prefix like "MBBS - " or "NEET: "
  cleaned = cleaned.replace(/^\s*(?:mbbs|bds|btech|b\.tech|bsc|b\.sc|gnm|pharmacy|mba|md|ms|neet)\s*[:\-–—]\s*/i, '');

  // 4. Strip numbering or bullet prefixes: "1.", "1)", "1 -", "• ", "* "
  cleaned = cleaned.replace(/^\s*(?:\d+[\.\)\-:]|\*|\-|•|~)\s*/, '');

  // 5. Strip trailing course notes or brackets: "(MBBS)", "- MBBS", "MBBS", "(Student)"
  cleaned = cleaned.replace(/\s*(?:[\-–—\(\[\{/:]\s*)?(?:mbbs|bds|btech|b\.tech|bsc|b\.sc|gnm|pharmacy|mba|md|ms|others?|neet|student|candidate)\s*(?:[\)\]\}])?\s*$/i, '');

  // 6. Strip surrounding punctuation and brackets
  cleaned = cleaned.replace(/^[\s\(\)\[\]\{\}\-:\,\;\"\'\~|/]+|[\s\(\)\[\]\{\}\-:\,\;\"\'\~|/]+$/g, '').trim();

  // 7. Collapse internal whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
}

/**
 * Validates whether a cleaned string represents a plausible person name.
 * Supports English and common Indian names across Indian scripts.
 */
export function isPlausiblePersonName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;

  const trimmed = name.trim();
  if (!trimmed) return false;

  // Length constraints
  if (trimmed.length < 2 || trimmed.length > 45) return false;

  // Disallow numbers / digits inside person names
  if (/\d/.test(trimmed)) return false;

  // Must contain at least two letters (Latin or Indic scripts)
  // \u0900-\u0D7F covers Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam
  const letterMatches = trimmed.match(/[a-zA-Z\u0900-\u0D7F]/g);
  if (!letterMatches || letterMatches.length < 2) return false;

  // Disallow characters outside letters, spaces, dots (initials), hyphens, and apostrophes
  if (!/^[a-zA-Z\u0900-\u0D7F\s\.\'\-]+$/.test(trimmed)) return false;

  // Word count: Between 1 and 5 words
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;

  const lower = trimmed.toLowerCase();

  // Direct blacklist check
  if (FORBIDDEN_WORDS.has(lower)) return false;

  // Check if every single word in the name is a forbidden keyword
  const allWordsForbidden = words.every((w) => {
    const cleanWord = w.toLowerCase().replace(/[\.\'\-]/g, '');
    return FORBIDDEN_WORDS.has(cleanWord);
  });
  if (allWordsForbidden) return false;

  // Conversational words check (e.g. "Call me please", "Hi regarding admission")
  const conversationalTerms = [
    'call me', 'please', 'regarding', 'admission', 'interested', 'thanks', 'thank you',
    'hello', 'sir', 'madam', 'details', 'urgent', 'available', 'fees structure',
  ];
  if (conversationalTerms.some((term) => lower.includes(term))) {
    return false;
  }

  // Reject single words that are too short without being known initials
  if (words.length === 1 && trimmed.length < 3 && !/^[A-Z]\.?$/i.test(trimmed)) {
    return false;
  }

  return true;
}

interface ParsedLine {
  text: string;
  lineIndex: number;
  boundingBox?: BoundingBox;
  confidence?: number;
  phoneMatches: {
    phone: string;
    raw: string;
    startIndex: number;
    endIndex: number;
  }[];
  nonPhoneText: string;
}

/**
 * Enhanced extraction pipeline: extracts candidate phone numbers and
 * associates student names using line & bounding-box spatial geometry.
 *
 * Can accept raw OCR text string OR structured OCR result (blocks/lines with bounding boxes).
 */
export function extractLeadCandidates(ocrInput: string | OcrDetailsResult | null | undefined): ExtractionResult {
  if (!ocrInput) {
    return { candidates: [], rawMatchesCount: 0, uniqueCount: 0 };
  }

  let text = '';
  let blocks: OcrBlock[] = [];

  if (typeof ocrInput === 'string') {
    text = ocrInput;
  } else if (typeof ocrInput === 'object') {
    text = ocrInput.text || '';
    blocks = ocrInput.blocks || [];
  }

  if (!text || typeof text !== 'string') {
    return { candidates: [], rawMatchesCount: 0, uniqueCount: 0 };
  }

  // 1. Collect all OCR lines with optional geometry
  const parsedLines: ParsedLine[] = [];
  let lineCounter = 0;

  if (blocks.length > 0) {
    for (const block of blocks) {
      if (block.lines && block.lines.length > 0) {
        for (const line of block.lines) {
          const lineText = line.text || '';
          parsedLines.push({
            text: lineText,
            lineIndex: lineCounter++,
            boundingBox: normalizeBoundingBox(line.boundingBox),
            confidence: line.confidence,
            phoneMatches: [],
            nonPhoneText: lineText,
          });
        }
      } else if (block.text) {
        // Fallback for blocks without line breakdowns
        const subLines = block.text.split(/\r?\n/);
        for (const sl of subLines) {
          parsedLines.push({
            text: sl,
            lineIndex: lineCounter++,
            boundingBox: normalizeBoundingBox(block.boundingBox),
            phoneMatches: [],
            nonPhoneText: sl,
          });
        }
      }
    }
  }

  // If no lines found via blocks, split raw text by lines
  if (parsedLines.length === 0) {
    const rawLines = text.split(/\r?\n/);
    for (const rl of rawLines) {
      parsedLines.push({
        text: rl,
        lineIndex: lineCounter++,
        phoneMatches: [],
        nonPhoneText: rl,
      });
    }
  }

  // 2. Identify phone numbers in each line and across the entire text
  const phoneToLinesMap = new Map<string, ParsedLine[]>();
  const candidateOccurrences = new Map<string, { original: string; count: number; confidence?: number }>();
  let rawMatchesCount = 0;

  for (const pLine of parsedLines) {
    const matches = Array.from(pLine.text.matchAll(PHONE_PATTERN));
    let remainingText = pLine.text;

    for (const rawMatch of matches) {
      const prefix = pLine.text.slice(0, rawMatch.index);
      if (/\+\d{1,3}[ \t\-.]*$/.test(prefix)) continue; // ignore foreign country code

      const matchStr = rawMatch[0];
      const normalized = normalizeIndianMobile(matchStr);
      if (normalized) {
        rawMatchesCount++;
        const matchStart = rawMatch.index ?? 0;
        const matchEnd = matchStart + matchStr.length;

        pLine.phoneMatches.push({
          phone: normalized,
          raw: matchStr,
          startIndex: matchStart,
          endIndex: matchEnd,
        });

        // Blank out this phone from remaining line text
        remainingText = remainingText.slice(0, matchStart) + ' '.repeat(matchStr.length) + remainingText.slice(matchEnd);

        // Record line association
        const existingLines = phoneToLinesMap.get(normalized) || [];
        existingLines.push(pLine);
        phoneToLinesMap.set(normalized, existingLines);

        // Track global count
        const existingOcc = candidateOccurrences.get(normalized);
        if (existingOcc) {
          existingOcc.count++;
        } else {
          candidateOccurrences.set(normalized, {
            original: matchStr.trim(),
            count: 1,
            confidence: pLine.confidence,
          });
        }
      }
    }

    // Line-level fallback for standalone 10-digit number lines
    const trimmedLine = pLine.text.trim();
    if (trimmedLine.length >= 10 && trimmedLine.length <= 25 && pLine.phoneMatches.length === 0) {
      const normalized = normalizeIndianMobile(trimmedLine);
      if (normalized) {
        rawMatchesCount++;
        pLine.phoneMatches.push({
          phone: normalized,
          raw: trimmedLine,
          startIndex: 0,
          endIndex: pLine.text.length,
        });
        remainingText = '';

        const existingLines = phoneToLinesMap.get(normalized) || [];
        existingLines.push(pLine);
        phoneToLinesMap.set(normalized, existingLines);

        if (!candidateOccurrences.has(normalized)) {
          candidateOccurrences.set(normalized, {
            original: trimmedLine,
            count: 1,
            confidence: pLine.confidence,
          });
        }
      }
    }

    pLine.nonPhoneText = remainingText.trim();
  }

  // 3. Associate student names with each detected phone number
  const candidates: CandidateLead[] = [];
  const assignedLineIndices = new Set<number>();
  const assignedNames = new Set<string>();

  // Process each distinct phone candidate
  for (const [phone, occ] of candidateOccurrences.entries()) {
    const linesWithPhone = phoneToLinesMap.get(phone) || [];
    let detectedName: string | undefined;
    let needsReview = false;

    // --- STRATEGY 1: SAME LINE EXTRACTION (Highest Priority) ---
    for (const pLine of linesWithPhone) {
      if (pLine.nonPhoneText) {
        const cleaned = cleanPotentialName(pLine.nonPhoneText, phone);
        if (isPlausiblePersonName(cleaned)) {
          detectedName = cleaned;
          needsReview = false;
          assignedLineIndices.add(pLine.lineIndex);
          break;
        }
      }
    }

    // --- STRATEGY 2: TABLE / MULTI-COLUMN ROW ASSOCIATION ---
    // If name wasn't on the same line, check if another line is in the same horizontal table row
    if (!detectedName && linesWithPhone.length > 0) {
      for (const pLine of linesWithPhone) {
        const phoneBox = pLine.boundingBox;
        if (!phoneBox) continue;

        let bestRowCandidate: { name: string; lineIndex: number; distance: number; isLeft: boolean } | null = null;

        for (const otherLine of parsedLines) {
          if (otherLine.lineIndex === pLine.lineIndex) continue;
          if (assignedLineIndices.has(otherLine.lineIndex)) continue;
          if (otherLine.phoneMatches.length > 0) continue; // don't steal another phone line
          const otherBox = otherLine.boundingBox;
          if (!otherBox) continue;

          // Check vertical alignment (same row overlap)
          const verticalOverlap = Math.min(otherBox.bottom, phoneBox.bottom) - Math.max(otherBox.top, phoneBox.top);
          const minHeight = Math.min(otherBox.height, phoneBox.height);

          // Overlap of at least 45% indicates the same horizontal row/cell
          if (verticalOverlap >= 0.45 * minHeight) {
            const cleaned = cleanPotentialName(otherLine.text);
            if (isPlausiblePersonName(cleaned)) {
              const isLeft = otherBox.right <= phoneBox.left + 25;
              const distance = Math.abs(phoneBox.left - otherBox.right);

              // Prefer column to the left of the phone column (reading order [Name | Phone])
              if (!bestRowCandidate || (isLeft && !bestRowCandidate.isLeft) || (distance < bestRowCandidate.distance)) {
                bestRowCandidate = {
                  name: cleaned,
                  lineIndex: otherLine.lineIndex,
                  distance,
                  isLeft,
                };
              }
            }
          }
        }

        if (bestRowCandidate) {
          detectedName = bestRowCandidate.name;
          needsReview = !bestRowCandidate.isLeft; // flag review if layout was inverted [Phone | Name]
          assignedLineIndices.add(bestRowCandidate.lineIndex);
          break;
        }
      }
    }

    // --- STRATEGY 3: DIRECT LINE ABOVE (Contact List / Card Layout) ---
    if (!detectedName && linesWithPhone.length > 0) {
      for (const pLine of linesWithPhone) {
        const phoneBox = pLine.boundingBox;

        if (phoneBox) {
          // Geometry-guided scan above
          let bestAboveCandidate: { name: string; lineIndex: number; gap: number } | null = null;

          for (const otherLine of parsedLines) {
            if (otherLine.lineIndex === pLine.lineIndex) continue;
            if (assignedLineIndices.has(otherLine.lineIndex)) continue;
            if (otherLine.phoneMatches.length > 0) continue;
            const otherBox = otherLine.boundingBox;
            if (!otherBox) continue;

            // Must be above the phone line
            if (otherBox.bottom <= phoneBox.top + 8) {
              const gap = phoneBox.top - otherBox.bottom;
              const maxHeight = Math.max(phoneBox.height, 20);

              // Must be reasonably close (within 2.5 lines)
              if (gap <= 2.5 * maxHeight) {
                // Must be horizontally aligned (overlapping or aligned left edges)
                const xOverlap = Math.min(otherBox.right, phoneBox.right) - Math.max(otherBox.left, phoneBox.left);
                const leftDiff = Math.abs(otherBox.left - phoneBox.left);
                const maxWidth = Math.max(phoneBox.width, otherBox.width);

                if (xOverlap > 0 || leftDiff <= maxWidth * 0.8) {
                  const cleaned = cleanPotentialName(otherLine.text);
                  if (isPlausiblePersonName(cleaned)) {
                    if (!bestAboveCandidate || gap < bestAboveCandidate.gap) {
                      bestAboveCandidate = {
                        name: cleaned,
                        lineIndex: otherLine.lineIndex,
                        gap,
                      };
                    }
                  }
                }
              }
            }
          }

          if (bestAboveCandidate) {
            detectedName = bestAboveCandidate.name;
            needsReview = bestAboveCandidate.gap > 1.8 * Math.max(phoneBox.height, 20);
            assignedLineIndices.add(bestAboveCandidate.lineIndex);
            break;
          }
        } else {
          // Plain-text index fallback: look at immediately preceding line (index - 1)
          const prevIdx = pLine.lineIndex - 1;
          if (prevIdx >= 0 && !assignedLineIndices.has(prevIdx)) {
            const prevLine = parsedLines.find((l) => l.lineIndex === prevIdx);
            if (prevLine && prevLine.phoneMatches.length === 0) {
              const cleaned = cleanPotentialName(prevLine.text);
              if (isPlausiblePersonName(cleaned)) {
                detectedName = cleaned;
                needsReview = false;
                assignedLineIndices.add(prevIdx);
                break;
              }
            }
          }
        }
      }
    }

    // --- STRATEGY 4: DIRECT LINE BELOW (Fallback) ---
    if (!detectedName && linesWithPhone.length > 0) {
      for (const pLine of linesWithPhone) {
        const phoneBox = pLine.boundingBox;

        if (phoneBox) {
          let bestBelowCandidate: { name: string; lineIndex: number; gap: number } | null = null;

          for (const otherLine of parsedLines) {
            if (otherLine.lineIndex === pLine.lineIndex) continue;
            if (assignedLineIndices.has(otherLine.lineIndex)) continue;
            if (otherLine.phoneMatches.length > 0) continue;
            const otherBox = otherLine.boundingBox;
            if (!otherBox) continue;

            if (otherBox.top >= phoneBox.bottom - 8) {
              const gap = otherBox.top - phoneBox.bottom;
              const maxHeight = Math.max(phoneBox.height, 20);

              if (gap <= 2.2 * maxHeight) {
                const xOverlap = Math.min(otherBox.right, phoneBox.right) - Math.max(otherBox.left, phoneBox.left);
                const leftDiff = Math.abs(otherBox.left - phoneBox.left);
                const maxWidth = Math.max(phoneBox.width, otherBox.width);

                if (xOverlap > 0 || leftDiff <= maxWidth * 0.8) {
                  const cleaned = cleanPotentialName(otherLine.text);
                  if (isPlausiblePersonName(cleaned)) {
                    if (!bestBelowCandidate || gap < bestBelowCandidate.gap) {
                      bestBelowCandidate = {
                        name: cleaned,
                        lineIndex: otherLine.lineIndex,
                        gap,
                      };
                    }
                  }
                }
              }
            }
          }

          if (bestBelowCandidate) {
            detectedName = bestBelowCandidate.name;
            needsReview = true; // Line below is less typical, so flag for user review
            assignedLineIndices.add(bestBelowCandidate.lineIndex);
            break;
          }
        } else {
          // Plain text fallback (index + 1)
          const nextIdx = pLine.lineIndex + 1;
          if (nextIdx < parsedLines.length && !assignedLineIndices.has(nextIdx)) {
            const nextLine = parsedLines.find((l) => l.lineIndex === nextIdx);
            if (nextLine && nextLine.phoneMatches.length === 0) {
              const cleaned = cleanPotentialName(nextLine.text);
              if (isPlausiblePersonName(cleaned)) {
                detectedName = cleaned;
                needsReview = true;
                assignedLineIndices.add(nextIdx);
                break;
              }
            }
          }
        }
      }
    }

    // --- STRATEGY 5: AMBIGUITY & DUPLICATION CHECK ---
    if (detectedName) {
      if (assignedNames.has(detectedName.toLowerCase())) {
        // Same name already claimed by another distinct phone candidate
        needsReview = true;
      }
      assignedNames.add(detectedName.toLowerCase());

      // If single generic word or short initials, flag for review
      const words = detectedName.split(/\s+/).filter(Boolean);
      if (words.length === 1 && detectedName.length <= 4) {
        needsReview = true;
      }
    }

    candidates.push({
      phone,
      original: occ.original,
      occurrences: occ.count,
      name: detectedName,
      needsReview: detectedName ? needsReview : undefined,
      confidence: occ.confidence,
    });
  }

  return {
    candidates,
    rawMatchesCount,
    uniqueCount: candidates.length,
  };
}

/**
 * Backward compatible entry point for phone extraction.
 * Extracts phone numbers and automatically attaches student names if detectable.
 */
export function extractPhoneCandidates(text: string): ExtractionResult {
  return extractLeadCandidates(text);
}

/**
 * Formats a 10-digit mobile number into readable chunks: "98765 43210"
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone || phone.length !== 10) return phone || '';
  return `${phone.slice(0, 5)} ${phone.slice(5)}`;
}

/** Correct a candidate's phone without changing its selection or mutating OCR results. */
export function editPhoneCandidate(
  candidates: CandidateLead[],
  selectedPhones: ReadonlySet<string>,
  oldPhone: string,
  rawPhone: string,
) {
  const phone = normalizeIndianMobile(rawPhone);
  if (!phone) throw new Error('Please enter a valid 10-digit Indian mobile number.');
  if (!candidates.some((candidate) => candidate.phone === oldPhone)) {
    throw new Error('This candidate is no longer available. Please try again.');
  }
  if (phone !== oldPhone && candidates.some((candidate) => candidate.phone === phone)) {
    throw new Error('This number is already in the candidate list.');
  }
  const nextSelected = new Set(selectedPhones);
  if (nextSelected.delete(oldPhone)) nextSelected.add(phone);
  return {
    phone,
    selectedPhones: nextSelected,
    candidates: candidates.map((candidate) =>
      candidate.phone === oldPhone
        ? { ...candidate, phone, occurrences: phone === oldPhone ? candidate.occurrences : 1 }
        : candidate
    ),
  };
}

/** Update or correct a candidate's student name. Clears needsReview once manually edited. */
export function editCandidateName(
  candidates: CandidateLead[],
  phone: string,
  newName: string,
): CandidateLead[] {
  const trimmed = newName.trim();
  return candidates.map((c) =>
    c.phone === phone
      ? {
          ...c,
          name: trimmed || undefined,
          needsReview: false,
        }
      : c
  );
}
