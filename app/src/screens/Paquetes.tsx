import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { fetchCatalog, installPackFromCatalog, installPackFromZip, PackError, type CatalogEntry } from '../packs/loader';
import { usePack } from '../packs/PackContext';
import type { Pack } from '../packs/schema';
import { climateFor, requestLocation, type ClimateChoice } from '../engine/rd/location';
import { AREA_DEFAULT_HA, AREA_MAX_HA, AREA_MIN_HA, AREA_STEP_HA, getLocation, setLocation } from '../store/settings';
import { Icon } from '../icons';
import { BigButton, Eyebrow, Screen } from '../ui';

export default function Paquetes() {
  const { pack, t, installed, activate, areaHa, setAreaHa } = usePack();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<number>(areaHa ?? AREA_DEFAULT_HA);
  const fileRef = useRef<HTMLInputElement>(null);
  const lang = pack?.language.code;

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (areaHa !== undefined) setArea(areaHa);
  }, [areaHa]);

  async function run(install: () => Promise<Pack>) {
    setBusy(true);
    setErrors(null);
    try {
      const p = await install();
      await activate(p.id);
    } catch (e) {
      const list = e instanceof PackError ? (e.errors.length ? e.errors : [e.code]) : [e instanceof Error ? e.message : String(e)];
      console.warn('pack', list);
      setErrors(list);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    await run(async () => installPackFromZip(new Uint8Array(await file.arrayBuffer())));
  }

  const step = (d: number) => setArea((a) => Math.min(AREA_MAX_HA, Math.max(AREA_MIN_HA, a + d)));
  const fmt = (n: number) => n.toLocaleString(lang);
  // Del catálogo: lo no instalado y lo instalado con otra versión (actualización).
  const available = catalog.flatMap((c) => {
    const inst = installed.find((p) => p.id === c.id);
    return !inst ? [{ c, update: false }] : inst.version !== c.version ? [{ c, update: true }] : [];
  });

  return (
    <Screen id="paquetes" icon="box" eyebrow={t('app_name')} title={t('packs')}>
      <section className="section">
        {pack && <Eyebrow>{t('sec_language')}</Eyebrow>}
        {installed.map((p) => (
          <div className="pack-row" key={p.id}>
            <BigButton
              testId={`pack-installed-${p.id}`}
              icon={p.id === pack?.id ? 'check' : 'globe'}
              label={p.language.name}
              variant={p.id === pack?.id ? 'primary' : 'secondary'}
              onClick={() => void (busy || run(() => Promise.resolve(p)))}
            />
          </div>
        ))}
        {available.map(({ c, update }) => (
          <div key={c.id} className="pack-row" data-testid={`pack-catalog-${c.id}`} data-update={update ? 'true' : undefined}>
            <BigButton
              testId={`pack-install-${c.id}`}
              icon={update ? 'repeat' : 'download'}
              label={`${t('install')} ${c.language.name}`.trim()}
              variant="secondary"
              onClick={() => void (busy || run(() => installPackFromCatalog(c)))}
            />
          </div>
        ))}
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept=".zip,application/zip"
          data-testid="pack-import-input"
          onChange={(e) => void onFile(e)}
        />
        <BigButton icon="folder" label={t('import_file')} variant="ghost" onClick={() => fileRef.current?.click()} />
        {errors && (
          // Criterio 3: los códigos técnicos no se muestran; quedan en data-errors y en la consola.
          <div data-testid="pack-error" className="pack-error" data-errors={JSON.stringify(errors)}>
            <div className="pack-error-icon">⚠️</div>
          </div>
        )}
      </section>
      {pack && (
        <>
          <section className="section">
            <Eyebrow>{t('sec_farm')}</Eyebrow>
            <div className="card">
              <p className="area-q">{t('ask_area')}</p>
              <div className="area-picker">
                <button className="round-btn" data-testid="area-minus" aria-label="−" onClick={() => step(-AREA_STEP_HA)}>
                  <Icon name="minus" size={28} />
                </button>
                <span className="area-value" data-testid="area-value">
                  {fmt(area)}
                </span>
                <button className="round-btn" data-testid="area-plus" aria-label="+" onClick={() => step(AREA_STEP_HA)}>
                  <Icon name="plus" size={28} />
                </button>
              </div>
              <BigButton testId="area-save" icon="check" label={t('save')} onClick={() => void setAreaHa(area)} />
            </div>
          </section>
          <LocationClimate />
        </>
      )}
    </Screen>
  );
}

/** "Usar mi ubicación para el clima": pide permiso, guarda la ubicación solo en el teléfono y muestra el punto de
 *  clima elegido (el más cercano del paquete). Sin permiso o lejos de todos los puntos, se usa el del paquete. */
function LocationClimate() {
  const { pack, t } = usePack();
  const [choice, setChoice] = useState<ClimateChoice | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const normals = pack?.climate_normals as Parameters<typeof climateFor>[0] | undefined;

  useEffect(() => {
    let alive = true;
    getLocation()
      .then((loc) => {
        if (alive && normals) setChoice(climateFor(normals, loc ? { lat: loc.lat, lon: loc.lon } : null)?.choice ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [normals]);

  const ask = async () => {
    setState('busy');
    try {
      const loc = await requestLocation();
      await setLocation({ ...loc, date: new Date().toISOString() });
      if (normals) setChoice(climateFor(normals, loc)?.choice ?? null);
      setState('idle');
    } catch (e) {
      console.warn('location', e);
      setState('error');
    }
  };

  if (!normals?.points?.length) return null;
  return (
    <section className="section">
      <Eyebrow>{t('sec_place')}</Eyebrow>
      <div className="card location-climate">
        <BigButton icon={state === 'busy' ? 'clock' : 'pin'} label={t('use_location')} variant="secondary" testId="use-location" onClick={() => void ask()} />
        {state === 'error' && (
          <div className="pack-error-icon" data-testid="location-error">
            ⚠️
          </div>
        )}
        {choice && (
          <p className="location-point" data-testid="climate-point" data-source={choice.source}>
            <Icon name={choice.source === 'gps' ? 'pin' : 'sun'} size={18} />
            <span>
              {t('climate_from')} {choice.name}
              {choice.km !== null ? ` (${choice.km.toLocaleString(pack?.language.code)} km)` : ''}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
