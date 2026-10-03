import { buildCaseSummary, smsHref } from '../engine/sms';
import { useFlow } from '../flow/FlowContext';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { markSent } from '../store/cases';
import { BigButton, Screen } from '../ui';

export default function Confirmacion() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { savedCase, setSavedCase } = useFlow();

  const high = savedCase?.risk?.level === 'HIGH';
  const canSend = !!savedCase && !!pack && (savedCase.choice === 'CONSULT' || high);

  const send = async () => {
    if (!savedCase || !pack) return;
    const text = buildCaseSummary(savedCase, pack);
    const phone = pack.backup_contact.phone;
    if (phone) {
      await markSent(savedCase.id);
      setSavedCase({ ...savedCase, sent: true });
      location.href = smsHref(phone, text);
    } else if (typeof navigator.share === 'function') {
      await navigator.share({ text }).catch(() => undefined);
      await markSent(savedCase.id);
      setSavedCase({ ...savedCase, sent: true });
    }
  };

  return (
    <Screen id="confirmacion" icon="✅" title={t('saved')} audio={['saved']}>
      {canSend && <BigButton icon="📨" label={t('send_case')} testId="send-case" variant="secondary" onClick={() => void send()} />}
      <BigButton icon="⌂" onClick={() => go('inicio')} />
    </Screen>
  );
}
