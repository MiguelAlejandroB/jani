import { useEffect, useState } from 'react';
import { useNav } from '../nav';
import { useFlow } from '../flow/FlowContext';
import { usePack } from '../packs/PackContext';
import { listCases } from '../store/cases';
import { Icon } from '../icons';
import { BigButton, Eyebrow, Pill, Screen } from '../ui';

const HERO = `${import.meta.env.BASE_URL}leaf-hero.webp`;

export default function Inicio() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { startReview } = useFlow();
  // Casos guardados en el teléfono (los mismos de Pendientes): solo para el chip del encabezado.
  const [cases, setCases] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    listCases()
      .then((l) => alive && setCases(l.length))
      .catch(() => alive && setCases(null));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Screen
      id="inicio"
      audio={['welcome']}
      chips={
        <>
          {/* El modelo corre en el teléfono: la app siempre funciona sin conexión. */}
          <Pill tone="clay" dot>
            {t('works_offline')}
          </Pill>
          {pack && (
            <Pill tone="leaf" icon="globe" testId="active-lang">
              {pack.language.name}
            </Pill>
          )}
          {cases !== null && cases > 0 && (
            <Pill tone="neutral" icon="cases">
              <span className="num">{cases}</span> {t('pending')}
            </Pill>
          )}
        </>
      }
      actions={
        <BigButton
          icon="camera"
          label={t('start_check')}
          testId="start-review"
          onClick={() => {
            startReview();
            go('captura');
          }}
        />
      }
    >
      <h1 className="hero-title">{t('welcome')}</h1>
      <div className="hero">
        <span className="hero-glow" aria-hidden="true" />
        <span className="hero-glow sun" aria-hidden="true" />
        <div className="hero-frame">
          <img src={HERO} alt="" width={720} height={900} decoding="async" />
        </div>
        <div className="hero-card fade-rise">
          <Eyebrow tone="leaf">
            <Icon name="shield" size={13} /> {t('app_name')}
          </Eyebrow>
          <p className="hero-card-text">{t('privacy')}</p>
        </div>
      </div>
    </Screen>
  );
}
