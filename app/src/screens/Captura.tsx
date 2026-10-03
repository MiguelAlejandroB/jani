import { useRef, useState, type ChangeEvent } from 'react';
import { CLASS_IDS } from '../engine/types';
import { getSimPlan, see, type SimOutcome } from '../engine/see';
import { buildSession } from '../engine/session';
import { useFlow } from '../flow/FlowContext';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, Screen } from '../ui';

const MAX_PHOTOS = 10;
const TARGET_PHOTOS = 5;
const TAPS_FOR_MENU = 5;
const SIM_KEY = 'jani.sim';
const SIM_OUTCOMES: readonly SimOutcome[] = [...CLASS_IDS, 'low_confidence', 'low_margin', 'bad_photo'];

function appendSim(outcome: SimOutcome): void {
  try {
    const current = localStorage.getItem(SIM_KEY) ? getSimPlan() : [];
    localStorage.setItem(SIM_KEY, JSON.stringify([...current, outcome]));
  } catch {
    // sin localStorage: el menú de pruebas no puede guardar
  }
}

export default function Captura() {
  const { t } = usePack();
  const { go } = useNav();
  const { card, photos, addPhoto, setSession } = useFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const taps = useRef(0);
  const [busy, setBusy] = useState(false);
  const [retake, setRetake] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setPlanTick] = useState(0);

  const simulated = card !== null && card.recommended_file === null;
  const onIconClick = () => {
    if (!simulated) return;
    taps.current += 1;
    if (taps.current >= TAPS_FOR_MENU) {
      taps.current = 0;
      setMenuOpen((o) => !o);
    }
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!card || files.length === 0) return;
    setBusy(true);
    setRetake(false);
    try {
      let count = photos.length;
      for (const file of files) {
        if (count >= MAX_PHOTOS) break;
        const bitmap = await createImageBitmap(file);
        const result = await see(bitmap, card);
        bitmap.close();
        if (result.status === 'unsure' && result.reason === 'bad_photo') {
          setRetake(true);
          continue;
        }
        addPhoto({ url: URL.createObjectURL(file), result });
        count++;
      }
    } catch {
      setRetake(true);
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    setSession(buildSession(photos.map((p) => p.result)));
    go('diagnostico');
  };

  return (
    <Screen id="captura" icon="📷" onIconClick={onIconClick}>
      <div className="photo-count" data-testid="photo-count">
        {photos.length} / {TARGET_PHOTOS}
      </div>
      {retake && <p className="retake">{t('retake')}</p>}
      <div className="thumbs">
        {photos.map((p) => (
          <div className="thumb" key={p.url}>
            <img src={p.url} alt="" />
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="photo-input"
        onChange={(e) => void onFiles(e)}
      />
      <BigButton
        icon="📷"
        label={t('more_photos')}
        testId="photo-btn"
        onClick={() => inputRef.current?.click()}
        variant="secondary"
        disabled={busy || !card || photos.length >= MAX_PHOTOS}
      />
      <BigButton icon="✅" label={t('done_photos')} testId="photos-done" onClick={done} disabled={photos.length < 1 || busy} />
      {simulated && menuOpen && (
        <div className="sim-menu" data-testid="sim-menu">
          <div className="sim-plan">{JSON.stringify(getSimPlan())}</div>
          {SIM_OUTCOMES.map((o) => (
            <button
              key={o}
              data-testid={`sim-${o}`}
              onClick={() => {
                appendSim(o);
                setPlanTick((n) => n + 1);
              }}
            >
              {o}
            </button>
          ))}
          <button
            data-testid="sim-clear"
            aria-label="🗑"
            onClick={() => {
              try {
                localStorage.removeItem(SIM_KEY);
              } catch {
                // nada
              }
              setPlanTick((n) => n + 1);
            }}
          >
            🗑
          </button>
        </div>
      )}
    </Screen>
  );
}
