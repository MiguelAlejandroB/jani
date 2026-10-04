import { buildCaseSummary, canSendCase, outcomeKey, smsHref } from '../engine/sms';
import { useFlow } from '../flow/FlowContext';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { markSent } from '../store/cases';
import { Icon } from '../icons';
import { BigButton, Eyebrow, Screen } from '../ui';

export default function Confirmacion() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { savedCase, setSavedCase } = useFlow();

  const canSend = !!savedCase && !!pack && canSendCase(savedCase);

  const send = async () => {
    if (!savedCase || !pack) return;
    const text = buildCaseSummary(savedCase, pack);
    const phone = pack.backup_contact.phone;
    const sent = async () => {
      try {
        await markSent(savedCase.id);
      } catch (e) {
        console.warn('markSent', e);
      }
      setSavedCase({ ...savedCase, sent: true });
    };
    if (!phone && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
      } catch {
        // Cancelado o rechazado: no se marca como enviado.
        return;
      }
      await sent();
      return;
    }
    // Con número, o sin número ni `navigator.share` (WebView): sms: abre la app de mensajes (solo texto).
    await sent();
    location.href = smsHref(phone, text);
  };

  return (
    <Screen
      id="confirmacion"
      icon="check"
      eyebrow={t('t_decision')}
      title={t('saved')}
      audio={['saved']}
      actions={
        <>
          {canSend && <BigButton icon="message" label={t('send_case')} testId="send-case" variant="secondary" onClick={() => void send()} />}
          <BigButton icon="home" label={t('go_home')} onClick={() => go('inicio')} />
        </>
      }
    >
      {/* Tarjeta de recomendación: el resumen del caso guardado (resultado y elección). */}
      <section className="reco fade-rise" data-testid="saved-summary">
        <span className="reco-check" aria-hidden="true">
          <Icon name="check" size={30} strokeWidth={2.4} />
        </span>
        {savedCase && (
          <>
            <Eyebrow tone="leaf">{new Date(savedCase.date).toLocaleDateString(pack?.language.code)}</Eyebrow>
            <p className="reco-text">{t(outcomeKey(savedCase))}</p>
            {savedCase.choice && (
              <p className="reco-line">
                <Icon name="check" size={18} />
                {t(`opt_${savedCase.choice.toLowerCase()}`)}
              </p>
            )}
            {savedCase.sent && (
              <p className="reco-line">
                <Icon name="message" size={18} />
                {t('sent')}
              </p>
            )}
          </>
        )}
      </section>
    </Screen>
  );
}
