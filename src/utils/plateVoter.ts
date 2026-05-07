/**
 * Accumulates OCR readings per track ID and returns the most-frequent
 * valid reading once we have enough votes.
 */

const MIN_VOTES_TO_CONFIRM = 3;
const MAX_HISTORY = 10;

interface VoteRecord {
  readings: string[];
}

export class PlateVoter {
  private records: Map<string, VoteRecord> = new Map();

  addReading(trackId: string, plate: string | null) {
    if (!plate) return;

    let rec = this.records.get(trackId);
    if (!rec) {
      rec = { readings: [] };
      this.records.set(trackId, rec);
    }

    rec.readings.push(plate);
    if (rec.readings.length > MAX_HISTORY) rec.readings.shift();
  }

  /**
   * Returns the most common reading if it appears ≥ MIN_VOTES_TO_CONFIRM times,
   * otherwise null (not yet confident).
   */
  getConfirmedPlate(trackId: string): string | null {
    const rec = this.records.get(trackId);
    if (!rec || rec.readings.length < MIN_VOTES_TO_CONFIRM) return null;

    const freq = new Map<string, number>();
    for (const r of rec.readings) {
      freq.set(r, (freq.get(r) ?? 0) + 1);
    }

    let best = '';
    let bestCount = 0;
    for (const [plate, count] of freq) {
      if (count > bestCount) { bestCount = count; best = plate; }
    }

    return bestCount >= MIN_VOTES_TO_CONFIRM ? best : null;
  }

  removeTrack(trackId: string) {
    this.records.delete(trackId);
  }

  clear() {
    this.records.clear();
  }
}
