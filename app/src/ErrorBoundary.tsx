import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BigButton } from './ui';

type Props = { children: ReactNode; onHome: () => void };
type State = { failed: boolean };

/** Si una pantalla falla al dibujarse (p. ej. un paquete importado mal formado), muestra ⚠️ y ⌂ en vez de dejar la app en blanco. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn('screen', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen" data-screen="error" data-testid="screen-error">
        <div className="screen-body error-body">
          <div className="error-icon" aria-hidden="true">
            ⚠️
          </div>
          <BigButton
            icon="home"
            ariaLabel="⌂"
            testId="error-home"
            onClick={() => {
              this.setState({ failed: false });
              this.props.onHome();
            }}
          />
        </div>
      </main>
    );
  }
}
