import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBreedFrogs, fetchFrogPairs, fetchChangelog, type TeableRecord } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import FrogInputs from '../components/FrogInputs';
import { useFrogOptions } from '../hooks/useFrogOptions';
import { submitCombo } from '../api/submit';
import { useAuth } from 'react-oidc-context';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FrogFields  extends Record<string, unknown> { fullname?: string }

interface ParentSel { base: ComboOption | null; sec: ComboOption | null; breed: ComboOption | null }
const EMPTY: ParentSel = { base: null, sec: null, breed: null };

type Variant = 'chroma' | 'glass';
const DAY = 1000 * 60 * 60 * 24;
const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const picked = (p: ParentSel) => !!(p.base && p.sec && p.breed);
function fullName(p: ParentSel): string | null {
  return p.base && p.sec && p.breed ? `${p.base.label} ${p.sec.label} ${p.breed.label}` : null;
}
// The options from `all` matching either parent's pick, in `all`'s order.
function fromParents(all: ComboOption[], a: ComboOption | null, b: ComboOption | null): ComboOption[] {
  return all.filter(o => o.id === a?.id || o.id === b?.id);
}
// https:// followed by a host ending in a .tld, optionally with a path/query.
function isUrl(s: string): boolean {
  return /^https:\/\/[^\s/?#]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(s);
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SubmitCombo() {
  const auth = useAuth();
  // No variant until one is picked; the outcome pickers stay locked until then.
  const [variant, setVariant] = useState<Variant | null>(null);
  const [p1, setP1] = useState<ParentSel>(EMPTY);
  const [p2, setP2] = useState<ParentSel>(EMPTY);
  // The mutation changes only one color, so the result and lost frogs share the
  // other two traits. One picker holds the lost frog; the result frog is the
  // same with the mutated color swapped for Glass (base) or Chroma (secondary).
  const [pLost, setPLost] = useState<ParentSel>(EMPTY);
  const [sourceLink, setSourceLink] = useState('');
  // Changelog record id of the game version; '' means the latest.
  const [versionSel, setVersionSel] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  // Object URL for the screenshot preview, swapped (and the old one revoked)
  // together with the file in pickScreenshot.
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Parents are verified first, then locked; the rest of the form is gated on this.
  const [checked, setChecked] = useState(false);
  // Set when the inactive submit button is pressed, to explain what's missing.
  const [attempted, setAttempted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Picker options (small, ETag-cached tables shared with other pages)
  const frogOptions = useFrogOptions();
  const { baseOpts, secOpts, breedOpts } = frogOptions;

  // The single valid choice for each variant's required color on the result frog.
  // Glass requires Base Color = "Glass"; Chroma requires Secondary Color = "Chroma".
  const glassBaseOpt  = useMemo(() => baseOpts.find(o => o.label === 'Glass')  ?? null, [baseOpts]);
  const chromaSecOpt  = useMemo(() => secOpts.find(o => o.label === 'Chroma')  ?? null, [secOpts]);

  // Offspring traits come from the parents, so the outcome pickers only offer
  // the parents' values (filtered from the full lists to keep their sort order).
  // That includes the mutated color's picker, which holds the lost frog's color.
  const parentBaseOpts  = useMemo(() => fromParents(baseOpts,  p1.base,  p2.base),  [baseOpts,  p1.base,  p2.base]);
  const parentSecOpts   = useMemo(() => fromParents(secOpts,   p1.sec,   p2.sec),   [secOpts,   p1.sec,   p2.sec]);
  const parentBreedOpts = useMemo(() => fromParents(breedOpts, p1.breed, p2.breed), [breedOpts, p1.breed, p2.breed]);

  const pResult = useMemo<ParentSel>(
    () => variant === 'glass'  ? { ...pLost, base: glassBaseOpt }
        : variant === 'chroma' ? { ...pLost, sec:  chromaSecOpt }
        : EMPTY,
    [variant, pLost, glassBaseOpt, chromaSecOpt],
  );

  // Resolve each picked frog via its breed's frogs (shared 24h cache, deduped).
  // The result and lost frogs share a breed, so one query covers both.
  const q1 = useQuery({ queryKey: ['breed-frogs', p1.breed?.id],    queryFn: () => fetchBreedFrogs<FrogFields>(p1.breed!.id),    enabled: !!p1.breed,    staleTime: DAY });
  const q2 = useQuery({ queryKey: ['breed-frogs', p2.breed?.id],    queryFn: () => fetchBreedFrogs<FrogFields>(p2.breed!.id),    enabled: !!p2.breed,    staleTime: DAY });
  const qO = useQuery({ queryKey: ['breed-frogs', pLost.breed?.id], queryFn: () => fetchBreedFrogs<FrogFields>(pLost.breed!.id), enabled: !!pLost.breed, staleTime: DAY });

  const index = useMemo(() => {
    const m = new Map<string, TeableRecord<FrogFields>>();
    for (const f of [...(q1.data ?? []), ...(q2.data ?? []), ...(qO.data ?? [])]) {
      if (f.fields.fullname) m.set(f.fields.fullname, f);
    }
    return m;
  }, [q1.data, q2.data, qO.data]);

  const resolve = (p: ParentSel) => (picked(p) ? index.get(fullName(p)!) ?? null : null);
  const frog1 = useMemo(() => resolve(p1),      [p1, index]);
  const frog2 = useMemo(() => resolve(p2),      [p2, index]);
  const frogR = useMemo(() => resolve(pResult), [pResult, index]);
  const frogL = useMemo(() => resolve(pLost),   [pLost, index]);

  const resolving =
    (!!p1.breed && q1.isFetching) || (!!p2.breed && q2.isFetching) ||
    (!!pLost.breed && qO.isFetching);

  // A fully-picked frog that doesn't resolve to a record can't be submitted.
  const unknownFrog = !resolving && (
    (picked(p1) && !frog1) || (picked(p2) && !frog2) ||
    (picked(pResult) && !frogR) || (picked(pLost) && !frogL)
  );

  const sourceTrim = sourceLink.trim();
  const sourceValid = sourceTrim === '' || isUrl(sourceTrim);

  // Existing pairs, to catch verified ones before submitting.
  const { data: pairs } = useQuery({ queryKey: ['pairs'], queryFn: fetchFrogPairs });

  // The recorded parent pair, if any (stored in either order).
  const existingPair = useMemo(() => {
    if (!frog1 || !frog2) return null;
    const a = frog1.id, b = frog2.id;
    return (pairs ?? []).find(p =>
      (p.frogAId === a && p.frogBId === b) || (p.frogAId === b && p.frogBId === a),
    ) ?? null;
  }, [frog1, frog2, pairs]);
  // Game versions, newest first (one entry per version string).
  const { data: changelog } = useQuery({ queryKey: ['changelog'], queryFn: fetchChangelog });
  const versions = useMemo(() => {
    const seen = new Set<string>();
    return (changelog ?? []).filter(c => !seen.has(c.version) && !!seen.add(c.version));
  }, [changelog]);
  const version = versions.find(v => v.id === versionSel) ?? versions[0] ?? null;

  // ── Phase 1: confirm the parent pair before unlocking the rest ─────────────
  // Any base/secondary/breed selection resolves to a real frog (the pickers are
  // referential), and breeding a frog with itself is valid — so the only blocker
  // is the pair already being verified (its data is taken as accurate). An
  // unverified pair is missing data or flagged as wrong, so a submission for it
  // overwrites what's there.
  const combosLoaded = !!pairs;
  const pairVerified = !!existingPair?.verified;
  const canProceed = picked(p1) && picked(p2) && !!frog1 && !!frog2 && combosLoaded && !pairVerified;

  // The proceed button reflects the live state of the parent pairing.
  const proceedLabel =
    (!picked(p1) || !picked(p2)) ? 'Complete both parent frogs'
    : (!frog1 || !frog2 || !combosLoaded) ? 'Checking…'
    : pairVerified ? 'Pair already verified'
    : 'Proceed →';

  // ── Phase 2: the rest of the submission (only after a successful check) ─────
  // pResult is only complete once a variant is picked and its color exists.
  const resultReady =
    picked(pResult) && !!frogR &&
    picked(pLost) && !!frogL &&
    !resolving && !unknownFrog && sourceValid && !!screenshot;
  const canSubmit = checked && resultReady && !submitting;

  // Explains a blocked submit, first missing thing first.
  const missingMessage =
    !variant ? 'Choose Glass or Chroma'
    : !picked(pLost) ? 'Complete the mutation outcome'
    : unknownFrog ? 'That mutation outcome isn’t a known frog'
    : !screenshot ? 'A screenshot is required'
    : 'Still checking the frogs…';

  // Swaps the screenshot and its preview URL, releasing the previous URL.
  function pickScreenshot(file: File | null) {
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    setScreenshot(file);
    setScreenshotUrl(file ? URL.createObjectURL(file) : null);
  }

  // A picked or dropped file. Nothing (a cancelled picker) keeps the current one.
  function acceptScreenshot(file: File | null) {
    if (!file) return;
    if (!SCREENSHOT_TYPES.includes(file.type)) {
      if (fileRef.current) fileRef.current.value = '';
      pickScreenshot(null);
      setFileError('Only PNG, JPEG, WebP, or GIF images are allowed.');
    } else {
      pickScreenshot(file);
      setFileError(null);
    }
  }

  async function handleSubmit() {
    if (!canSubmit || !frog1 || !frog2 || !frogR || !variant) return;
    setSubmitting(true);
    setResult(null);
    try {
      await submitCombo(
        {
          variant,
          frog1Id: frog1.id, frog2Id: frog2.id,
          frog1Name: fullName(p1)!, frog2Name: fullName(p2)!,
          resultFrogId: frogR.id, resultFrogName: fullName(pResult)!,
          lostFrogId: frogL?.id, lostFrogName: frogL ? fullName(pLost)! : undefined,
          sourceLink: sourceTrim || undefined,
          versionName: version?.version,
        },
        screenshot,
        auth.user?.id_token,
      );
      setResult({ ok: true, message: 'Thanks! Your submission was received and is pending review.' });
      setTimeout(() => setResult(null), 3000);
      setP1(EMPTY); setP2(EMPTY); setPLost(EMPTY); setVariant(null);
      setSourceLink(''); setVersionSel(''); pickScreenshot(null); setFileError(null); setChecked(false); setAttempted(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  }

  // A field with only one possible value (parents share it) is pre-set.
  const only = (opts: ComboOption[]) => (opts.length === 1 ? opts[0] : null);

  // Lock in the verified parents and reveal the rest of the form, starting the
  // outcome from the parents (any trait they share is pre-set).
  function handleProceed() {
    if (!canProceed) return;
    setPLost({ base: only(parentBaseOpts), sec: only(parentSecOpts), breed: only(parentBreedOpts) });
    setChecked(true);
    setResult(null);
  }

  // Unlock the parents to correct an input error (re-check required to proceed).
  // Everything after the parents is cleared: the outcome depends on them, and
  // nothing entered for the old pair should carry into a new submission.
  function handleUnlock() {
    setVariant(null); setPLost(EMPTY);
    setSourceLink(''); setVersionSel(''); pickScreenshot(null); setFileError(null);
    if (fileRef.current) fileRef.current.value = '';
    setChecked(false);
    setAttempted(false);
    setResult(null);
  }

  return (
    <div>
      <h1>Glass/Chroma Submissions</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        If you've discovered a Glass or Chroma breeding mutation, submit that combination here.
        The page will check against the database once both parents are entered.
        If there isn't an existing match, you can complete the rest of the form to submit.
        All submissions are reviewed manually before being pushed into the database.
        If you would like credit for your submisisons, make sure you're logged in under the site settings.
      </p>

      {!checked ? (
        <>
          <div className="breeding-parents">
            <FrogInputs title="Parent Frog 1" sel={p1} onChange={setP1} options={frogOptions} />
            <FrogInputs title="Parent Frog 2" sel={p2} onChange={setP2} options={frogOptions} />
          </div>

          <div className="submit-actions">
            <button className="submit-btn" type="button" disabled={!canProceed} onClick={handleProceed}>
              {proceedLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="locked-parents">
            <div className="locked-parents-info">
              <span className="locked-parents-label">Parent pairing</span>
              <span className="locked-parents-names"><strong>{fullName(p1)}</strong> + <strong>{fullName(p2)}</strong></span>
            </div>
            <button className="csv-btn" type="button" onClick={handleUnlock}>Edit parents</button>
          </div>
          {existingPair && (
            <p className="search-hint">
              This pair is recorded but unverified — your submission will replace its existing data.
            </p>
          )}

          <div className="breeding-parents">
            <div className="parent-group outcome-group">
              <div className="parent-title-row">
                <h2 className="parent-title">Mutation Outcome</h2>
                <div className="settings-row type-toggle">
                  {(['glass', 'chroma'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`settings-theme-opt${variant === v ? ' active' : ''}`}
                      onClick={() => setVariant(v)}
                    >
                      {v === 'chroma' ? 'Chroma' : 'Glass'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="search-hint" style={{ margin: 0 }}>
                {variant
                  ? `Pick the ${variant === 'glass' ? 'base' : 'secondary'} color the mutated frog had before it turned ${variant === 'glass' ? 'Glass' : 'Chroma'}.`
                  : 'Choose Glass or Chroma to begin.'}
              </p>
              {/* The mutated color's picker holds the lost frog's color, with the
                  fixed Glass/Chroma result shown beside it. */}
              <ComboBox
                label="Base Color"
                options={parentBaseOpts}
                presorted
                disabled={!variant}
                initialSelection={pLost.base}
                placeholder={variant === 'glass' ? 'Lost base color…' : undefined}
                prefix={variant === 'glass' && <span className="mutation-tag">Glass</span>}
                onSelect={o => setPLost(s => ({ ...s, base: o }))}
              />
              <ComboBox
                label="Secondary Color"
                options={parentSecOpts}
                presorted
                disabled={!variant}
                initialSelection={pLost.sec}
                placeholder={variant === 'chroma' ? 'Lost secondary color…' : undefined}
                prefix={variant === 'chroma' && <span className="mutation-tag">Chroma</span>}
                onSelect={o => setPLost(s => ({ ...s, sec: o }))}
              />
              <ComboBox
                label="Breed"
                options={parentBreedOpts}
                presorted
                disabled={!variant}
                initialSelection={pLost.breed}
                onSelect={o => setPLost(s => ({ ...s, breed: o }))}
              />
            </div>

            <div className="parent-group">
              <h2 className="parent-title">Screenshot</h2>
              <label
                className={`screenshot-drop${screenshotUrl ? ' has-image' : ''}`}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); acceptScreenshot(e.dataTransfer.files[0] ?? null); }}
              >
                <input
                  id="combo-shot"
                  ref={fileRef}
                  className="screenshot-input"
                  type="file"
                  accept={SCREENSHOT_TYPES.join(',')}
                  onChange={e => acceptScreenshot(e.target.files?.[0] ?? null)}
                />
                {screenshotUrl
                  ? <img src={screenshotUrl} alt="Selected screenshot" />
                  : <span>Click or drop a screenshot here</span>}
              </label>
              <p className="search-hint" style={{ margin: 0 }}>
                Please use original, uncropped images. Preferably tap the mutation to show its name.
              </p>
              {fileError && <p className="search-error" style={{ margin: 0 }}>{fileError}</p>}
            </div>
          </div>

          <div className="submit-extras">
            <div className="combobox-field">
              <label className="combobox-label" htmlFor="combo-source">Attribution link <span className="submit-optional">(optional)</span></label>
              <input
                id="combo-source"
                className="search-input"
                style={{ width: '100%' }}
                type="url"
                inputMode="url"
                value={sourceLink}
                placeholder="https://… link to Discord/Reddit/etc post"
                onChange={e => setSourceLink(e.target.value)}
              />
            </div>
            <div className="combobox-field">
              <label className="combobox-label" htmlFor="combo-version">Game version</label>
              <select
                id="combo-version"
                className="search-input"
                style={{ width: '100%' }}
                value={version?.id ?? ''}
                onChange={e => setVersionSel(e.target.value)}
              >
                {versions.map((v, i) => (
                  <option key={v.id} value={v.id}>{v.version}{i === 0 ? ' (latest)' : ''}</option>
                ))}
              </select>
              <p className="search-hint" style={{ marginTop: 4 }}>
                The version the mutation was found on, if it wasn't the current one.
              </p>
            </div>
          </div>

          {/* Only an invalid link is flagged live; anything else waits for a submit attempt. */}
          {!sourceValid ? (
            <p className="search-error">Attribution link is not a valid URL</p>
          ) : attempted && !resultReady ? (
            <p className="search-error">{missingMessage}</p>
          ) : null}

          <div className="submit-actions">
            {/* Not natively disabled (except for a bad link) so a press can explain what's missing. */}
            <button
              className={`submit-btn${canSubmit ? '' : ' is-disabled'}`}
              type="button"
              aria-disabled={!canSubmit}
              disabled={!sourceValid || submitting}
              onClick={() => canSubmit ? handleSubmit() : setAttempted(true)}
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </>
      )}

      {result && (
        <p className={result.ok ? 'submit-success' : 'search-error'}>{result.message}</p>
      )}
    </div>
  );
}
