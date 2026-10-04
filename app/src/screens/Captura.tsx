import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CLASS_IDS, type SeeResult } from '../engine/types';
import { getSimPlan, see, type SimOutcome } from '../engine/see';
import { buildSession } from '../engine/session';
import { captureAudioKey, type Rejection } from '../flow/captureAudio';
import { useFlow } from '../flow/FlowContext';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { Icon } from '../icons';
import { BigButton, Pill, Screen } from '../ui';

// Con 5 fotos ya se puede seguir; se pueden tomar más (hasta 30) para afinar el riesgo: con 8 o más hojas desaparece
// el aviso de pocas hojas y una foto mal clasificada pesa menos.
const MAX_PHOTOS = 30;
const TARGET_PHOTOS = 5;
const TAPS_FOR_MENU = 5;
const SIM_KEY = 'jani.sim';
const INFER_ERROR_MS = 4000;
/** Si la inferencia falla, la foto cuenta como dudosa (no se pide repetirla): con muchas, la sesión va a CONSULT. */
const INFER_FAILED: SeeResult = { status: 'unsure', reason: 'low_confidence' };
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
  const { card, segCard, cardError, reloadCard, photos, addPhoto, setSession } = useFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const taps = useRef(0);
  const [busy, setBusy] = useState(false);
  // Motivo del último rechazo y cuántos van: cada rechazo se vuelve a decir, aunque sea el mismo motivo.
  const [rejection, setRejection] = useState<{ key: Rejection; n: number } | null>(null);
  const [inferError, setInferError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setPlanTick] = useState(0);

  useEffect(() => {
    if (!inferError) return;
    const id = setTimeout(() => setInferError(false), INFER_ERROR_MS);
    return () => clearTimeout(id);
  }, [inferError]);

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
    try {
      let count = photos.length;
      for (const file of files) {
        if (count >= MAX_PHOTOS) break;
        const bitmap = await createImageBitmap(file);
        let result: SeeResult;
        try {
          result = await see(bitmap, card, { seg: segCard });
        } catch (err) {
          console.warn('see', err);
          result = INFER_FAILED;
          setInferError(true);
        } finally {
          bitmap.close();
        }
        if (result.status === 'unsure' && result.reason === 'bad_photo') {
          const key: Rejection = result.noLeaf ? 'no_leaf' : 'retake';
          setRejection((r) => ({ key, n: (r?.n ?? 0) + 1 }));
          continue;
        }
        setRejection(null);
        addPhoto({ url: URL.createObjectURL(file), result });
        count++;
      }
    } catch {
      // La imagen no se pudo leer: pedir otra foto.
      setRejection((r) => ({ key: 'retake', n: (r?.n ?? 0) + 1 }));
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    setSession(buildSession(photos.map((p) => p.result)));
    go('diagnostico');
  };

  const n = photos.length;
  const extras = photos.slice(TARGET_PHOTOS);
  return (
    <Screen
      id="captura"
      icon="camera"
      eyebrow={t('app_name')}
      title={t('t_photos')}
      onIconClick={onIconClick}
      audio={[captureAudioKey(n, TARGET_PHOTOS, rejection?.key ?? null)]}
      audioNonce={rejection?.n ?? 0}
      actions={
        <>
          <BigButton
            icon="camera"
            label={t(n === 0 ? 'take_photo' : 'more_photos')}
            testId="photo-btn"
            onClick={() => inputRef.current?.click()}
            variant="secondary"
            disabled={busy || !card || n >= MAX_PHOTOS}
          />
          <BigButton icon="check" label={t('done_photos')} testId="photos-done" onClick={done} disabled={n < 1 || busy} />
        </>
      }
    >
      {/* Progreso por segmentos: N de 5 y porcentaje; desde la 5.ª foto, N ✓. */}
      <div>
        <div className="progress-head">
          <span className="photo-count" data-testid="photo-count">
            {n < TARGET_PHOTOS ? `${n} / ${TARGET_PHOTOS}` : `${n} ✓`}
          </span>
          <span className="num" aria-hidden="true">
            {Math.min(100, Math.round((n / TARGET_PHOTOS) * 100))}%
          </span>
        </div>
        <div className="segments" aria-hidden="true">
          {Array.from({ length: TARGET_PHOTOS }, (_, i) => (
            <span key={i} className={`segment${i < n ? ' on' : ''}`} />
          ))}
        </div>
      </div>
      {rejection && (
        <p className="warn retake">
          <Icon name="alert" />
          <span>{t(rejection.key)}</span>
        </p>
      )}
      {inferError && (
        <div className="pack-error" data-testid="infer-error" aria-hidden="true">
          <div className="pack-error-icon">⚠️</div>
        </div>
      )}
      {cardError && (
        <div className="pack-error card" data-testid="card-error">
          <div className="pack-error-icon">⚠️</div>
          <p className="slot-name">{t('unsure')}</p>
          <BigButton icon="repeat" ariaLabel="🔄" testId="card-retry" variant="secondary" onClick={reloadCard} />
        </div>
      )}
      {/* Cinco ranuras (una hoja por planta); las fotos de más se cuentan abajo. */}
      {Array.from({ length: TARGET_PHOTOS }, (_, i) => {
        const p = photos[i];
        return (
          <div key={i} className={`slot${!p && i === n ? ' next' : ''}`}>
            <div className={`slot-thumb${p ? '' : ' empty'}`}>{p ? <img src={p.url} alt="" /> : <Icon name="plus" size={26} />}</div>
            <div className="slot-text">
              <p className="slot-name">
                {t('plant')} {i + 1}
              </p>
              {!p && i === n && <p className="slot-hint">{t('frame_leaf')}</p>}
            </div>
            {p && (
              <Pill tone="leaf" icon="check">
                {t('photo_ok')}
              </Pill>
            )}
          </div>
        );
      })}
      {extras.length > 0 && (
        <div className="extras" data-testid="photo-extras">
          <div className="extras-thumbs">
            {extras.slice(-4).map((p) => (
              <img key={p.url} src={p.url} alt="" />
            ))}
          </div>
          <span className="extras-count">+{extras.length}</span>
        </div>
      )}
      <div className="tip">
        <p className="tip-title">
          <Icon name="leaf" size={18} />
          {t('tip')}
        </p>
        <p>{t('zigzag')}</p>
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
      {simulated && menuOpen && (
        <div className="sim-menu" data-testid="sim-menu">
          <div className="sim-plan">{JSON.stringify(getSimPlan())}</div>
          {SIM_OUTCOMES.map((o) => (
            <button
              key={o}
              data-testid={`sim-${o}`}
              onClick={() => {
                appendSim(o);
                setPlanTick((k) => k + 1);
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
              setPlanTick((k) => k + 1);
            }}
          >
            🗑
          </button>
        </div>
      )}
    </Screen>
  );
}
