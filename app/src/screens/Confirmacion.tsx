import { buildCaseSummary, canSendCase, smsHref } from '../engine/sms';
import { useFlow } from '../flow/FlowContext';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { markSent } from '../store/cases';
import { BigButton, Screen } from '../ui';

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
    <Screen id="confirmacion" icon="✅" title={t('saved')} audio={['saved']}>
      {canSend && <BigButton icon="📨" label={t('send_case')} testId="send-case" variant="secondary" onClick={() => void send()} />}
      <BigButton icon="⌂" onClick={() => go('inicio')} />
    </Screen>
  );
}
