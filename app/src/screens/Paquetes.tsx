import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { fetchCatalog, installPackFromCatalog, installPackFromZip, PackError, type CatalogEntry } from '../packs/loader';
import { usePack } from '../packs/PackContext';
import type { Pack } from '../packs/schema';
import { AREA_DEFAULT_HA, AREA_MAX_HA, AREA_MIN_HA, AREA_STEP_HA } from '../store/settings';
import { BigButton, Screen } from '../ui';

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
      setErrors(e instanceof PackError ? (e.errors.length ? e.errors : [e.code]) : [e instanceof Error ? e.message : String(e)]);
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
  const available = catalog.filter((c) => !installed.some((p) => p.id === c.id));

  return (
    <Screen id="paquetes" icon="📦" title={t('packs')}>
      {installed.map((p) => (
        <BigButton
          key={p.id}
          testId={`pack-installed-${p.id}`}
          icon={p.id === pack?.id ? '✅' : '📦'}
          label={p.language.name}
          variant={p.id === pack?.id ? 'primary' : 'secondary'}
          onClick={() => void activate(p.id)}
        />
      ))}
      {available.map((c) => (
        <div key={c.id} data-testid={`pack-catalog-${c.id}`}>
          <BigButton
            testId={`pack-install-${c.id}`}
            icon="⬇️"
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
      <BigButton icon="📁" label={t('import_file')} variant="secondary" onClick={() => fileRef.current?.click()} />
      {errors && (
        <div data-testid="pack-error" className="pack-error">
          <div className="pack-error-icon">⚠️</div>
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      {pack && (
        <>
          <p className="question">{t('ask_area')}</p>
          <div className="area-picker">
            <button className="icon-btn" data-testid="area-minus" aria-label="−" onClick={() => step(-AREA_STEP_HA)}>
              −
            </button>
            <span className="area-value" data-testid="area-value">
              {fmt(area)}
            </span>
            <button className="icon-btn" data-testid="area-plus" aria-label="+" onClick={() => step(AREA_STEP_HA)}>
              +
            </button>
          </div>
          <BigButton testId="area-save" icon="✅" onClick={() => void setAreaHa(area)} />
        </>
      )}
    </Screen>
  );
}
