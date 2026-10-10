/** Verdict de l'antivirus sur un contenu. */
export type ScanVerdict = { infected: false } | { infected: true; signature: string };

/** Antivirus (ClamAV via clamd en production ; un faux dans les tests ordinaires). */
export interface VirusScanner {
  scan(content: Buffer): Promise<ScanVerdict>;
}

export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');
